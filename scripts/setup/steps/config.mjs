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

import { resolve } from 'node:path';

import { readEnvFile, upsertEnvFile } from '../lib/env.mjs';
import { confirm } from '../lib/prompts.mjs';
import { checkComposeConfig } from '../lib/run.mjs';
import { missingSecrets } from '../lib/secrets.mjs';
import { info, ok, paint, warn } from '../lib/ui.mjs';

export const title = 'Generating secrets & writing config';

export const hint = 'Changes are backed up automatically before anything is written';

function showDiff(io, diff) {
  if (diff.length === 0) {
    info(io, 'No changes needed — existing config is already up to date.');
    return;
  }
  for (const change of diff) {
    if (change.new === undefined) {
      io.line(`  ${paint('~', 'yellow')} ${change.key}: ${paint('removed', 'yellow')}`);
    } else if (change.old === undefined) {
      io.line(`  ${paint('+', 'green')} ${change.key} = ${change.new}`);
    } else {
      io.line(`  ${paint('~', 'yellow')} ${change.key}: ${change.old} → ${change.new}`);
    }
  }
}

/**
 * Redact known secret values from tool output (e.g. `docker compose
 * config` errors that may interpolate .env values) so secrets never
 * appear in the terminal.
 */
function redactSecrets(envPath, marketKeys, text) {
  const { entries } = readEnvFile(envPath);
  const values = [...entries.values(), ...Object.values(marketKeys)].filter(Boolean);
  let out = text;
  for (const value of values) {
    if (value.length >= 8) out = out.split(value).join('•'.repeat(6));
  }
  return out;
}

/**
 * Writes .env (Docker mode) or .env.local (Simple mode), always backing
 * up first and printing a masked diff. In Dry mode nothing is written.
 * Docker mode is validated with `docker compose config` before success.
 */
export async function run(ctx) {
  const { io, flags } = ctx;
  const { mode, existingAction, marketKeys } = ctx.answers;
  const repoRoot = resolve(ctx.root ?? process.cwd());
  const isDocker = mode === 'docker';

  if (existingAction === 'repair') {
    info(io, 'Repair mode — leaving existing config untouched.');
    return 'ok';
  }

  const envPath = resolve(repoRoot, isDocker ? '.env' : '.env.local');
  const fresh = existingAction === 'fresh';

  // Assemble values to write.
  let values;
  if (isDocker) {
    const { missing } = missingSecrets(envPath);
    values = { ...missing, ...marketKeys };
  } else {
    values = { BYOK_ENABLED: '1', ...marketKeys };
  }

  io.line();
  if (flags.dryRun) {
    info(io, `[dry-run] target config file: ${envPath}`);
  }

  const result = upsertEnvFile(envPath, values, {
    backup: true,
    dryRun: flags.dryRun,
    replace: fresh,
    // maskDiff defaults to secret-aware masking (KEY/SECRET/PASSWORD/…)
  });

  if (result.backupPath) ok(io, `Backed up previous config → ${paint(result.backupPath, 'dim')}`);
  showDiff(io, result.diff);

  if (flags.dryRun) {
    info(io, '[dry-run] no files were written.');
    return 'ok';
  }

  if (isDocker) {
    ok(io, `Saved full-mode settings to ${paint('.env', 'dim')}`);
  } else {
    ok(io, `Saved simple-mode settings to ${paint('.env.local', 'dim')}`);
    ok(io, 'Auth & encryption secrets auto-generate on first boot.');
  }

  // Validate the composed stack before declaring success.
  if (isDocker) {
    const { ok: composeOk, error } = checkComposeConfig(repoRoot);
    if (composeOk) {
      ok(io, 'docker compose config validated successfully.');
    } else {
      warn(io, 'docker compose config reported a problem:');
      if (error) io.line(paint(`  ${redactSecrets(envPath, marketKeys, error).trim()}`, 'dim'));
      const proceed = await confirm(io, {
        message: 'Continue anyway?',
        initial: false,
        auto: flags.yes || flags.json || !io.isTTY,
      });
      if (proceed === 'cancel') return 'abort';
      if (!proceed) return 'abort';
      warn(io, 'Continuing despite the compose warning.');
    }
  }

  return 'ok';
}
