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

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { getPackageManager, packageManagerLabel } from '../lib/prereqs.mjs';
import { confirm } from '../lib/prompts.mjs';
import { runCommand } from '../lib/run.mjs';
import { fail, info, ok, paint } from '../lib/ui.mjs';

export const title = 'Installing dependencies';

export async function run(ctx) {
  const { io, flags } = ctx;
  const repoRoot = resolve(ctx.root ?? process.cwd());
  const { mode, existingAction } = ctx.answers;
  const auto = flags.yes || flags.json || !io.isTTY;

  if (flags.skipInstall) {
    info(io, 'Skipping dependency installation (--skip-install).');
    return 'ok';
  }

  if (mode === 'docker') {
    info(io, 'Docker mode — dependencies install during docker compose build.');
    ok(io, 'Skipping local install.');
    return 'ok';
  }

  const manager = getPackageManager();
  if (!manager) {
    io.line();
    fail(
      io,
      'Simple mode needs pnpm or Corepack. Install Node.js with Corepack enabled, then run setup again.',
    );
    return 'abort';
  }

  const depsExist = existsSync(resolve(repoRoot, 'node_modules'));
  if (depsExist && existingAction !== 'repair' && existingAction !== 'fresh') {
    const skip = await confirm(io, {
      message: 'Dependencies are already installed. Skip the reinstall?',
      initial: true,
      auto,
    });
    if (skip === 'cancel') return 'abort';
    if (skip) {
      ok(io, 'Using the existing node_modules.');
      return 'ok';
    }
  }

  if (flags.dryRun) {
    info(io, `[dry-run] would run: ${packageManagerLabel(manager)} install --frozen-lockfile`);
    return 'ok';
  }

  // Run install with inherited stdio: pnpm writes a lot of output, and
  // piping it without draining can fill the pipe buffer and deadlock the
  // child (a spinner would run forever). The user sees real progress.
  io.line();
  io.line(`  ${paint(`Running ${packageManagerLabel(manager)} install...`, 'cyan')}`);
  try {
    await runCommand(manager.command, [...manager.prefix, 'install', '--frozen-lockfile'], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    ok(io, 'Dependencies installed (frozen lockfile)');
    return 'ok';
  } catch {
    io.line(`  ${paint('Retrying without the lockfile...', 'cyan')}`);
    try {
      await runCommand(manager.command, [...manager.prefix, 'install'], {
        cwd: repoRoot,
        stdio: 'inherit',
      });
      ok(io, 'Dependencies installed');
      return 'ok';
    } catch {
      fail(io, 'pnpm install failed — try running it manually.');
      return 'abort';
    }
  }
}
