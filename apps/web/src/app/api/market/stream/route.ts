import { getPriceWithMeta } from '@hamafx/data';
import { SymbolSchema } from '@hamafx/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { auth } from '@/auth';
import { getUserApiKeys } from '@hamafx/db';
import { decryptByok } from '@hamafx/shared/encryption';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  symbol: z
    .union([SymbolSchema, z.array(SymbolSchema), z.string()])
    .transform((v) => {
      if (Array.isArray(v)) return v;
      const parts = String(v)
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      const parsed = parts.map((s) => SymbolSchema.parse(s));
      return [...new Set(parsed)];
    }),
});

// H6: Cap iterations to prevent infinite loop holding DB connections.
const MAX_ITERATIONS = 1200;
// M9: Measure fetch duration and sleep only the remainder of the 3s window.
const POLL_INTERVAL_MS = 3_000;

async function* generatePrices(keys: Record<string, string>, symbols: string[]): AsyncGenerator<string> {
  let iteration = 0;
  while (iteration < MAX_ITERATIONS) {
    iteration++;
    const fetchStart = Date.now();
    try {
      const results = await Promise.all(
        symbols.map((s) => getPriceWithMeta(s, { apiKeys: keys })),
      );
      const ticks = results.map((r) => r.tick);
      yield `data: ${JSON.stringify({ ticks, ts: Date.now() })}\n\n`;
    } catch (err) {
      yield `data: ${JSON.stringify({ error: String(err), ts: Date.now() })}\n\n`;
    }
    // M9: Only sleep the remaining time — if fetch took 500ms, sleep 2500ms.
    const elapsed = Date.now() - fetchStart;
    const sleepMs = Math.max(0, POLL_INTERVAL_MS - elapsed);
    await new Promise((resolve) => setTimeout(resolve, sleepMs));
  }
}

export const GET = async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    symbol: url.searchParams.getAll('symbol'),
  });
  if (!parsed.success) {
    return new Response(`Bad request: ${parsed.error.message}`, { status: 400 });
  }

  const symbols = parsed.data.symbol.length > 0 ? parsed.data.symbol : ['XAUUSD'];

  const encryptedKeys = await getUserApiKeys(session.user.id);
  const keys: Record<string, string> = (decryptByok(encryptedKeys) ?? {}) as unknown as Record<string, string>;

  const stream = generatePrices(keys, symbols);
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async pull(controller) {
      const { value, done } = await stream.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(encoder.encode(value));
      }
    },
    cancel() {
      // client disconnected
    },
  });

  return new Response(readable, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
  });
};
