import { type ServerEnv } from '@hamafx/shared';
import type { UIMessage } from 'ai';
import { runChat } from '../agent';
import * as crypto from 'crypto';

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: {
      id: number;
    };
    text?: string;
  };
  callback_query?: {
    id: string;
    data: string;
    message?: {
      chat: {
        id: number;
      };
    };
  };
}

export async function handleTelegramWebhook(update: TelegramUpdate, env: ServerEnv) {
  const chatId = update.message?.chat.id || update.callback_query?.message?.chat.id;
  const text = update.message?.text || update.callback_query?.data;

  if (!chatId || !text) {
    return;
  }

  // Acknowledge callback query to stop the loading spinner on the button
  if (update.callback_query && env.TELEGRAM_BOT_TOKEN) {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ callback_query_id: update.callback_query.id }),
    }).catch(console.error);
  }

  // Pre-process slash commands
  let customInstructions = '';
  if (text.startsWith('/status')) {
    customInstructions = 'The user wants a quick status update of their PnL, open trades, and margin.';
  } else if (text.startsWith('/committee')) {
    customInstructions = 'The user wants to run the multi-agent committee on the mentioned pair. Immediately invoke the convene_committee tool and return the verdict.';
  } else if (text.startsWith('/snapshot')) {
    customInstructions = 'The user wants a market snapshot. Run the snapshot tool or summarize the latest macro news quickly.';
  }

  // We map the telegram chat ID to a deterministic thread ID. 
  // In a real multi-user app we'd look up the user, but this is a single-user app.
  // We'll use a specific thread ID prefix to keep telegram separate, or just use a daily thread.
  const threadId = `tg-${chatId}-default`;

  const userMessage: UIMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    parts: [{ type: 'text', text }],
  };

  try {
    // Send a "Typing..." action to Telegram
    if (env.TELEGRAM_BOT_TOKEN) {
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendChatAction`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
      }).catch(console.error);
    }

    const chatResult = await runChat({
      threadId,
      userMessage,
      env: {
        AI_GATEWAY_API_KEY: env.AI_GATEWAY_API_KEY,
        GOOGLE_GENERATIVE_AI_API_KEY: env.GOOGLE_GENERATIVE_AI_API_KEY,
        GOOGLE_VERTEX_PROJECT: env.GOOGLE_VERTEX_PROJECT,
        GOOGLE_VERTEX_LOCATION: env.GOOGLE_VERTEX_LOCATION,
        GOOGLE_APPLICATION_CREDENTIALS_JSON: env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
        GOOGLE_APPLICATION_CREDENTIALS: env.GOOGLE_APPLICATION_CREDENTIALS,
        AI_DEFAULT_MODEL: env.AI_DEFAULT_MODEL,
        AI_TITLE_MODEL: env.AI_TITLE_MODEL,
        AI_VISION_MODEL: env.AI_VISION_MODEL,
        AI_FUNDAMENTAL_MODEL: env.AI_FUNDAMENTAL_MODEL,
        AI_TECHNICAL_MODEL: env.AI_TECHNICAL_MODEL,
        AI_SUMMARY_MODEL: env.AI_SUMMARY_MODEL,
        MAX_DAILY_USD: env.MAX_DAILY_USD,
        MAX_TOOL_ITERATIONS: env.MAX_TOOL_ITERATIONS,
        LOG_PROMPTS: env.LOG_PROMPTS,
      },
      ...(customInstructions ? { customInstructions } : {}),
    });

    // Wait for the full response
    const aiResponseText = await chatResult.text;

    // Send the response back to Telegram
    if (env.TELEGRAM_BOT_TOKEN) {
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: aiResponseText || 'I executed a tool, check the web UI for details.',
        }),
      });
    }

  } catch (err) {
    console.error('[telegram] Failed to process webhook:', err);
    if (env.TELEGRAM_BOT_TOKEN) {
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `Error processing request: ${err instanceof Error ? err.message : String(err)}`,
        }),
      });
    }
  }
}
