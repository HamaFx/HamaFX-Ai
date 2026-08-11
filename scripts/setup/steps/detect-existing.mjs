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

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { select } from '../lib/prompts.mjs';
import { info } from '../lib/ui.mjs';

export const title = 'Checking for an existing installation';

export const hint = 'Existing files are never overwritten without a backup';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Existing installs are detected per mode: `.env` for Docker mode,
 * `.env.local` for Simple mode, plus `node_modules` either way.
 * The user picks how to proceed instead of being overwritten blindly.
 */
export async function run(ctx) {
  const { io, flags } = ctx;
  const envPath = ctx.answers.mode === 'docker' ? '.env' : '.env.local';
  const envExists = existsSync(resolve(REPO_ROOT, envPath));
  const depsExist = existsSync(resolve(REPO_ROOT, 'node_modules'));

  if (!envExists && !depsExist) {
    ctx.answers.existingAction = 'continue';
    if (ctx.pageMode) info(io, 'No existing installation found — starting fresh.');
    return 'ok';
  }

  const found = [];
  if (envExists) found.push(envPath);
  if (depsExist) found.push('node_modules');
  info(io, `Found an existing installation: ${found.join(', ')}`);

  if (flags.fresh) {
    ctx.answers.existingAction = 'fresh';
    info(io, 'Fresh start requested (--fresh) — config will be backed up and regenerated.');
    return 'ok';
  }

  if (flags.yes || flags.json || !io.isTTY) {
    ctx.answers.existingAction = 'continue';
    info(io, 'Continuing setup with existing files (non-interactive mode).');
    return 'ok';
  }

  const choice = await select(io, {
    message: 'What would you like to do?',
    options: [
      {
        value: 'continue',
        label: 'Continue setup',
        description: 'Keep existing config and refresh it in place',
      },
      {
        value: 'repair',
        label: 'Repair installation',
        description: 'Reinstall dependencies, keep config untouched',
      },
      { value: 'fresh', label: 'Fresh start', description: 'Back up then regenerate config' },
    ],
    initialValue: 'continue',
  });
  if (choice === 'cancel') return 'abort';

  ctx.answers.existingAction = choice;
  return 'ok';
}
