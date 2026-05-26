#!/usr/bin/env node
// Mobile Lighthouse runner for HamaFX-Ai (task 12.2 / requirement 4).
//
// Audits each route in LIGHTHOUSE_TARGETS twice with the mobile preset, keeps
// the higher Performance score (industry-standard noise reduction), and writes
// per-route JSON + a summary.md under <out>/<UTC-timestamp>/.
//
// Thresholds: Performance >= 90, Accessibility >= 95.
// On any miss the script lists the failing route+category+score and exits 1.
// A crash exits 2; a clean run exits 0.

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';

const LIGHTHOUSE_TARGETS = [
  '/chat',
  '/chart/XAUUSD',
  '/news',
  '/calendar',
  '/alerts',
  '/journal',
  '/settings',
  '/settings/usage',
];

const PERF_THRESHOLD = 90;
const A11Y_THRESHOLD = 95;

const USAGE = `Usage: node tools/lighthouse/run.mjs --base-url <url> --cookie <cookie> [--out <dir>]

Options:
  --base-url <url>     Base URL to audit (e.g. http://localhost:3000 or https://hama-fx-ai.vercel.app). Required.
  --cookie <cookie>    Cookie header value to bypass the password gate (e.g. "hfx_auth=<value>"). Required.
  --out <dir>          Output root directory (default: docs/lighthouse).
                       Reports land in <dir>/<UTC-timestamp>/.
  -h, --help           Print this help and exit 0.

Routes audited (mobile preset, twice each, higher Performance kept):
${LIGHTHOUSE_TARGETS.map((r) => `  - ${r}`).join('\n')}

Thresholds:
  Performance   >= ${PERF_THRESHOLD}
  Accessibility >= ${A11Y_THRESHOLD}
`;

/**
 * Parse a minimal `--flag value` style argv. Supports `--flag=value` too and
 * `-h` / `--help`. Unknown flags throw so typos are caught early.
 *
 * @param {string[]} argv
 * @returns {{ help: boolean, baseUrl?: string, cookie?: string, out?: string }}
 */
function parseArgs(argv) {
  const out = { help: false };
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    let key = raw;
    let value;
    const eq = raw.indexOf('=');
    if (raw.startsWith('--') && eq !== -1) {
      key = raw.slice(0, eq);
      value = raw.slice(eq + 1);
    }
    switch (key) {
      case '-h':
      case '--help':
        out.help = true;
        break;
      case '--base-url':
        out.baseUrl = value ?? argv[++i];
        break;
      case '--cookie':
        out.cookie = value ?? argv[++i];
        break;
      case '--out':
        out.out = value ?? argv[++i];
        break;
      default:
        throw new Error(`Unknown argument: ${raw}`);
    }
  }
  return out;
}

/**
 * UTC timestamp in a filesystem-safe form: YYYY-MM-DDTHH-MM-SSZ.
 */
function utcStamp(now = new Date()) {
  const iso = now.toISOString(); // 2025-01-02T03:04:05.678Z
  return iso.replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');
}

/**
 * Map a route to a filesystem-safe filename stem.
 *   "/chat"           -> "chat"
 *   "/chart/XAUUSD"   -> "chart_XAUUSD"
 *   "/settings/usage" -> "settings_usage"
 *   "/"               -> "root"
 */
function routeToFileStem(route) {
  const trimmed = route.replace(/^\/+/, '').replace(/\/+$/, '');
  if (trimmed === '') return 'root';
  return trimmed.replace(/\//g, '_');
}

/**
 * Resolve full URL by joining base + route, tolerating a trailing slash on base.
 */
function joinUrl(baseUrl, route) {
  const base = baseUrl.replace(/\/+$/, '');
  return base + route;
}

/**
 * Run Lighthouse against a single URL using the already-launched Chrome.
 * Returns the LHR (Lighthouse Result) object.
 */
async function runLighthouse(url, port, cookie) {
  const flags = {
    port,
    output: 'json',
    logLevel: 'error',
    onlyCategories: ['performance', 'accessibility'],
    // Mobile preset is the default in Lighthouse but pin formFactor explicitly
    // so we are not at the mercy of CLI default drift.
    formFactor: 'mobile',
    extraHeaders: { Cookie: cookie },
  };
  const result = await lighthouse(url, flags);
  if (!result || !result.lhr) {
    throw new Error(`Lighthouse returned no result for ${url}`);
  }
  return result.lhr;
}

/**
 * Pick the LHR with the higher Performance score (ties favour the first run).
 */
function pickHigherPerf(a, b) {
  const sa = a.categories.performance.score ?? 0;
  const sb = b.categories.performance.score ?? 0;
  return sa >= sb ? a : b;
}

function scoreToInt(score) {
  // Lighthouse returns scores in [0, 1]; null is possible if a category errored.
  return Math.round((score ?? 0) * 100);
}

async function audit(baseUrl, cookie, route) {
  const url = joinUrl(baseUrl, route);
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
  });
  try {
    const a = await runLighthouse(url, chrome.port, cookie);
    const b = await runLighthouse(url, chrome.port, cookie);
    return pickHigherPerf(a, b);
  } finally {
    await chrome.kill();
  }
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    console.error('');
    console.error(USAGE);
    process.exit(1);
  }

  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }
  if (!args.baseUrl) {
    console.error('Error: --base-url is required.\n');
    console.error(USAGE);
    process.exit(1);
  }
  if (!args.cookie) {
    console.error('Error: --cookie is required.\n');
    console.error(USAGE);
    process.exit(1);
  }

  const outRoot = args.out ?? 'docs/lighthouse';
  const stamp = utcStamp();
  const outDir = path.resolve(process.cwd(), outRoot, stamp);
  await fs.mkdir(outDir, { recursive: true });

  const summary = [
    `# Lighthouse run ${stamp}`,
    '',
    `Base URL: \`${args.baseUrl}\``,
    '',
    `Thresholds: Performance \u2265 ${PERF_THRESHOLD}, Accessibility \u2265 ${A11Y_THRESHOLD}.`,
    '',
    '| Route | Performance | Accessibility | Result |',
    '|---|---:|---:|---|',
  ];

  /** @type {{ route: string, category: 'performance' | 'accessibility', score: number, threshold: number }[]} */
  const failures = [];

  for (const route of LIGHTHOUSE_TARGETS) {
    console.log(`[lighthouse] auditing ${route} ...`);
    let lhr;
    try {
      lhr = await audit(args.baseUrl, args.cookie, route);
    } catch (e) {
      console.error(
        `[lighthouse] route ${route} failed to audit: ${e instanceof Error ? e.message : String(e)}`,
      );
      summary.push(`| ${route} | - | - | \u274C audit error |`);
      failures.push({ route, category: 'performance', score: 0, threshold: PERF_THRESHOLD });
      continue;
    }

    const perf = scoreToInt(lhr.categories.performance.score);
    const a11y = scoreToInt(lhr.categories.accessibility.score);

    const stem = routeToFileStem(route);
    try {
      await fs.writeFile(
        path.join(outDir, `${stem}.json`),
        JSON.stringify(lhr, null, 2),
        'utf8',
      );
    } catch (e) {
      // Per requirement 4.3: per-route write failure is logged but non-fatal.
      console.warn(
        `[lighthouse] failed to write ${stem}.json: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const passed = perf >= PERF_THRESHOLD && a11y >= A11Y_THRESHOLD;
    summary.push(`| ${route} | ${perf} | ${a11y} | ${passed ? '\u2705' : '\u274C'} |`);
    if (perf < PERF_THRESHOLD) {
      failures.push({ route, category: 'performance', score: perf, threshold: PERF_THRESHOLD });
    }
    if (a11y < A11Y_THRESHOLD) {
      failures.push({ route, category: 'accessibility', score: a11y, threshold: A11Y_THRESHOLD });
    }
    console.log(
      `[lighthouse] ${route} perf=${perf} a11y=${a11y} ${passed ? 'PASS' : 'FAIL'}`,
    );
  }

  try {
    await fs.writeFile(path.join(outDir, 'summary.md'), summary.join('\n') + '\n', 'utf8');
  } catch (e) {
    // Per requirement 4.3: also non-fatal so the partial JSON evidence survives.
    console.warn(
      `[lighthouse] failed to write summary.md: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  console.log('');
  console.log(`[lighthouse] reports written to ${outDir}`);

  if (failures.length > 0) {
    console.error('');
    console.error('Threshold failures:');
    for (const f of failures) {
      console.error(`  - ${f.route} ${f.category}=${f.score} (need >= ${f.threshold})`);
    }
    process.exit(1);
  }

  console.log(
    `[lighthouse] all ${LIGHTHOUSE_TARGETS.length} routes meet perf >= ${PERF_THRESHOLD} and a11y >= ${A11Y_THRESHOLD}.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error('[lighthouse] crashed:', e instanceof Error ? e.stack ?? e.message : e);
  process.exit(2);
});
