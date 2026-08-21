/**
 * TEMP local eval runner — mirrors the Admin → AI Eval flow (Mastra primary +
 * legacy shadow + comparison rows) but driven from this machine using the
 * production DB and operator API keys. Not committed; deleted after use.
 *
 * Usage:
 *   ONLY=x01 pnpm exec tsx scripts/eval-run-local.ts   # single prompt smoke test
 *   pnpm exec tsx scripts/eval-run-local.ts            # all 30 prompts
 */

import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { getDb, schema, createThread, getUserWithSettings, recordAiShadowComparison } from '@kestrel/db';
import { runXauusdMastra } from '../src/mastra/run';
import { runChat } from '../src/agent';
import { consumeUIMessageStream, estimateCostUsd } from '../src/index';
import type { UIMessage } from 'ai';
import { AI_EVAL_PROMPTS } from '../../../apps/web/src/lib/ai-eval-prompts';

const MASTRA_TIMEOUT_MS = 55_000;
const LEGACY_TIMEOUT_MS = 30_000;
const SPACING_MS = Number(process.env.EVAL_SPACING_MS ?? 60_000);
// Quota-safe by default: rate-limit failures are recorded immediately. Set
// EVAL_MAX_ATTEMPTS explicitly only when a human is intentionally approving
// additional provider calls.
const MAX_ATTEMPTS = Number(process.env.EVAL_MAX_ATTEMPTS ?? 1);

type OverlapBucket = 'none' | 'low' | 'medium' | 'high';

function overlapBucket(ratio: number): OverlapBucket {
  if (ratio === 0) return 'none';
  if (ratio < 0.2) return 'low';
  if (ratio < 0.5) return 'medium';
  return 'high';
}

function normalizedTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((token) => token.length >= 3)
      ?? [],
  );
}

function sharedTokenRatio(legacyText: string, mastraText: string): number {
  const legacyTokens = normalizedTokens(legacyText);
  const mastraTokens = normalizedTokens(mastraText);
  const shared = [...legacyTokens].filter((token) => mastraTokens.has(token)).length;
  const denominator = Math.max(1, Math.min(legacyTokens.size, mastraTokens.size));
  return Number((shared / denominator).toFixed(4));
}

function promptHash(prompt: string): string {
  return createHash('sha256').update(prompt, 'utf8').digest('hex');
}

function isRateLimit(err: unknown): boolean {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return /429|Too Many Requests|RESOURCE_EXHAUSTED|rate limit|quota/i.test(message);
}

function isVerificationFailure(err: unknown): boolean {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return /verification|Structured output validation/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; reason: string }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return { ok: true, value: await fn() };
    } catch (err) {
      lastError = err;
      const rateLimited = isRateLimit(err);
      const verificationFailed = isVerificationFailure(err);
      if (attempt < MAX_ATTEMPTS && (rateLimited || verificationFailed)) {
        const backoff = rateLimited ? 45_000 * attempt : 10_000;
        console.log(`[EVAL] ${label} ${rateLimited ? 'rate-limited' : 'verification-failed'} (attempt ${attempt}/${MAX_ATTEMPTS}) — retrying in ${backoff / 1000}s`);
        await sleep(backoff);
        continue;
      }
      const reason = rateLimited ? 'rate-limit' : err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'run';
      const findings = (err as { findings?: readonly string[] }).findings;
      const detail = findings ? ` [${findings.join(' | ').slice(0, 400)}]` : '';
      console.log(`[EVAL] ${label} failed (attempt ${attempt}): ${err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200)}${detail}`);
      return { ok: false, reason };
    }
  }
  return { ok: false, reason: lastError instanceof Error && isRateLimit(lastError) ? 'rate-limit' : 'run' };
}

export async function runPrompt(index: number, total: number, prompt: string, userId: string): Promise<'ok' | 'failed'> {
  const startedAt = Date.now();
  console.log(`[EVAL] [${index}/${total}] ${prompt.slice(0, 60)}…`);

  const { settings } = await getUserWithSettings(userId);
  if (!settings) {
    console.log(`[EVAL] [${index}/${total}] SKIPPED — no settings`);
    return 'failed';
  }

  const thread = await createThread({ userId, title: `Eval ${index}`, analysisMode: 'single' });
  const threadId = thread.id;
  const runId = `local-${randomUUID()}`;

  // Use process.env directly: protected Vercel secrets (AUTH/ENCRYPTION) are
  // unavailable here, and the resolvers tolerate that by falling back to the
  // operator env keys (GOOGLE_GENERATIVE_AI_API_KEY) set on the command line.
  // MAX_DAILY_USD is dropped because the raw env file holds it as an
  // unvalidated string and the budget guard calls .toFixed() on it (production
  // passes a zod-coerced number via getServerEnv()).
  const env: Record<string, string | undefined> = { ...process.env };
  delete env.MAX_DAILY_USD;

  // 1. Mastra primary.
  const mastraStart = Date.now();
  const mastra = await withRetry('mastra', () =>
    runXauusdMastra({
      prompt,
      userId,
      threadId,
      runId,
      settings,
      env,
      signal: AbortSignal.timeout(MASTRA_TIMEOUT_MS),
      telemetryKind: 'mastra_xauusd_poc',
    }),
  );
  const mastraLatencyMs = Date.now() - mastraStart;
  const mastraText = mastra.ok ? mastra.value.result.text : '';
  const report = mastra.ok ? mastra.value.report : null;
  const mastraCostUsd = mastra.ok
    ? (mastra.value as { observedCost?: number }).observedCost
      ?? estimateCostUsd(mastra.value.modelId, mastra.value.stats.inputTokens, mastra.value.stats.outputTokens)
    : null;

  if (!mastra.ok) {
    await recordAiShadowComparison({
      userId,
      threadId,
      promptSha256: promptHash(prompt),
      primaryAgent: 'mastra',
      outcome: 'failed',
      failureReason: mastra.reason,
      primaryLatencyMs: mastraLatencyMs,
    }).catch((err) => console.log(`[EVAL] comparison persist failed: ${String(err).slice(0, 120)}`));
    console.log(`[EVAL] [${index}/${total}] mastra FAILED (${mastra.reason}) — comparison row recorded`);
    return 'failed';
  }

  console.log(
    `[EVAL] [${index}/${total}] mastra OK (${mastraLatencyMs}ms) model=${mastra.value.modelId} verified=${report !== null} bias=${report?.bias ?? 'n/a'} quality=${report?.dataQuality ?? 'n/a'}`,
  );

  // 2. Legacy shadow.
  const userMessage: UIMessage = {
    id: `local-${randomUUID()}`,
    role: 'user',
    parts: [{ type: 'text', text: prompt }],
  };
  const legacyStart = Date.now();
  const legacy = await withRetry('legacy-shadow', async () => {
    const legacyRun = await runChat({
      userId,
      threadId,
      userMessage,
      env,
      persistMessages: false,
      telemetryKind: 'legacy_shadow',
      excludeMessageIdempotencyKeys: [`mastra:${threadId}:${userMessage.id}:assistant`],
      signal: AbortSignal.timeout(LEGACY_TIMEOUT_MS),
    });
    const streamed = await consumeUIMessageStream(legacyRun.toUIMessageStreamResponse());
    if (streamed.errors.length > 0) {
      throw new Error(`legacy shadow stream reported an error: ${streamed.errors.map((e) => String(e?.message ?? e)).join(' | ').slice(0, 300)}`);
    }
    return streamed.text;
  });
  const legacyLatencyMs = Date.now() - legacyStart;

  if (!legacy.ok) {
    await recordAiShadowComparison({
      userId,
      threadId,
      promptSha256: promptHash(prompt),
      primaryAgent: 'mastra',
      outcome: 'failed',
      failureReason: legacy.reason,
      primaryLatencyMs: mastraLatencyMs,
      primaryCostUsd: mastraCostUsd,
      shadowLatencyMs: legacyLatencyMs,
    }).catch(() => undefined);
    console.log(`[EVAL] [${index}/${total}] legacy shadow FAILED (${legacy.reason}) — comparison row recorded`);
    return 'failed';
  }

  // 3. Compare + persist.
  const ratio = sharedTokenRatio(legacy.value, mastraText);
  const comparison = {
    legacyChars: legacy.value.length,
    mastraChars: mastraText.length,
    sharedTokenRatio: ratio,
    overlap: overlapBucket(ratio),
    mastraVerified: report !== null,
    mastraBias: report?.bias ?? null,
    mastraDataQuality: report?.dataQuality ?? null,
  };
  const shadowCostUsd = mastra.ok ? mastraCostUsd : null;
  await recordAiShadowComparison({
    userId,
    threadId,
    promptSha256: promptHash(prompt),
    primaryAgent: 'mastra',
    outcome: 'completed',
    legacyChars: comparison.legacyChars,
    mastraChars: comparison.mastraChars,
    sharedTokenRatio: comparison.sharedTokenRatio,
    overlap: comparison.overlap,
    mastraVerified: comparison.mastraVerified,
    mastraBias: comparison.mastraBias,
    mastraDataQuality: comparison.mastraDataQuality,
    primaryLatencyMs: mastraLatencyMs,
    shadowLatencyMs: legacyLatencyMs,
    primaryCostUsd: mastraCostUsd,
    shadowCostUsd,
  }).catch((err) => console.log(`[EVAL] comparison persist failed: ${String(err).slice(0, 120)}`));

  console.log(
    `[EVAL] [${index}/${total}] DONE total=${Date.now() - startedAt}ms legacy=${legacyLatencyMs}ms overlap=${ratio} verified=${report !== null}`,
  );
  return 'ok';
}

async function main(): Promise<void> {
  const db = getDb();
  const rows = await db.select().from(schema.users);
  const user = rows.find((u) => u.id !== '__system__' && !(u.email ?? '').endsWith('@localhost')) ?? rows[0];
  if (!user) {
    console.log('[EVAL] no users found in DB');
    process.exit(1);
  }
  console.log(`[EVAL] running as user ${user.id} (${user.email ?? 'no email'})`);

  const only = process.env.ONLY;
  const onlyIds = only ? new Set(only.split(',').map((s) => s.trim())) : null;
  const prompts = onlyIds
    ? AI_EVAL_PROMPTS.filter((p) => onlyIds.has(p.id))
    : [...AI_EVAL_PROMPTS];
  console.log(`[EVAL] ${prompts.length} prompts to run`);

  let completed = 0;
  let failed = 0;
  for (let i = 0; i < prompts.length; i += 1) {
    const prompt = prompts[i]!;
    const outcome = await runPrompt(i + 1, prompts.length, prompt.prompt, user.id);
    if (outcome === 'ok') completed += 1;
    else failed += 1;
    if (i < prompts.length - 1) {
      console.log(`[EVAL] spacing ${SPACING_MS / 1000}s…`);
      await sleep(SPACING_MS);
    }
  }
  console.log(`[EVAL] FINISHED — completed=${completed} failed=${failed}`);
  process.exit(0);
}

if (process.argv[1]?.endsWith('eval-run-local.ts')) {
  main().catch((err) => {
    console.log(`[EVAL] FATAL: ${err instanceof Error ? err.stack : String(err)}`);
    process.exitCode = 1;
  });
}
