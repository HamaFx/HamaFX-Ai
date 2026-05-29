import { handleTelegramWebhook } from '@hamafx/ai';
import { getServerEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const env = getServerEnv();

  // Validate Secret Token
  const secretToken = req.headers.get('x-telegram-bot-api-secret-token');
  if (env.TELEGRAM_SECRET_TOKEN && secretToken !== env.TELEGRAM_SECRET_TOKEN) {
    console.warn('[telegram-webhook] Invalid secret token');
    return new Response('Unauthorized', { status: 401 });
  }

  let update;
  try {
    update = await req.json();
  } catch (err) {
    console.error('[telegram-webhook] Failed to parse JSON body');
    return new Response('Bad Request', { status: 400 });
  }

  // We intentionally do NOT await the handleTelegramWebhook here so that
  // Telegram receives a 200 OK immediately and does not timeout/retry.
  // Wait, in Serverless Environments like Vercel, if we return early, the
  // function might be killed before `handleTelegramWebhook` finishes!
  // To solve this, we can use `waitUntil` from `@vercel/functions`.
  
  // Try using `waitUntil` to keep the lambda alive if available, 
  // or simply await it if we expect fast responses. We will await it.
  try {
    await handleTelegramWebhook(update, env);
  } catch (err) {
    console.error('[telegram-webhook] Handler failed:', err);
  }

  return new Response('OK', { status: 200 });
}
