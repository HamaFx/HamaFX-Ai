/**
 * Copyright 2026 Kestrel
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

import { MARKET_DATA_PROVIDERS, parseMarketFlag, providerById } from '../lib/market-data.mjs';
import { multiselect, text } from '../lib/prompts.mjs';
import { maskKey } from '../lib/run.mjs';
import { info, ok, paint, warn } from '../lib/ui.mjs';

export const title = 'Market data providers (optional)';

export const hint = 'Keys are optional — add them later in Settings or the .env file';

/**
 * Keys are optional and stored at the env level (FINNHUB_API_KEY, …).
 * Selection is a checkbox multiselect; keys are typed with masking.
 * ESC anywhere in this step goes back to the previous step.
 */
export async function run(ctx) {
  const { io, flags } = ctx;
  const auto = flags.yes || flags.json || !io.isTTY || flags.dryRun;

  io.line();
  info(io, 'Market data keys are optional — the app works without them.');
  info(io, 'They unlock live news, economic calendars, and enriched data.');

  // The full-screen page drops the numbered list — the multiselect below
  // already shows every provider with its hint, so a second list is just
  // redundant scrolling.
  if (!ctx.pageMode) {
    for (let i = 0; i < MARKET_DATA_PROVIDERS.length; i++) {
      const p = MARKET_DATA_PROVIDERS[i];
      io.line(
        `  ${paint(`${i + 1}.`, 'cyan')} ${paint(p.label, 'bold')} ${paint(`(${p.hint})`, 'dim')}`,
      );
      io.line(`     ${paint('Get key:', 'dim')} ${p.url}`);
    }
    io.line();
  }

  let selectedIds;
  if (flags.market) {
    selectedIds = parseMarketFlag(flags.market);
    if (selectedIds.length === 0) {
      warn(
        io,
        `No recognized providers in --market=${flags.market} (expected comma-separated ids).`,
      );
    } else {
      info(io, `Providers selected via --market: ${selectedIds.join(', ')}`);
    }
  } else if (auto) {
    selectedIds = [];
  } else {
    const chosen = await multiselect(io, {
      message: 'Select market data providers',
      options: MARKET_DATA_PROVIDERS.map((p) => ({
        value: p.id,
        label: p.label,
        description: p.hint,
      })),
    });
    if (chosen === 'cancel') return 'back';
    selectedIds = chosen;
  }

  const marketKeys = {};
  for (const id of selectedIds) {
    const provider = providerById(id);
    if (!provider) continue;
    if (flags.dryRun) {
      info(io, `[dry-run] would prompt for the ${provider.label} API key (masked input)`);
      continue;
    }
    const key = await text(io, {
      message: `${provider.label} API key`,
      placeholder: 'Paste your key here',
      mask: true,
      validate: (v) =>
        v.length > 0 && v.length < provider.minLen
          ? `Key looks too short for ${provider.label}`
          : null,
      auto: flags.yes || !io.isTTY,
    });
    if (key === 'cancel') return 'back';
    if (!key) {
      warn(io, `No key for ${provider.label} — skipping`);
      continue;
    }
    marketKeys[provider.envKey] = key;
    ok(io, `${provider.label} key saved ${paint(maskKey(key), 'dim')}`);
  }

  if (selectedIds.length === 0) {
    info(io, 'Skipped market data providers — add them later in Settings or the .env file.');
  }

  ctx.answers.marketKeys = marketKeys;
  ctx.answers.marketProviders = selectedIds;
  return 'ok';
}
