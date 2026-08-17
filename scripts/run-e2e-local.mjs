#!/usr/bin/env node

/**
 * Run Playwright in bounded local shards.
 *
 * This is intentionally independent of GitHub Actions. Each shard gets its
 * own process, log, and exit status so a long local run can be resumed or
 * inspected without losing the results from earlier shards.
 *
 * Examples:
 *   pnpm test:e2e:local
 *   pnpm test:e2e:local -- --shards=4 --project=chromium
 *   pnpm test:e2e:local -- --shards=2 --grep="Accessibility"
 */

import { closeSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const shards = positiveInteger(args.shards ?? process.env.E2E_SHARDS ?? '4', 'shards');
const onlyShard = args['only-shard'] ? positiveInteger(args['only-shard'], 'only-shard') : null;
if (onlyShard !== null && onlyShard > shards) {
  throw new Error('--only-shard must be less than or equal to --shards');
}
const outputRoot = process.env.E2E_OUTPUT_DIR ?? 'artifacts/e2e-local';
const outputDir = resolve(root, onlyShard ? `${outputRoot}/shard-${onlyShard}-of-${shards}` : outputRoot);
const project = args.project ?? process.env.E2E_PROJECT ?? 'chromium';
const grep = args.grep;
const file = args.file;
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

mkdirSync(outputDir, { recursive: true });

const startedAt = new Date().toISOString();
const results = [];
let failed = false;

const shardNumbers = onlyShard === null
  ? Array.from({ length: shards }, (_, index) => index + 1)
  : [onlyShard];

for (const shard of shardNumbers) {
  const logPath = resolve(outputDir, `shard-${shard}-of-${shards}.log`);
  const logFd = openSync(logPath, 'w');
  const playwrightArgs = [
    '--filter',
    '@kestrel/web',
    'exec',
    'playwright',
    'test',
    `--project=${project}`,
    `--shard=${shard}/${shards}`,
  ];
  if (grep) playwrightArgs.push(`--grep=${grep}`);
  if (file) playwrightArgs.push(file);

  const started = Date.now();
  const result = spawnSync(pnpm, playwrightArgs, {
    cwd: root,
    env: {
      ...process.env,
      // Keep the local run on the protected auth path unless the operator
      // explicitly opts into a different mode for a throwaway environment.
      AUTH_MODE: process.env.AUTH_MODE ?? 'normal',
    },
    stdio: ['ignore', logFd, logFd],
  });
  closeSync(logFd);

  const exitCode = result.error
    ? null
    : result.status ?? (result.signal ? 1 : 0);
  const entry = {
    shard,
    totalShards: shards,
    project,
    logPath,
    exitCode,
    signal: result.signal ?? null,
    durationMs: Date.now() - started,
  };
  results.push(entry);
  if (exitCode !== 0) failed = true;

  process.stdout.write(
    `[e2e-local] shard ${shard}/${shards} ${exitCode === 0 ? 'passed' : 'failed'} — ${logPath}\n`,
  );
  if (failed) {
    process.stdout.write('[e2e-local] stopping after the first failed shard; inspect its log and rerun with --shards/--grep as needed.\n');
    break;
  }
}

const summary = {
  schemaVersion: 'kestrel.e2e-local.v1',
  startedAt,
  finishedAt: new Date().toISOString(),
  project,
  requestedShards: shards,
  selectedShard: onlyShard,
  completedShards: results.length,
  status: failed ? 'failed' : 'passed',
  results,
};
const summaryPath = resolve(outputDir, 'summary.json');
writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
process.stdout.write(`[e2e-local] summary: ${summaryPath}\n`);
process.exitCode = failed ? 1 : 0;

function parseArgs(argv) {
  const parsed = {};
  for (const value of argv) {
    if (!value.startsWith('--')) continue;
    const separator = value.indexOf('=');
    if (separator < 0) continue;
    parsed[value.slice(2, separator)] = value.slice(separator + 1);
  }
  return parsed;
}

function positiveInteger(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return parsed;
}
