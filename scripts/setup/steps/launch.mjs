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

import { resolve } from 'node:path';

import { getPackageManager, packageManagerLabel } from '../lib/prereqs.mjs';
import { confirm } from '../lib/prompts.mjs';
import { openBrowser, waitForApp } from '../lib/run.mjs';
import { box, fail, info, note, ok, paint, startSpinner, warn } from '../lib/ui.mjs';

export const title = 'Ready to launch';

export const hint = 'Setup is complete — the summary below shows how to get started';

const APP_URL = 'http://localhost:3000';
const HEALTH_URL = 'http://localhost:3000/api/health/public';

function printSummary(ctx) {
  const { io, answers } = ctx;
  const keys = Object.keys(answers.marketKeys ?? {});
  const summaryLines = [
    `${paint('Mode:', 'bold')}           ${answers.mode === 'docker' ? 'Full mode (Docker)' : 'Simple mode'}`,
    `${paint('AI providers:', 'bold')}     ${paint('BYOK — add keys after registration', 'cyan')}`,
    `${paint('Market data:', 'bold')}      ${
      keys.length > 0
        ? keys.map((k) => k.replace('_API_KEY', '')).join(', ')
        : paint('none (optional)', 'dim')
    }`,
    `${paint('Config file:', 'bold')}     ${answers.mode === 'docker' ? '.env' : '.env.local'}`,
    `${paint('Next steps:', 'bold')}`,
    '  1. Start the app',
    '  2. Register at /register',
    '  3. Add your AI key in the onboarding wizard',
  ];
  box(io, 'Setup Summary', summaryLines, { color: 'green', minWidth: 52 });
}

function printGettingStarted(io) {
  note(
    io,
    'Getting Started',
    [
      '1. Register your owner account at /register',
      '2. Add your AI provider key: Settings → API Keys',
      '   (or walk through the onboarding wizard)',
      '3. Ask: "What is the current XAUUSD price?"',
    ],
    'green',
  );
}

/** Compact summary used on the full-screen launch page. */
function printCompactSummary(ctx) {
  const { io, answers } = ctx;
  const keys = Object.keys(answers.marketKeys ?? {});
  const lines = [
    `${paint('Mode:', 'bold')}         ${answers.mode === 'docker' ? 'Full mode (Docker)' : 'Simple mode'}`,
    `${paint('Market data:', 'bold')}  ${
      keys.length > 0
        ? keys.map((k) => k.replace('_API_KEY', '')).join(', ')
        : paint('none (optional)', 'dim')
    }`,
    `${paint('Config file:', 'bold')} ${answers.mode === 'docker' ? '.env' : '.env.local'}`,
    `${paint('App URL:', 'bold')}     ${APP_URL}`,
  ];
  box(io, 'Setup complete', lines, { color: 'green', minWidth: 44 });
}

export async function run(ctx) {
  const { io, flags } = ctx;
  const repoRoot = resolve(ctx.root ?? process.cwd());
  const isDocker = ctx.answers.mode === 'docker';

  if (ctx.pageMode) {
    printCompactSummary(ctx);
    io.line();
    info(io, `Register at ${APP_URL}/register, then add your AI key in Settings → API Keys.`);
    io.line();
  } else {
    printSummary(ctx);
    printGettingStarted(io);
    io.line();
  }

  const startCommand = isDocker
    ? 'docker compose up -d --build'
    : `${packageManagerLabel(getPackageManager())} dev:local`;

  io.line();
  io.line(`  ${paint('Ready to launch! 🚀', 'bold', 'green')}`);
  io.line();
  io.line(`  ${paint('Start command:', 'bold')} ${paint(startCommand, 'green')}`);
  io.line(`  ${paint('App URL:', 'bold')}       ${APP_URL}`);
  if (isDocker) io.line(`  ${paint('Langfuse:', 'bold')}      http://localhost:3001`);
  io.line(`  ${paint('Register:', 'bold')}      ${APP_URL}/register`);
  io.line();

  if (flags.dryRun) {
    info(io, '[dry-run] would start the app with the command above and open the browser.');
    return 'ok';
  }

  if (flags.noLaunch) {
    info(io, 'Skipping launch (--no-launch). Run it whenever you are ready:');
    io.line(`  ${paint(startCommand, 'green')}`);
    return 'ok';
  }

  const start = await confirm(io, {
    message: isDocker ? 'Start the Docker stack now?' : 'Start dev server now?',
    initial: true,
    auto: flags.yes || flags.json || !io.isTTY,
  });
  if (start === 'cancel') return 'abort';
  if (!start) {
    io.line();
    info(io, 'Run when ready:');
    io.line(`  ${paint(startCommand, 'green')}`);
    return 'ok';
  }

  io.line();
  io.line(
    `  ${paint(isDocker ? 'Building & starting Docker stack...' : 'Starting Kestrel...', 'cyan')}`,
  );
  io.line(`  ${paint('Press Ctrl+C to stop', 'dim')}`);
  io.line();

  const { spawn } = await import('node:child_process');

  if (isDocker) {
    const child = spawn('docker', ['compose', 'up', '-d', '--build'], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    child.on('error', (err) => {
      warn(io, `Failed to start Docker: ${err.message}`);
    });
    child.on('exit', async (code) => {
      if (code === 0) {
        const spinner = startSpinner(io, 'Waiting for the app to become ready');
        const ready = await waitForApp(HEALTH_URL, 180_000);
        spinner.stop(ready ? 'The app is ready' : null);
        if (ready) {
          ok(io, 'Full mode is ready. Opening it in your browser.');
          openBrowser(io, APP_URL);
        } else {
          warn(io, 'The app is still warming up. Open the URL in a moment.');
        }
        printDockerHints(io);
      } else {
        fail(io, 'Docker compose failed. Check the output above.');
      }
    });
    // The wizard stays attached to the stack log until the user stops it.
    return 'ok';
  }

  const manager = getPackageManager();
  if (!manager) {
    fail(io, 'The package manager is no longer available. Please restart setup.');
    return 'abort';
  }
  const child = spawn(manager.command, [...manager.prefix, 'dev:local'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, HAMAFX_LOCAL_DEV: '1' },
  });
  child.on('error', (err) => {
    warn(io, `Failed to start the app: ${err.message}`);
  });
  child.on('spawn', async () => {
    const spinner = startSpinner(io, 'Waiting for the app to become ready');
    const ready = await waitForApp(HEALTH_URL, 120_000);
    spinner.stop(ready ? 'The app is ready' : null);
    if (ready) {
      ok(io, 'The app is ready. Opening it in your browser.');
      openBrowser(io, APP_URL);
    } else {
      warn(io, 'The app is still starting. Open the URL in a moment.');
    }
  });
  return 'ok';
}

function printDockerHints(io) {
  io.line();
  io.line(`  ${paint('Web app:', 'bold')}    ${APP_URL}`);
  io.line(`  ${paint('Logs:', 'dim')}       docker compose logs -f app`);
  io.line(`  ${paint('Stop:', 'dim')}       docker compose down`);
  io.line();
}
