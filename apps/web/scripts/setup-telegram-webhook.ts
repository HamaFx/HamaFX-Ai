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

// Telegram webhook setup script.
// Sets the webhook URL, secret token, and registers the bot command menu.
//
// Usage:
//   pnpm tsx scripts/setup-telegram-webhook.ts [domain]
//
// Or set VERCEL_PROJECT_PRODUCTION_URL / NEXT_PUBLIC_APP_URL env vars.

import * as crypto from 'crypto';
import { setBotCommands, telegramApiCall } from '../../packages/ai/src/telegram/client';

// Bot command menu (shown in Telegram client's "/" autocomplete)
const BOT_COMMANDS = [
  { command: 'help', description: 'Show available commands' },
  { command: 'price', description: 'Get current price: /price XAUUSD' },
  { command: 'analyze', description: 'Full AI analysis: /analyze EURUSD' },
  { command: 'ask', description: 'Ask a question: /ask is gold bullish?' },
  { command: 'committee', description: 'Multi-agent committee: /committee XAUUSD' },
  { command: 'status', description: 'System status overview' },
  { command: 'positions', description: 'Show open positions' },
  { command: 'alert', description: 'Create price alert: /alert XAUUSD > 2700' },
  { command: 'news', description: 'Latest market news' },
  { command: 'calendar', description: 'Economic calendar events' },
  { command: 'track', description: 'AI track record stats' },
  { command: 'settings', description: 'View your settings' },
  { command: 'me', description: 'Your account info' },
  { command: 'link', description: 'Link your HamaFX account' },
];

async function main() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const domain =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.argv[2];

  if (!botToken) {
    console.error('Error: TELEGRAM_BOT_TOKEN environment variable is not set.');
    process.exit(1);
  }

  if (!domain) {
    console.error(
      'Error: Please provide your public domain as an argument (e.g. pnpm tsx scripts/setup-telegram-webhook.ts myapp.vercel.app) or set VERCEL_PROJECT_PRODUCTION_URL.',
    );
    process.exit(1);
  }

  // Generate a secret token so we can verify incoming requests are from Telegram.
  // Or use existing if configured.
  const secretToken =
    process.env.TELEGRAM_SECRET_TOKEN || crypto.randomBytes(32).toString('hex');
  const url = `https://${domain.replace(/^https?:\/\//, '')}/api/telegram/webhook`;

  // 1. Set the webhook
  console.info(`Setting webhook to: ${url}`);

  const webhookResult = await telegramApiCall(botToken, 'setWebhook', {
    url,
    secret_token: secretToken,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false,
    max_connections: 40,
  });

  console.info('✅ Webhook successfully set!');

  // 2. Register the bot command menu
  console.info('Registering bot commands...');

  await setBotCommands(botToken, BOT_COMMANDS);

  console.info('✅ Bot commands registered!');

  // 3. Print the secret token for the user to save
  console.info('\n--- IMPORTANT ---');
  console.info('You must now add this secret token to your Environment Variables:');
  console.info(`TELEGRAM_SECRET_TOKEN=${secretToken}`);
  console.info('-----------------\n');

  // 4. Print the bot info for confirmation
  try {
    const botInfo = await telegramApiCall(botToken, 'getMe', {});
    console.info('Bot info:', JSON.stringify(botInfo, null, 2));
  } catch {
    // Non-critical
  }
}

main().catch(console.error);