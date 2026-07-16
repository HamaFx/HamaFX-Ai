import { getDb, schema, withRateLimit } from '@hamafx/db';
import { z } from 'zod';

import { errorResponse, withAuth } from '@/lib/api';

const ImportRowSchema = z.object({
  symbol: z.enum(['XAUUSD', 'EURUSD', 'GBPUSD']),
  side: z.enum(['long', 'short']),
  entry: z.number().positive(),
  stop: z.number().positive().nullable().optional(),
  target: z.number().positive().nullable().optional(),
  exit: z.number().positive().nullable().optional(),
  size: z.number().positive().nullable().optional(),
  openedAt: z.number().int(),
  closedAt: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const ImportPayloadSchema = z.object({
  trades: z.array(ImportRowSchema).min(1).max(200),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const JOURNAL_IMPORT_RATE_LIMIT = Number(process.env.JOURNAL_IMPORT_RATE_LIMIT) || 5;

export const POST = withAuth<void>(async (req, { user }) => {
  try {
    // RL-5: per-user rate limit on journal imports.
    const rl = await withRateLimit(user.userId, 'journal_import', JOURNAL_IMPORT_RATE_LIMIT);
    if (!rl.allowed) {
      return Response.json(
        { error: { code: 'RATE_LIMITED', message: `Too many requests (${rl.count}/${rl.limit} per minute).` } },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }
    const body = await req.json();
    const { trades } = ImportPayloadSchema.parse(body);

    const db = getDb();
    const created = [];

    for (const trade of trades) {
      const exit = trade.exit ?? null;
      const closedAt = trade.closedAt ?? null;

      let outcome: 'win' | 'loss' | 'breakeven' | 'open' = 'open';
      let rMultiple: number | null = null;

      if (exit !== null && trade.stop !== null && trade.stop !== undefined) {
        const diff = trade.side === 'long' ? exit - trade.entry : trade.entry - exit;
        const risk = trade.side === 'long'
          ? trade.entry - trade.stop
          : trade.stop - trade.entry;
        if (risk > 0) {
          rMultiple = diff / risk;
        }
        outcome = rMultiple !== null
          ? rMultiple > 0.1 ? 'win' : rMultiple < -0.1 ? 'loss' : 'breakeven'
          : 'open';
      }

      const [row] = await db
        .insert(schema.journalEntries)
        .values({
          userId: user.userId,
          symbol: trade.symbol,
          side: trade.side,
          entry: trade.entry,
          stop: trade.stop ?? null,
          target: trade.target ?? null,
          exit,
          size: trade.size ?? null,
          openedAt: new Date(trade.openedAt),
          closedAt: closedAt !== null ? new Date(closedAt) : null,
          outcome,
          rMultiple,
          notes: trade.notes ?? null,
        })
        .returning();

      created.push(row);
    }

    return Response.json({ count: created.length });
  } catch (err) {
    return errorResponse(err);
  }
});
