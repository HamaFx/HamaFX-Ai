// Eval harness — POSTs each acceptance prompt in `prompts.json` to a running
// `/api/chat` endpoint, captures the streamed assistant output and tool-call
// trace via `parse-stream.ts`, and writes a markdown report to
// `<outDir>/<UTC-timestamp>.md`.
//
// Designed to run via `tsx packages/ai/src/eval/runner.ts ...`. Independent
// of the rest of `@hamafx/ai` (no AI Gateway, DB, or zod imports) so it can
// boot without the full package.
//
// CLI:
//   tsx packages/ai/src/eval/runner.ts \
//     --base-url http://localhost:3000 \
//     --cookie "hfx_auth=..." \
//     --out docs/eval \
//     --timeout 120000

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { consumeUIMessageStream, type ParsedToolCall } from './parse-stream';

// --- types -----------------------------------------------------------------

export interface RunEvalsArgs {
  /** Base URL the harness will POST to, e.g. `http://localhost:3000`. */
  baseUrl: string;
  /** Full `Cookie` header value, e.g. `hfx_auth=...`. */
  cookie: string;
  /** Directory the markdown report is written into. Created if missing. */
  outDir: string;
  /** Optional override for the prompts file. Defaults to `./prompts.json`. */
  promptsPath?: string;
  /** Per-prompt abort timeout in ms. Defaults to 120_000. */
  timeoutMs?: number;
  /** Optional progress sink. Defaults to `console.log`. */
  onProgress?: (line: string) => void;
}

export interface PromptDef {
  id: string;
  prompt: string;
  /** Phase 7c — tool-trace assertions. Optional; when present the runner
   *  evaluates them and surfaces pass/fail in the report.
   *  - `expectedTools`: every tool listed must appear in the trace.
   *  - `forbiddenTools`: none of these tools may appear in the trace.
   *  - `mustContainSubstrings`: each substring (case-insensitive) must
   *     appear in the streamed assistant text.
   */
  expectedTools?: string[];
  forbiddenTools?: string[];
  mustContainSubstrings?: string[];
}

export interface AssertionFailure {
  kind: 'missing_tool' | 'forbidden_tool' | 'missing_substring';
  detail: string;
}

export interface PromptResult {
  id: string;
  prompt: string;
  ttftMs: number | null;
  totalMs: number;
  text: string;
  toolCalls: ParsedToolCall[];
  ok: boolean;
  error?: string;
  /**
   * Phase 7c — assertion failures collected from the case definition. The
   * `ok` flag remains driven by transport / parse failures; assertion
   * failures are reported separately so we don't conflate "the model
   * crashed" with "the model picked a different tool".
   */
  assertions?: AssertionFailure[];
}

export interface RunEvalsResult {
  results: PromptResult[];
  reportPath: string;
}

// --- public API ------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_OUT_DIR = 'docs/eval';

export async function runEvals(args: RunEvalsArgs): Promise<RunEvalsResult> {
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const promptsPath = args.promptsPath ?? defaultPromptsPath();
  const log = args.onProgress ?? ((line: string): void => console.info(line));

  const prompts = await loadPrompts(promptsPath);
  const total = prompts.length;
  const results: PromptResult[] = [];

  for (let i = 0; i < total; i++) {
    const prompt = prompts[i];
    if (!prompt) continue;
    const result = await runOnePrompt({
      prompt,
      baseUrl: args.baseUrl,
      cookie: args.cookie,
      timeoutMs,
    });
    if (result.ok && (prompt.expectedTools || prompt.forbiddenTools || prompt.mustContainSubstrings)) {
      result.assertions = evaluateAssertions(prompt, result);
    }
    results.push(result);
    const failedAssertions = result.assertions?.length ?? 0;
    const tag = !result.ok
      ? 'FAIL'
      : failedAssertions > 0
        ? `OK (${failedAssertions} assertion fail${failedAssertions === 1 ? '' : 's'})`
        : 'OK';
    log(`[${i + 1}/${total}] ${prompt.id} ${result.totalMs}ms ${tag}`);
  }

  const reportPath = await writeReport({
    outDir: args.outDir,
    baseUrl: args.baseUrl,
    results,
  });

  return { results, reportPath };
}

// --- per-prompt fetch ------------------------------------------------------

interface RunOnePromptArgs {
  prompt: PromptDef;
  baseUrl: string;
  cookie: string;
  timeoutMs: number;
}

async function runOnePrompt(args: RunOnePromptArgs): Promise<PromptResult> {
  const { prompt, baseUrl, cookie, timeoutMs } = args;
  const messageId = randomUUID();

  // Create a fresh thread first so the FK from chat_messages.thread_id is
  // satisfied. Sending an arbitrary UUID straight to /api/chat would 500
  // because the foreign key references chat_threads(id).
  let threadId: string;
  try {
    threadId = await createThread({ baseUrl, cookie, timeoutMs });
  } catch (err) {
    return {
      id: prompt.id,
      prompt: prompt.prompt,
      ttftMs: null,
      totalMs: 0,
      text: '',
      toolCalls: [],
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // The /api/chat route validates with zod:
  //   { threadId: uuid, messages: [{ id, role, parts: unknown[] }, ...] }
  // and treats the last message as the user's turn.
  const body = JSON.stringify({
    threadId,
    messages: [
      {
        id: messageId,
        role: 'user',
        parts: [{ type: 'text', text: prompt.prompt }],
      },
    ],
  });

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  const startedAt = Date.now();
  const startedAtMono = performance.now();

  try {
    const response = await fetch(`${trimTrailingSlash(baseUrl)}/api/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
        cookie,
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await safeReadText(response);
      const totalMs = Math.round(performance.now() - startedAtMono);
      return {
        id: prompt.id,
        prompt: prompt.prompt,
        ttftMs: null,
        totalMs,
        text: '',
        toolCalls: [],
        ok: false,
        error: `HTTP ${response.status} ${response.statusText}${text ? `: ${text.slice(0, 500)}` : ''}`,
      };
    }

    const parsed = await consumeUIMessageStream(response, { startedAt });
    if (parsed.errors.length > 0) {
      return {
        id: prompt.id,
        prompt: prompt.prompt,
        ttftMs: parsed.ttftMs,
        totalMs: parsed.totalMs,
        text: parsed.text,
        toolCalls: parsed.toolCalls,
        ok: false,
        error: `stream error: ${parsed.errors.join('; ')}`,
      };
    }
    return {
      id: prompt.id,
      prompt: prompt.prompt,
      ttftMs: parsed.ttftMs,
      totalMs: parsed.totalMs,
      text: parsed.text,
      toolCalls: parsed.toolCalls,
      ok: true,
    };
  } catch (err) {
    const totalMs = Math.round(performance.now() - startedAtMono);
    const aborted = controller.signal.aborted;
    const message = aborted
      ? `timeout after ${timeoutMs}ms`
      : err instanceof Error
        ? err.message
        : String(err);
    return {
      id: prompt.id,
      prompt: prompt.prompt,
      ttftMs: null,
      totalMs,
      text: '',
      toolCalls: [],
      ok: false,
      error: message,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

interface CreateThreadArgs {
  baseUrl: string;
  cookie: string;
  timeoutMs: number;
}

async function createThread(args: CreateThreadArgs): Promise<string> {
  const { baseUrl, cookie, timeoutMs } = args;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${trimTrailingSlash(baseUrl)}/api/chat/threads`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: '{}',
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await safeReadText(response);
      throw new Error(
        `failed to create thread: HTTP ${response.status} ${response.statusText}${
          text ? `: ${text.slice(0, 500)}` : ''
        }`,
      );
    }
    const json = (await response.json()) as { thread?: { id?: unknown } };
    const id = json.thread?.id;
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('thread create returned no id');
    }
    return id;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// --- prompt loading --------------------------------------------------------

function defaultPromptsPath(): string {
  return fileURLToPath(new URL('./prompts.json', import.meta.url));
}

async function loadPrompts(path: string): Promise<PromptDef[]> {
  const raw = await readFile(path, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`prompts file ${path} must be a JSON array`);
  }
  const out: PromptDef[] = [];
  for (const item of parsed) {
    if (
      typeof item === 'object' &&
      item !== null &&
      'id' in item &&
      'prompt' in item &&
      typeof (item as { id: unknown }).id === 'string' &&
      typeof (item as { prompt: unknown }).prompt === 'string'
    ) {
      const obj = item as {
        id: string;
        prompt: string;
        expectedTools?: unknown;
        forbiddenTools?: unknown;
        mustContainSubstrings?: unknown;
      };
      const def: PromptDef = { id: obj.id, prompt: obj.prompt };
      if (Array.isArray(obj.expectedTools)) {
        def.expectedTools = obj.expectedTools.filter((s): s is string => typeof s === 'string');
      }
      if (Array.isArray(obj.forbiddenTools)) {
        def.forbiddenTools = obj.forbiddenTools.filter((s): s is string => typeof s === 'string');
      }
      if (Array.isArray(obj.mustContainSubstrings)) {
        def.mustContainSubstrings = obj.mustContainSubstrings.filter(
          (s): s is string => typeof s === 'string',
        );
      }
      out.push(def);
    } else {
      throw new Error(`prompts file ${path} contains an entry without {id, prompt}`);
    }
  }
  if (out.length === 0) {
    throw new Error(`prompts file ${path} is empty`);
  }
  return out;
}

// --- assertion evaluation --------------------------------------------------

function evaluateAssertions(prompt: PromptDef, result: PromptResult): AssertionFailure[] {
  const failures: AssertionFailure[] = [];
  const calledTools = new Set(result.toolCalls.map((t) => t.name));
  for (const t of prompt.expectedTools ?? []) {
    if (!calledTools.has(t)) {
      failures.push({ kind: 'missing_tool', detail: t });
    }
  }
  for (const t of prompt.forbiddenTools ?? []) {
    if (calledTools.has(t)) {
      failures.push({ kind: 'forbidden_tool', detail: t });
    }
  }
  const lowerText = result.text.toLowerCase();
  for (const sub of prompt.mustContainSubstrings ?? []) {
    if (!lowerText.includes(sub.toLowerCase())) {
      failures.push({ kind: 'missing_substring', detail: sub });
    }
  }
  return failures;
}

// --- report writing --------------------------------------------------------

interface WriteReportArgs {
  outDir: string;
  baseUrl: string;
  results: PromptResult[];
}

const MAX_OUTPUT_CHARS = 2000;

async function writeReport(args: WriteReportArgs): Promise<string> {
  const { outDir, baseUrl, results } = args;
  const stamp = utcStamp(new Date());
  const reportPath = isAbsolute(outDir)
    ? resolve(outDir, `${stamp}.md`)
    : resolve(process.cwd(), outDir, `${stamp}.md`);

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, buildMarkdown({ baseUrl, results, stamp }), 'utf-8');
  return reportPath;
}

interface BuildMarkdownArgs {
  baseUrl: string;
  results: PromptResult[];
  stamp: string;
}

function buildMarkdown(args: BuildMarkdownArgs): string {
  const { baseUrl, results, stamp } = args;
  const total = results.length;
  const failed = results.filter((r) => !r.ok).length;
  const ok = total - failed;
  const assertionsClean = results.filter((r) => r.ok && (!r.assertions || r.assertions.length === 0)).length;
  const assertionsDirty = ok - assertionsClean;
  const ttftValues = results.filter((r) => r.ttftMs !== null).map((r) => r.ttftMs as number);
  const avgTtft = ttftValues.length > 0 ? Math.round(avg(ttftValues)) : null;
  const avgTotal = total > 0 ? Math.round(avg(results.map((r) => r.totalMs))) : null;

  const lines: string[] = [];
  lines.push(`# Eval Report — ${stamp}`);
  lines.push('');
  lines.push(`- Base URL: \`${baseUrl}\``);
  lines.push(`- Prompts run: ${total}`);
  lines.push(`- Succeeded: ${ok}`);
  lines.push(`- Failed: ${failed}`);
  lines.push(`- Assertion clean: ${assertionsClean}/${ok}`);
  if (assertionsDirty > 0) {
    lines.push(`- Assertion failures: ${assertionsDirty}`);
  }
  lines.push(`- Avg TTFT: ${avgTtft === null ? 'n/a' : `${avgTtft}ms`}`);
  lines.push(`- Avg total: ${avgTotal === null ? 'n/a' : `${avgTotal}ms`}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r) continue;
    lines.push(`## ${i + 1}. ${r.id}${r.ok ? '' : ' — FAILED'}`);
    lines.push('');
    lines.push('**Prompt**');
    lines.push('');
    lines.push('```text');
    lines.push(r.prompt);
    lines.push('```');
    lines.push('');
    lines.push('**Timings**');
    lines.push('');
    lines.push(`- TTFT: ${r.ttftMs === null ? 'n/a' : `${r.ttftMs}ms`}`);
    lines.push(`- Total: ${r.totalMs}ms`);
    lines.push('');
    if (!r.ok) {
      lines.push('**Error**');
      lines.push('');
      lines.push('```text');
      lines.push(r.error ?? '(unknown error)');
      lines.push('```');
      lines.push('');
      continue;
    }
    lines.push('**Tool calls**');
    lines.push('');
    if (r.toolCalls.length === 0) {
      lines.push('_None._');
    } else {
      for (const tc of r.toolCalls) {
        const argsSummary = summarizeJson(tc.args, 200);
        lines.push(`- \`${tc.name}\``);
        lines.push(`  - args: \`${argsSummary}\``);
        lines.push(
          `  - result: ${tc.resultSummary === null ? '_(no output)_' : `\`${tc.resultSummary}\``}`,
        );
      }
    }
    lines.push('');

    if (r.assertions && r.assertions.length > 0) {
      lines.push('**Assertion failures**');
      lines.push('');
      for (const a of r.assertions) {
        if (a.kind === 'missing_tool') lines.push(`- expected tool not called: \`${a.detail}\``);
        else if (a.kind === 'forbidden_tool') lines.push(`- forbidden tool was called: \`${a.detail}\``);
        else lines.push(`- text missing substring: \`${a.detail}\``);
      }
      lines.push('');
    }
    lines.push('**Output**');
    lines.push('');
    const truncated = r.text.length > MAX_OUTPUT_CHARS;
    const shown = truncated ? `${r.text.slice(0, MAX_OUTPUT_CHARS)}…` : r.text;
    lines.push('```text');
    lines.push(shown.length > 0 ? shown : '(no text output)');
    lines.push('```');
    if (truncated) {
      lines.push('');
      lines.push(`_(output truncated at ${MAX_OUTPUT_CHARS} chars; full length ${r.text.length})_`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function summarizeJson(value: unknown, max: number): string {
  let s: string;
  try {
    s = JSON.stringify(value ?? null);
  } catch {
    s = String(value);
  }
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function avg(xs: number[]): number {
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

// --- helpers ---------------------------------------------------------------

function trimTrailingSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

function utcStamp(d: Date): string {
  // YYYY-MM-DDTHH-MM-SSZ — colons are unsafe in some filesystems.
  const iso = d.toISOString(); // 2024-05-01T13:14:15.123Z
  return iso.replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');
}

// --- CLI -------------------------------------------------------------------

interface CliFlags {
  baseUrl: string;
  cookie: string;
  outDir: string;
  timeoutMs: number;
  promptsPath: string | null;
  useCases: boolean;
  help: boolean;
}

function parseCliFlags(argv: string[]): CliFlags | { help: true } {
  const flags: CliFlags = {
    baseUrl: DEFAULT_BASE_URL,
    cookie: process.env.EVAL_COOKIE ?? '',
    outDir: DEFAULT_OUT_DIR,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    promptsPath: null,
    useCases: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      flags.help = true;
      continue;
    }
    if (arg === '--cases') {
      flags.useCases = true;
      continue;
    }
    const next = argv[i + 1];
    if (arg === '--base-url') {
      if (!next) throw new Error('--base-url requires a value');
      flags.baseUrl = next;
      i++;
    } else if (arg === '--cookie') {
      if (!next) throw new Error('--cookie requires a value');
      flags.cookie = next;
      i++;
    } else if (arg === '--out') {
      if (!next) throw new Error('--out requires a value');
      flags.outDir = next;
      i++;
    } else if (arg === '--prompts') {
      if (!next) throw new Error('--prompts requires a value');
      flags.promptsPath = next;
      i++;
    } else if (arg === '--timeout') {
      if (!next) throw new Error('--timeout requires a value');
      const parsed = Number.parseInt(next, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`--timeout must be a positive integer (got "${next}")`);
      }
      flags.timeoutMs = parsed;
      i++;
    } else if (arg !== undefined && arg.startsWith('--')) {
      throw new Error(`unknown flag: ${arg}`);
    }
  }

  return flags;
}

function printUsage(): void {
  process.stdout.write(
    [
      'Usage: tsx packages/ai/src/eval/runner.ts [options]',
      '',
      'Options:',
      '  --base-url <url>   Base URL of the running app (default: http://localhost:3000)',
      '  --cookie <value>   Full Cookie header value (or set EVAL_COOKIE)',
      '  --out <dir>        Directory for the markdown report (default: docs/eval)',
      '  --timeout <ms>     Per-prompt abort timeout in ms (default: 120000)',
      '  --cases            Use cases.json (with assertions) instead of prompts.json',
      '  --prompts <path>   Override the prompts file path explicitly',
      '  -h, --help         Print this message and exit',
      '',
      'Reads prompts from packages/ai/src/eval/prompts.json (or cases.json',
      'with --cases). Writes <out>/<UTC-timestamp>.md. Exits 0 when every',
      'prompt succeeds AND every assertion passes, non-zero otherwise.',
      '',
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  let flags: CliFlags | { help: true };
  try {
    flags = parseCliFlags(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n\n`);
    printUsage();
    process.exit(2);
  }

  if ('help' in flags && flags.help) {
    printUsage();
    process.exit(0);
  }

  const f = flags as CliFlags;
  if (!f.cookie || f.cookie.length === 0) {
    process.stderr.write(
      'error: missing cookie. Pass --cookie "hfx_auth=..." or set EVAL_COOKIE.\n',
    );
    process.exit(1);
  }

  const promptsPath = f.promptsPath
    ?? (f.useCases
      ? fileURLToPath(new URL('./cases.json', import.meta.url))
      : fileURLToPath(new URL('./prompts.json', import.meta.url)));

  const { results, reportPath } = await runEvals({
    baseUrl: f.baseUrl,
    cookie: f.cookie,
    outDir: f.outDir,
    timeoutMs: f.timeoutMs,
    promptsPath,
  });

  const failed = results.filter((r) => !r.ok).length;
  const dirty = results.filter((r) => r.ok && (r.assertions?.length ?? 0) > 0).length;
  process.stdout.write(`\nReport: ${reportPath}\n`);
  process.stdout.write(
    `Done. ${results.length - failed}/${results.length} succeeded, ${failed} failed${dirty > 0 ? `, ${dirty} with assertion failures` : ''}.\n`,
  );
  process.exit(failed > 0 || dirty > 0 ? 1 : 0);
}

// Only run main() when this file is executed directly (not when imported).
if (isDirectExecution()) {
  void main();
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    const here = fileURLToPath(import.meta.url);
    return resolve(entry) === resolve(here);
  } catch {
    return false;
  }
}
