/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// PF-22 — Settings service layer.
//
// Separates business logic from HTTP handling. Route handlers (controllers)
// call these service functions instead of importing from @hamafx/ai / @hamafx/db
// directly.
//
// Pattern: Service (PF-22). Controllers remain thin: parse request →
// call service → format Response.

import { testProviderKey } from '@hamafx/ai';
import { schema, getUserWithSettings, updateUserSettingsField, withRateLimit } from '@hamafx/db'
import { getDb } from '@hamafx/ai';
import { decryptByok, PROVIDER_IDS } from '@hamafx/shared/encryption';
import type { ProviderId } from '@hamafx/shared/encryption';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

// ── Schemas ─────────────────────────────────────────────────────────────────

export const AnalysisModePatchSchema = z.object({
  defaultAnalysisMode: z.enum(['single', 'quick', 'standard', 'full', 'auto']).optional(),
  showAgentOpinions: z.boolean().optional(),
  agentModelOverrides: z.object({
    technical: z.string().optional(),
    fundamental: z.string().optional(),
    risk: z.string().optional(),
    sentiment: z.string().optional(),
    decision: z.string().optional(),
  }).optional(),
});

export const FallbackChainPutSchema = z.object({
  fallbackChain: z.array(z.enum(PROVIDER_IDS as readonly [ProviderId, ...ProviderId[]])),
});

export type AnalysisModePatchInput = z.infer<typeof AnalysisModePatchSchema>;
export type FallbackChainPutInput = z.infer<typeof FallbackChainPutSchema>;

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface AnalysisModeDTO {
  defaultAnalysisMode: string;
  showAgentOpinions: boolean;
  agentModelOverrides: Record<string, string>;
}

export interface BulkTestProgressEvent {
  type: 'progress';
  current: number;
  total: number;
  provider: string;
}

export interface BulkTestResultEvent {
  type: 'done';
  results: Array<{
    provider: string;
    status: 'ok' | 'failed' | 'missing';
    error?: string;
  }>;
  summary: {
    ok: number;
    failed: number;
    missing: number;
    total: number;
    testedAt: string;
  };
}

export interface BulkTestErrorEvent {
  type: 'error';
  message: string;
}

export type BulkTestEvent = BulkTestProgressEvent | BulkTestResultEvent | BulkTestErrorEvent;

// ── Service functions ────────────────────────────────────────────────────────

export async function getAnalysisModeService(userId: string): Promise<AnalysisModeDTO> {
  const { settings } = await getUserWithSettings(userId);
  return {
    defaultAnalysisMode: settings?.defaultAnalysisMode ?? 'auto',
    showAgentOpinions: settings?.showAgentOpinions ?? true,
    agentModelOverrides: settings?.agentModelOverrides ?? {},
  };
}

export async function updateAnalysisModeService(
  userId: string,
  input: AnalysisModePatchInput,
): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (input.defaultAnalysisMode !== undefined) {
    updates.defaultAnalysisMode = input.defaultAnalysisMode;
  }
  if (input.showAgentOpinions !== undefined) {
    updates.showAgentOpinions = input.showAgentOpinions;
  }
  if (input.agentModelOverrides !== undefined) {
    updates.agentModelOverrides = input.agentModelOverrides;
  }

  if (Object.keys(updates).length === 0) {
    throw Object.assign(new Error('No fields to update'), { statusCode: 400 });
  }

  const db = getDb();
  await db
    .update(schema.userSettings)
    .set(updates)
    .where(eq(schema.userSettings.userId, userId));
}

export async function getFallbackChainService(
  userId: string,
): Promise<{ fallbackChain: ProviderId[] }> {
  const { settings } = await getUserWithSettings(userId);
  return { fallbackChain: (settings?.aiFallbackChain as ProviderId[] | undefined) ?? [] };
}

export async function updateFallbackChainService(
  userId: string,
  fallbackChain: ProviderId[],
): Promise<{ fallbackChain: ProviderId[] }> {
  await updateUserSettingsField(userId, 'aiFallbackChain', fallbackChain);
  return { fallbackChain };
}

// ── Bulk Test (streaming) ────────────────────────────────────────────────────

/**
 * Test every configured BYOK key and return a ReadableStream that emits
 * NDJSON progress/result events. This is the one service function that
 * returns a stream instead of a typed DTO, because the HTTP response
 * format (NDJSON) is intrinsic to the feature.
 */
export function bulkTestKeysService(
  userId: string,
): Promise<{
  stream: ReadableStream<Uint8Array>;
  testedAt: Date;
}> {
  return (async () => {
    const rate = await withRateLimit(userId, 'bulk_test', 2);
    if (!rate.allowed) {
      throw Object.assign(
        new Error('Bulk test rate-limited. Try again in a few minutes.'),
        { statusCode: 429 },
      );
    }

    const db = getDb();
    const [settings] = await db
      .select({ aiApiKeys: schema.userSettings.aiApiKeys })
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, userId));
    const decrypted = settings?.aiApiKeys ? decryptByok(settings.aiApiKeys) : null;

    const testedAt = new Date();
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const results: Array<{
            provider: string;
            status: 'ok' | 'failed' | 'missing';
            error?: string;
          }> = [];

          const activeProviders = PROVIDER_IDS.filter((id) => {
            const key = decrypted?.[id];
            return typeof key === 'string' && key.trim().length > 0;
          });

          const total = activeProviders.length;
          let current = 0;

          // Fill in missing ones first
          for (const id of PROVIDER_IDS) {
            const key = decrypted?.[id];
            if (typeof key !== 'string' || key.trim().length === 0) {
              results.push({ provider: id, status: 'missing' as const });
            }
          }

          // Test active ones sequentially
          for (const providerId of activeProviders) {
            current += 1;
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: 'progress' as const,
                  current,
                  total,
                  provider: providerId,
                }) + '\n',
              ),
            );

            const key = decrypted?.[providerId] ?? '';
            const r = await testProviderKey(providerId, key);
            const status = r.ok ? ('ok' as const) : ('failed' as const);
            results.push({
              provider: providerId,
              status,
              ...(r.ok ? {} : { error: r.error }),
            });
          }

          // Persist health snapshots
          const rows = results
            .filter((r) => r.status !== 'missing')
            .map((r) => ({
              userId,
              providerId: r.provider,
              ok: r.status === 'ok',
              error: r.status === 'failed' ? r.error ?? 'unknown error' : null,
              testedAt: testedAt.toISOString(),
            }));
          if (rows.length > 0) {
            await db
              .delete(schema.providerTests)
              .where(eq(schema.providerTests.userId, userId));
            await db.insert(schema.providerTests).values(rows);
          }

          const ok = results.filter((r) => r.status === 'ok').length;
          const failed = results.filter((r) => r.status === 'failed').length;
          const missing = results.filter((r) => r.status === 'missing').length;

          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'done' as const,
                results,
                summary: { ok, failed, missing, total: results.length, testedAt: testedAt.toISOString() },
              }) + '\n',
            ),
          );
        } catch (e) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'error' as const,
                message: e instanceof Error ? e.message : 'Testing failed',
              }) + '\n',
            ),
          );
        } finally {
          controller.close();
        }
      },
    });

    return { stream, testedAt };
  })();
}
