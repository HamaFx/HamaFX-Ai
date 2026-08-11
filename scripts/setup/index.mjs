#!/usr/bin/env node
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

/**
 * HamaFX-Ai interactive setup wizard.
 *
 *   pnpm setup                     # full interactive flow
 *   pnpm setup --mode=docker       # skip mode question
 *   pnpm setup --yes               # accept defaults, no prompts
 *   pnpm setup --dry-run           # show what would change, write nothing
 *   pnpm setup --json              # machine-readable result on stdout
 *   pnpm setup --help
 *
 * Zero runtime dependencies: everything here is Node stdlib, so the
 * wizard runs before `pnpm install` on a fresh clone.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createIO } from './lib/io.mjs';
import { CancelError, restoreTerminal } from './lib/prompts.mjs';
import {
  beginPage,
  endPage,
  fail,
  paint,
  printBanner,
  setColorEnabled,
  showCursor,
  stepHeader,
  warn,
} from './lib/ui.mjs';
import * as configStep from './steps/config.mjs';
import * as detectStep from './steps/detect-existing.mjs';
import * as installStep from './steps/install.mjs';
import * as launchStep from './steps/launch.mjs';
import * as marketStep from './steps/market-data.mjs';
import * as modeStep from './steps/mode.mjs';
import * as prereqsStep from './steps/prereqs.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');

// Plain { title, hint, run } objects (not namespace references) so static
// analyzers can trace the exports of each step module.
export const STEPS = [
  { title: prereqsStep.title, hint: prereqsStep.hint, run: prereqsStep.run },
  { title: modeStep.title, hint: modeStep.hint, run: modeStep.run },
  { title: detectStep.title, hint: detectStep.hint, run: detectStep.run },
  { title: marketStep.title, hint: marketStep.hint, run: marketStep.run },
  { title: configStep.title, hint: configStep.hint, run: configStep.run },
  { title: installStep.title, hint: installStep.hint, run: installStep.run },
  { title: launchStep.title, hint: launchStep.hint, run: launchStep.run },
];

/** Minimal flag parser — no dependency, exact semantics we need. */
export function parseFlags(argv) {
  const flags = {
    mode: null,
    market: null,
    skipInstall: false,
    noLaunch: false,
    yes: false,
    dryRun: false,
    fresh: false,
    json: false,
    noColor: false,
    help: false,
    version: false,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') flags.help = true;
    else if (arg === '--version' || arg === '-v') flags.version = true;
    else if (arg === '--yes' || arg === '-y') flags.yes = true;
    else if (arg === '--dry-run') flags.dryRun = true;
    else if (arg === '--skip-install') flags.skipInstall = true;
    else if (arg === '--no-launch') flags.noLaunch = true;
    else if (arg === '--fresh') flags.fresh = true;
    else if (arg === '--json') flags.json = true;
    else if (arg === '--no-color') flags.noColor = true;
    else if (arg.startsWith('--mode=')) flags.mode = arg.slice('--mode='.length);
    else if (arg === '--mode') flags.mode = argv[++i] ?? null;
    else if (arg.startsWith('--market=')) flags.market = arg.slice('--market='.length);
    else if (arg === '--market') flags.market = argv[++i] ?? null;
    else if (arg === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    } else if (arg.startsWith('-')) {
      // Unknown flag — collect for a warning below.
      flags.unknown = [...(flags.unknown ?? []), arg];
    } else {
      positional.push(arg);
    }
  }
  flags.positional = positional;
  return flags;
}

export function printHelp(io) {
  io.line(paint('HamaFX-Ai setup wizard', 'bold', 'cyan'));
  io.line();
  io.line('  Usage:  pnpm setup [options]');
  io.line('          node scripts/setup.mjs [options]');
  io.line();
  io.line('  Options:');
  io.line('    --mode=simple|docker   Skip the mode question');
  io.line('    --market=ID,ID         Market providers to configure (e.g. finnhub,fred)');
  io.line('    --fresh                Regenerate config (previous config is backed up)');
  io.line('    --skip-install         Do not install dependencies');
  io.line('    --no-launch            Do not start the app afterwards');
  io.line('    --yes                  Accept defaults; never prompt');
  io.line('    --dry-run              Print what would change, write nothing');
  io.line('    --json                 Machine-readable result on stdout');
  io.line('    --no-color             Plain output (or set NO_COLOR)');
  io.line('    --help, -h             Show this help');
  io.line('    --version, -v          Show the version');
  io.line();
  io.line('  Examples:');
  io.line('    pnpm setup                     # interactive (recommended)');
  io.line('    pnpm setup --mode=simple --yes # quiet, non-interactive');
  io.line('    pnpm setup --dry-run           # preview before changing anything');
}

export function getVersion() {
  try {
    const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function buildResult(ctx, flags) {
  const { answers } = ctx;
  return {
    ok: true,
    mode: answers.mode,
    configFile: answers.mode === 'docker' ? '.env' : '.env.local',
    marketProviders: answers.marketProviders,
    marketKeysConfigured: Object.keys(answers.marketKeys),
    existingAction: answers.existingAction,
    dryRun: flags.dryRun,
  };
}

export async function main(argv = process.argv.slice(2), { io: customIo, jsonStream } = {}) {
  const flags = parseFlags(argv);
  const jsonMode = flags.json;
  const io = customIo ?? createIO({ stdout: jsonMode ? process.stderr : process.stdout });
  // Full-screen page mode only on a real TTY outside --json (which is
  // stdout-pure). Everything else keeps the scrolling transcript.
  const pageMode = !jsonMode && Boolean(io.stdout?.isTTY);
  const restoreCursor = () => {
    if (pageMode) showCursor(io);
  };
  const writeJson = (obj) => {
    const target = jsonStream ?? process.stdout;
    target.write(`${JSON.stringify(obj, null, 2)}\n`);
  };
  // Give non-interactive pages a beat on screen so the user can read
  // them before the next page clears (interactive steps set io.prompted).
  const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
  const PAGE_READ_MS = 650;

  if (flags.noColor) setColorEnabled(false);
  if (flags.help) {
    printHelp(io);
    return 0;
  }
  if (flags.version) {
    io.line(getVersion());
    return 0;
  }
  if (flags.mode && !['simple', 'docker'].includes(flags.mode)) {
    if (jsonMode) {
      writeJson({
        ok: false,
        error: `Unknown mode: ${flags.mode} (use --mode=simple or --mode=docker)`,
      });
    } else {
      io.line();
      fail(io, `Unknown mode: ${flags.mode} (use --mode=simple or --mode=docker)`);
    }
    return 1;
  }
  if (flags.unknown?.length) {
    io.line();
    warn(io, `Ignoring unknown flag(s): ${flags.unknown.join(', ')}`);
  }

  // Graceful SIGINT outside prompts (e.g. during install/spinner).
  process.on('SIGINT', () => {
    restoreTerminal();
    restoreCursor();
    if (jsonMode) {
      writeJson({ ok: false, cancelled: true });
    } else {
      io.line();
      warn(io, 'Setup interrupted. Re-run anytime: pnpm setup');
    }
    process.exit(130);
  });

  if (!jsonMode && !pageMode) printBanner(io);

  const ctx = {
    io,
    flags,
    root: REPO_ROOT,
    pageMode,
    prereqs: null,
    answers: {
      mode: null,
      existingAction: 'continue',
      marketKeys: {},
      marketProviders: [],
    },
  };

  try {
    let i = 0;
    while (i < STEPS.length) {
      const step = STEPS[i];
      if (!jsonMode) {
        if (pageMode) {
          beginPage(io, { pageMode, step: i + 1, total: STEPS.length, title: step.title });
        } else {
          stepHeader(io, { index: i + 1, total: STEPS.length, title: step.title });
        }
      }
      io.prompted = false;
      const result = await step.run(ctx);
      if (pageMode && result !== 'back') endPage(io, { hint: step.hint });
      if (result === 'back') {
        i = Math.max(0, i - 1);
        continue;
      }
      if (result === 'abort') {
        restoreCursor();
        if (jsonMode) {
          writeJson({ ok: false, cancelled: true });
        } else {
          io.line();
          warn(io, 'Setup cancelled — nothing was changed.');
        }
        return 130;
      }
      i++;
      // Read-time pause after auto-advancing pages, so synchronous steps
      // (prereqs, config, ...) stay visible before the next page clears.
      if (pageMode && result === 'ok' && !io.prompted && i < STEPS.length) {
        await sleep(PAGE_READ_MS);
      }
    }
    if (jsonMode) writeJson(buildResult(ctx, flags));
    return 0;
  } catch (err) {
    if (err instanceof CancelError) {
      restoreCursor();
      if (jsonMode) {
        writeJson({ ok: false, cancelled: true });
      } else {
        io.line();
        warn(io, 'Setup interrupted. Re-run anytime: pnpm setup');
      }
      return 130;
    }
    restoreCursor();
    if (jsonMode) {
      writeJson({ ok: false, error: err?.message ?? String(err) });
    } else {
      io.line();
      fail(io, `Setup failed: ${err?.message ?? err}`);
    }
    return 1;
  }
}

// Direct execution guard. NOTE: the scripts/setup.mjs wrapper calls main()
// itself, so only match this file — otherwise the wizard would run twice.
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(__dirname, 'index.mjs');

if (isMain) {
  const code = await main(process.argv.slice(2));
  process.exitCode = code;
}
