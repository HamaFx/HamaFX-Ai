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

import * as crypto from 'crypto';

async function main() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const domain = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.NEXT_PUBLIC_APP_URL || process.argv[2];

  if (!botToken) {
    console.error('Error: TELEGRAM_BOT_TOKEN environment variable is not set.');
    process.exit(1);
  }

  if (!domain) {
    console.error('Error: Please provide your public domain as an argument (e.g. pnpm tsx scripts/setup-telegram-webhook.ts myapp.vercel.app) or set VERCEL_PROJECT_PRODUCTION_URL.');
    process.exit(1);
  }

  // Generate a secret token so we can verify incoming requests are actually from Telegram
  // Or use existing if configured, but let's just generate one and print it so the user can save it.
  const secretToken = process.env.TELEGRAM_SECRET_TOKEN || crypto.randomBytes(32).toString('hex');
  const url = `https://${domain.replace(/^https?:\/\//, '')}/api/telegram/webhook`;

  console.info(`Setting webhook to: ${url}`);
  
  const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      secret_token: secretToken,
      allowed_updates: ['message', 'callback_query'],
    }),
  });

  const data = await response.json();

  if (data.ok) {
    console.info('✅ Webhook successfully set!');
    console.info('\n--- IMPORTANT ---');
    console.info('You must now add this secret token to your Vercel Environment Variables:');
    console.info(`TELEGRAM_SECRET_TOKEN=${secretToken}`);
    console.info('-----------------\n');
  } else {
    console.error('❌ Failed to set webhook:', data);
  }
}

main().catch(console.error);
