#!/usr/bin/env node
/**
 * OBS-09 (Phase 5.3): CI grep to block new `console.error(` in apps/web
 * and packages/ai. The structured pino logger should be used instead.
 *
 * Allow-listed exceptions (files that are permitted to use console.error):
 *   - apps/web/src/lib/logger.ts         — the logger itself
 *   - apps/web/src/instrumentation.ts    — Sentry registration (pre-init)
 *   - apps/web/src/instrumentation-client.ts — Sentry client (pre-init)
 *   - apps/web/src/app/global-error.tsx  — last-resort error boundary
 *   - apps/worker/src/log.ts             — worker logger (emits via console)
 *   - apps/worker/src/index.ts           — worker bootstrap (pre-logger)
 *   - Any file with an eslint-disable comment on the same line
 *
 * Usage: node scripts/check-console-errors.mjs
 * Exit 0 = pass, exit 1 = violations found.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

const SCAN_DIRS = [
  'apps/web/src',
  'packages/ai/src',
];

const ALLOW_LIST = new Set([
  'apps/web/src/lib/logger.ts',
  'apps/web/src/instrumentation.ts',
  'apps/web/src/instrumentation-client.ts',
  'apps/web/src/app/global-error.tsx',
  'apps/worker/src/log.ts',
  'apps/worker/src/index.ts',
]);

const CONSOLE_PATTERN = /console\.(error|warn|info)\s*\(/g;

function walk(dir, results = []) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, results);
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      results.push(full);
    }
  }
  return results;
}

let violations = 0;

for (const scanDir of SCAN_DIRS) {
  const absDir = join(ROOT, scanDir);
  let files;
  try {
    files = walk(absDir);
  } catch {
    // Directory may not exist in all checkouts
    continue;
  }

  for (const file of files) {
    const relPath = relative(ROOT, file);
    if (ALLOW_LIST.has(relPath)) continue;

    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip lines with eslint-disable comment
      if (line.includes('eslint-disable') && line.includes('no-console')) continue;

      const matches = [...line.matchAll(CONSOLE_PATTERN)];
      if (matches.length > 0) {
        const rel = relPath;
        const methods = matches.map((m) => m[1]).join(', ');
        console.error(`  ${rel}:${i + 1}  console.${methods}() — use the pino logger instead`);
        violations += 1;
      }
    }
  }
}

if (violations > 0) {
  console.error(`\n❌ Found ${violations} console.*() call(s) in apps/web or packages/ai.`);
  console.error('   Use the structured pino logger (createRequestLogger / createScopedLoggerWithContext) instead.');
  console.error('   See docs/review/07-observability-monitoring-review.md §OBS-09 for context.\n');
  process.exit(1);
} else {
  console.log('✅ No console.error/warn/info calls found in apps/web or packages/ai (allow-listed files excluded).');
  process.exit(0);
}
