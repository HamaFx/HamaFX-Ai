// Per-turn context builder. Generates the LIVE_SNAPSHOT block injected into
// the system prompt so the model has ambient awareness without having to
// `get_price` for trivial questions.
//
// All reads are best-effort — a price-feed failure must NOT block the chat.
// Missing entries silently drop out of the snapshot.

import { getPrice } from '@hamafx/data';
import { getDb, schema } from '@hamafx/db';
import { SYMBOLS, type Symbol, type Tick } from '@hamafx/shared';
import { desc } from 'drizzle-orm';

import type { LiveSnapshot } from './prompt/system';

/**
 * London + New York are the two sessions where XAU and FX really move.
 * Asia is informational. Times in UTC; FX market closes Fri 22:00 UTC.
 */
function inferSession(now: Date): LiveSnapshot['session'] {
  const day = now.getUTCDay(); // 0 Sun – 6 Sat
  const hour = now.getUTCHours();

  // Weekend FX is closed; precious metals trade limited hours but quotes are stale.
  if (day === 6) return 'off';
  if (day === 0 && hour < 22) return 'off';
  if (day === 5 && hour >= 22) return 'off';

  if (hour >= 0 && hour < 7) return 'asia';
  if (hour >= 7 && hour < 12) return 'london';
  if (hour >= 12 && hour < 21) return 'ny';
  return 'asia';
}

export async function buildLiveSnapshot(
  opts: { signal?: AbortSignal } = {},
): Promise<LiveSnapshot> {
  const now = new Date();
  const prices: Partial<Record<Symbol, Tick>> = {};
  let copilotHealth: LiveSnapshot['copilotHealth'] = undefined;

  const healthPromise = (async () => {
    try {
      const dbStart = Date.now();
      const db = getDb();
      const recentRows = await db
        .select({ date: schema.intermarketResonance.date })
        .from(schema.intermarketResonance)
        .orderBy(desc(schema.intermarketResonance.date))
        .limit(1);
      const dbLatencyMs = Date.now() - dbStart;
      const lastResonanceSync = recentRows[0]?.date ?? null;
      copilotHealth = {
        status: dbLatencyMs > 250 ? 'degraded' : 'healthy',
        dbLatencyMs,
        lastResonanceSync,
      };
    } catch {
      copilotHealth = {
        status: 'unhealthy',
        dbLatencyMs: -1,
        lastResonanceSync: null,
      };
    }
  })();

  // Parallel fetch; per-symbol timeouts via the global AbortSignal.
  await Promise.all([
    healthPromise,
    ...SYMBOLS.map(async (s) => {
      try {
        const timeoutMs = 800;
        const fetchPromise = getPrice(s, opts.signal ? { signal: opts.signal } : {});
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('timeout')), timeoutMs)
        );
        prices[s] = await Promise.race([fetchPromise, timeoutPromise]);
      } catch {
        // Swallow — missing prices are signalled to the model by absence.
      }
    }),
  ]);

  return {
    asOf: now.toISOString(),
    session: inferSession(now),
    prices,
    ...(copilotHealth ? { copilotHealth } : {}),
  };
}
