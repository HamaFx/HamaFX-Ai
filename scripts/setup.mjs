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
 * scripts/setup.mjs — Interactive first-run setup wizard for HamaFX-Ai.
 *
 * HamaFX-Ai uses BYOK (Bring Your Own Key): each user adds their own AI
 * provider API key via the in-app Settings → API Keys page after
 * registration. No server-level AI keys are required to boot the app.
 *
 * This wizard:
 *   1. Checks prerequisites (Node, pnpm, Git, Docker)
 *   2. Helps choose a setup mode (Local Dev vs Docker)
 *   3. Explains the BYOK model and lists supported providers
 *   4. Collects optional market data provider keys (env-level)
 *   5. Generates secrets & writes config (BYOK_ENABLED=1)
 *   6. Installs dependencies and offers to start the app
 *
 * Usage:  pnpm setup   (or: node scripts/setup.mjs)
 */

import { execSync, spawn } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

// ═══════════════════════════════════════════════════════════════════════════
//  Terminal Helpers
// ═══════════════════════════════════════════════════════════════════════════

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgBlue: '\x1b[44m',
  bgCyan: '\x1b[46m',
  bgBlack: '\x1b[40m',
  // 256-color palette
  sky: '\x1b[38;5;75m',
  teal: '\x1b[38;5;80m',
  lime: '\x1b[38;5;113m',
  gold: '\x1b[38;5;220m',
  coral: '\x1b[38;5;209m',
  lavender: '\x1b[38;5;183m',
  gray: '\x1b[38;5;245m',
  darkGray: '\x1b[38;5;238m',
};

function paint(text, ...colors) {
  return colors.map(co => C[co] ?? '').join('') + text + C.reset;
}

function line(text = '') { console.log(text); }
function ok(msg) { console.log(`  ${paint('✓', 'green')} ${msg}`); }
function warn(msg) { console.log(`  ${paint('⚠', 'yellow')} ${msg}`); }
function fail(msg) { console.log(`  ${paint('✗', 'red')} ${msg}`); }
function info(msg) { console.log(`  ${paint('ℹ', 'sky')} ${msg}`); }

// ── Spinner ─────────────────────────────────────────────────────────────────

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerInterval = null;
let spinnerActive = false;

function startSpinner(msg) {
  if (spinnerActive) stopSpinner();
  spinnerActive = true;
  let i = 0;
  process.stdout.write(`  ${paint(SPINNER_FRAMES[0], 'cyan')} ${msg}...`);
  spinnerInterval = setInterval(() => {
    process.stdout.write(`\r  ${paint(SPINNER_FRAMES[i % SPINNER_FRAMES.length], 'cyan')} ${msg}...`);
    i++;
  }, 80);
}

function stopSpinner(successMsg = null) {
  if (!spinnerActive) return;
  spinnerActive = false;
  clearInterval(spinnerInterval);
  spinnerInterval = null;
  process.stdout.write('\r' + ' '.repeat(60) + '\r');
  if (successMsg) ok(successMsg);
}

// ── Box drawing ─────────────────────────────────────────────────────────────

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function box(title, lines, opts = {}) {
  const color = opts.color ?? 'cyan';
  const minWidth = opts.minWidth ?? 50;
  const titleLen = title ? title.length + 4 : 0;
  const maxContent = Math.max(...lines.map(l => stripAnsi(l).length), titleLen, minWidth);
  const width = maxContent + 4;

  const tl = '╔', tr = '╗', bl = '╚', br = '╝', h = '═', v = '║';

  let out = '';
  if (title) {
    const titlePad = Math.max(0, width - title.length - 2);
    out += `  ${paint(tl + h + ' ', color)}${paint(title, 'bold')}${' '.repeat(titlePad)}${paint(' ' + h + tr, color)}\n`;
  } else {
    out += `  ${paint(tl + h.repeat(width), color)}${paint(tr, color)}\n`;
  }

  for (const l of lines) {
    const stripped = stripAnsi(l);
    const pad = Math.max(0, width - stripped.length - 2);
    out += `  ${paint(v, color)} ${l}${' '.repeat(pad)} ${paint(v, color)}\n`;
  }

  out += `  ${paint(bl + h.repeat(width), color)}${paint(br, color)}`;
  console.log(out);
}

// ── Progress ─────────────────────────────────────────────────────────────────

let totalSteps = 6;
let currentStep = 0;

function stepHeader(title) {
  currentStep++;
  line();
  console.log(`  ${paint(`[${currentStep}/${totalSteps}]`, 'dim')} ${paint(title, 'bold', 'cyan')}`);
  console.log(`  ${paint('─'.repeat(52), 'darkGray')}`);
}

// ── Utility ──────────────────────────────────────────────────────────────────

function hasBin(cmd) {
  try { execSync(`command -v ${cmd}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
}

function getVersion(cmd, flag = '--version') {
  try { return execSync(`${cmd} ${flag}`, { encoding: 'utf-8' }).trim(); }
  catch { return null; }
}

function maskKey(key) {
  if (!key || key.length < 8) return key;
  return key.slice(0, 4) + '•'.repeat(Math.min(20, key.length - 8)) + key.slice(-4);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Banner
// ═══════════════════════════════════════════════════════════════════════════

function printBanner() {
  const logo = [
    '  _   _  _   _  ___  ___  ___  ___  ___ ',
    ' | | | || \\ | || __|| _ \\/ __|| __|| _ \\',
    ' | |_| ||  \\| || _| |   /\\__ \\| _| |   /',
    '  \\___/ |_|\\_||___||_|_\\|___/|___||_|_\\',
    '                                         ',
    '         A I  ·  T R A D I N G  ·  P L A T F O R M',
  ];

  const gradientColors = ['cyan', 'sky', 'teal', 'lime', 'gold', 'coral'];

  line();
  for (let i = 0; i < logo.length; i++) {
    const color = gradientColors[i % gradientColors.length];
    console.log(paint(logo[i], color));
  }
  line();
  console.log(paint('  The open-source, multi-user AI trading platform', 'dim'));
  console.log(paint('  Apache 2.0 Licensed · Built with Next.js, Drizzle, pgvector', 'dim'));
  line();
}

// ═══════════════════════════════════════════════════════════════════════════
//  BYOK Provider Info (for display only — keys are collected in-app)
// ═══════════════════════════════════════════════════════════════════════════

const BYOK_PROVIDERS_INFO = [
  { name: 'Google Gemini',    tier: 'Free',    hint: 'AIza…',           url: 'https://aistudio.google.com/apikey',                  color: 'lime' },
  { name: 'Anthropic',        tier: 'Medium',  hint: 'sk-ant-…',        url: 'https://console.anthropic.com/settings/keys',         color: 'coral' },
  { name: 'OpenAI',           tier: 'Medium',  hint: 'sk-…',            url: 'https://platform.openai.com/api-keys',                color: 'teal' },
  { name: 'Groq',             tier: 'Free',    hint: 'gsk_…',           url: 'https://console.groq.com/keys',                       color: 'gold' },
  { name: 'Mistral',          tier: 'Low',     hint: '…',               url: 'https://console.mistral.ai/api-keys',                 color: 'sky' },
  { name: 'OpenRouter',       tier: 'Medium',  hint: 'sk-or-…',         url: 'https://openrouter.ai/keys',                          color: 'lavender' },
  { name: 'xAI (Grok)',       tier: 'Medium',  hint: 'xai-…',           url: 'https://console.x.ai',                                color: 'white' },
  { name: 'DeepSeek',         tier: 'Low',     hint: 'sk-…',            url: 'https://platform.deepseek.com/api_keys',              color: 'cyan' },
  { name: 'Google Vertex AI', tier: 'Medium',  hint: 'Service account',  url: 'https://console.cloud.google.com/vertex-ai',          color: 'sky' },
];

const MARKET_DATA_PROVIDERS = [
  { id: 'finnhub',     label: 'Finnhub',                 envKey: 'FINNHUB_API_KEY',      hint: 'Stocks, forex, crypto news',  url: 'https://finnhub.io/dashboard',                  minLen: 15, color: 'teal' },
  { id: 'marketaux',   label: 'Marketaux',               envKey: 'MARKETAUX_API_KEY',    hint: 'Financial news feed',         url: 'https://marketaux.com/dashboard',               minLen: 15, color: 'sky' },
  { id: 'fred',        label: 'FRED (Federal Reserve)',  envKey: 'FRED_API_KEY',         hint: 'Economic data & calendar',    url: 'https://fredaccount.stlouisfed.org/apikeys',    minLen: 20, color: 'gold' },
  { id: 'alphavantage',label: 'Alpha Vantage',           envKey: 'ALPHAVANTAGE_API_KEY', hint: 'Stocks, forex, indicators',   url: 'https://www.alphavantage/support/#api-key',     minLen: 10, color: 'lime' },
];

// ═══════════════════════════════════════════════════════════════════════════
//  Main
// ═══════════════════════════════════════════════════════════════════════════

let rl;
const collectedMarketKeys = {}; // envKey -> value
let selectedMode = 'local';

async function main() {
  printBanner();

  // Graceful Ctrl+C
  process.on('SIGINT', () => {
    if (spinnerActive) stopSpinner();
    line();
    warn('Setup interrupted. Re-run anytime: pnpm setup');
    process.exit(130);
  });

  rl = createInterface({ input: stdin, output: stdout });

  // ── Step 1: Prerequisites ──────────────────────────────────────────────
  stepHeader('Checking prerequisites');

  const checks = [
    { name: 'Node.js', bin: 'node', minVersion: '20', installHint: 'https://nodejs.org/ (install v20+)' },
    { name: 'pnpm', bin: 'pnpm', minVersion: '9', installHint: 'npm install -g pnpm  (or: corepack enable)' },
    { name: 'Git', bin: 'git', minVersion: null, installHint: 'https://git-scm.com/' },
  ];

  let allOk = true;

  for (const { name, bin, minVersion, installHint } of checks) {
    if (hasBin(bin)) {
      const ver = getVersion(bin);
      if (minVersion && ver) {
        const major = ver.match(/v?(\d+)/)?.[1];
        if (major && Number(major) >= Number(minVersion)) {
          ok(`${name} ${paint(ver, 'dim')}`);
        } else {
          warn(`${name} ${ver} — needs v${minVersion}+`);
          console.log(`    ${paint('Upgrade:', 'dim')} ${installHint}`);
          allOk = false;
        }
      } else {
        ok(`${name} ${paint(ver ?? '', 'dim')}`);
      }
    } else {
      fail(`${name} not found`);
      console.log(`    ${paint('Install:', 'dim')} ${installHint}`);
      allOk = false;
    }
  }

  const hasDocker = hasBin('docker');
  if (hasDocker) {
    ok(`Docker ${paint(getVersion('docker') ?? '', 'dim')}`);
  } else {
    console.log(`  ${paint('○', 'gray')} Docker ${paint('not found (optional — needed for Docker mode)', 'dim')}`);
  }

  if (!allOk) {
    line();
    fail('Some prerequisites are missing. Install them and re-run: pnpm setup');
    rl.close();
    process.exit(1);
  }

  // ── Step 2: Mode Selection ─────────────────────────────────────────────
  stepHeader('Choose your setup mode');

  const localFeatures = [
    ['✓', 'Embedded Postgres (PGlite)', 'No Docker needed'],
    ['✓', 'Fast startup & hot reload', 'Best for development'],
    ['✓', 'Full web app + AI chat', '78 API routes'],
    ['✓', 'Auth, journal, alerts', 'Settings, onboarding'],
    ['✗', 'Vector search (RAG)', 'pgvector not in PGlite'],
    ['✗', 'Live market data', 'No worker process'],
    ['✗', 'Langfuse observability', 'Needs Docker'],
  ];

  const dockerFeatures = [
    ['✓', 'Postgres 16 + pgvector', 'Full RAG & memory'],
    ['✓', 'Worker daemon', 'Live SignalR + crons'],
    ['✓', 'Langfuse UI', 'LLM observability'],
    ['✓', 'All features enabled', 'Production-ready'],
    ['!', 'Slower first start', 'Docker build ~3-5 min'],
    ['!', 'More resource usage', '~2GB RAM recommended'],
  ];

  box('Local Dev (PGlite)', [
    `${paint('Recommended for:', 'bold')} trying the app & contributing`,
    '',
    ...localFeatures.map(([icon, feat, desc]) =>
      `${icon === '✓' ? paint('✓', 'green') : paint('✗', 'red')}  ${feat.padEnd(28)} ${paint(desc, 'dim')}`
    ),
    '',
    `${paint('Command:', 'bold')} pnpm dev:local`,
  ], { color: 'cyan', minWidth: 54 });

  line();

  box('Docker Compose (Full Features)', [
    `${paint('Recommended for:', 'bold')} self-hosting & full features`,
    '',
    ...dockerFeatures.map(([icon, feat, desc]) =>
      `${icon === '✓' ? paint('✓', 'green') : icon === '!' ? paint('!', 'yellow') : paint('✗', 'red')}  ${feat.padEnd(28)} ${paint(desc, 'dim')}`
    ),
    '',
    `${paint('Command:', 'bold')} docker compose up -d`,
  ], { color: 'teal', minWidth: 54 });

  line();

  if (!hasDocker) {
    info('Docker not detected — Local Dev mode is your only option.');
    selectedMode = 'local';
  } else {
    const choice = await rl.question(`  Choose mode ${paint('[1=Local / 2=Docker]', 'dim')} (default: 1): `);
    selectedMode = choice.trim() === '2' ? 'docker' : 'local';
  }

  line();
  console.log(`  ${paint('→', 'green')} Selected: ${paint(selectedMode === 'docker' ? 'Docker Compose' : 'Local Dev', 'bold', selectedMode === 'docker' ? 'teal' : 'cyan')}`);

  // ── Step 3: BYOK Explanation ───────────────────────────────────────────
  stepHeader('AI Providers — Bring Your Own Key (BYOK)');

  console.log(`  HamaFX-Ai uses ${paint('BYOK', 'bold', 'cyan')} (Bring Your Own Key).`);
  console.log(`  ${paint('No server-level AI keys are needed to start the app.', 'dim')}`);
  line();
  console.log(`  After registering, you'll add your AI provider key via the`);
  console.log(`  ${paint('onboarding wizard', 'bold')} or ${paint('Settings → API Keys', 'bold')}.`);
  console.log(`  Your key is encrypted at rest (AES-256-GCM) and never leaves your device.`);
  line();
  console.log(`  ${paint('Supported providers:', 'bold')}`);
  line();

  for (const p of BYOK_PROVIDERS_INFO) {
    const tierColor = p.tier === 'Free' ? 'green' : p.tier === 'Low' ? 'lime' : 'gold';
    console.log(`  ${paint('●', p.color)} ${paint(p.name.padEnd(22), 'bold', p.color)} ${paint(p.tier, tierColor)} ${paint(`(${p.hint})`, 'dim')}`);
    console.log(`     ${paint('Get key:', 'dim')} ${p.url}`);
  }

  line();
  info('You can add multiple providers and switch between them in the app.');
  info('Free tier providers (Google Gemini, Groq) are great for trying it out.');

  // ── Step 4: Market Data Keys (Optional) ────────────────────────────────
  stepHeader('Market data providers (optional)');

  console.log(`  Market data keys are ${paint('optional', 'bold')} — the app works without them.`);
  console.log(`  They unlock live news, economic calendars, and enriched data.`);
  console.log(`  ${paint('Pick multiple by comma-separating numbers', 'dim')}`);
  line();

  for (let i = 0; i < MARKET_DATA_PROVIDERS.length; i++) {
    const p = MARKET_DATA_PROVIDERS[i];
    console.log(`  ${paint(`${i + 1}.`, 'cyan')} ${paint(p.label, 'bold', p.color)} ${paint(`(${p.hint})`, 'dim')}`);
    console.log(`     ${paint('Get key:', 'dim')} ${p.url}`);
  }

  line();
  console.log(`  ${paint('0.', 'dim')} Skip all`);
  line();

  const marketInput = await rl.question(`  Select provider(s) (default: 0 — skip): `);
  const marketTrimmed = marketInput.trim() || '0';

  if (marketTrimmed !== '0') {
    const indices = marketTrimmed.split(',').map(s => parseInt(s.trim(), 10)).filter(n => n >= 1 && n <= MARKET_DATA_PROVIDERS.length);

    for (const idx of indices) {
      const provider = MARKET_DATA_PROVIDERS[idx - 1];
      const key = (await rl.question(`    ${provider.label} API key: `)).trim();

      if (key) {
        collectedMarketKeys[provider.envKey] = key;
        ok(`${provider.label} key saved ${paint(maskKey(key), 'dim')}`);
      } else {
        warn(`No key for ${provider.label} — skipping`);
      }
    }
  } else {
    info('Skipped market data providers — add them later in .env.local');
  }

  // ── Step 5: Generate Secrets & Write Config ────────────────────────────
  stepHeader('Generating secrets & writing config');

  if (selectedMode === 'local') {
    const envLocalPath = resolve(repoRoot, '.env.local');
    let existing = '';
    if (existsSync(envLocalPath)) {
      existing = readFileSync(envLocalPath, 'utf-8');
      info(`Existing .env.local found — merging new keys`);
    }

    const lines = [];

    // Enable BYOK mode
    if (!existing.includes('BYOK_ENABLED=')) {
      lines.push('BYOK_ENABLED=1');
    } else {
      existing = existing.replace(/^BYOK_ENABLED=.*/m, 'BYOK_ENABLED=1');
    }

    // Write market data keys
    for (const [key, val] of Object.entries(collectedMarketKeys)) {
      if (!existing.includes(`${key}=`)) {
        lines.push(`${key}=${val}`);
      } else {
        existing = existing.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${val}`);
      }
    }

    if (lines.length > 0) {
      if (existing && !existing.endsWith('\n')) appendFileSync(envLocalPath, '\n');
      appendFileSync(envLocalPath, lines.join('\n') + '\n');
      ok(`Wrote ${lines.length} env var(s) to ${paint('.env.local', 'dim')}`);
    } else if (existing) {
      ok(`.env.local already configured ${paint('(no changes needed)', 'dim')}`);
    }

    ok(`BYOK mode enabled ${paint('(BYOK_ENABLED=1)', 'dim')}`);
    ok(`Auth & encryption secrets auto-generate to ${paint('.hamafx/dev-secrets.json', 'dim')} on first boot`);
  } else {
    // Docker mode
    const initScript = resolve(repoRoot, 'docker/init-secrets.sh');
    if (existsSync(initScript)) {
      try {
        execSync(`bash "${initScript}"`, { stdio: 'pipe', cwd: repoRoot });
        ok('Docker secrets generated via init-secrets.sh');
      } catch {
        info('init-secrets.sh: .env already exists — keeping it');
      }
    }

    const envPath = resolve(repoRoot, '.env');
    let envExisting = '';
    if (existsSync(envPath)) {
      envExisting = readFileSync(envPath, 'utf-8');
    }

    const lines = [];

    // Enable BYOK mode
    if (!envExisting.includes('BYOK_ENABLED=')) {
      lines.push('BYOK_ENABLED=1');
    } else {
      envExisting = envExisting.replace(/^BYOK_ENABLED=.*/m, 'BYOK_ENABLED=1');
    }

    // Write market data keys
    for (const [key, val] of Object.entries(collectedMarketKeys)) {
      if (!envExisting.includes(`${key}=`)) {
        lines.push(`${key}=${val}`);
      } else {
        envExisting = envExisting.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${val}`);
      }
    }

    if (lines.length > 0) {
      if (envExisting && !envExisting.endsWith('\n')) appendFileSync(envPath, '\n');
      appendFileSync(envPath, lines.join('\n') + '\n');
      ok(`Wrote ${lines.length} env var(s) to ${paint('.env', 'dim')}`);
    }

    ok(`BYOK mode enabled ${paint('(BYOK_ENABLED=1)', 'dim')}`);
  }

  // ── Step 6: Install Dependencies ───────────────────────────────────────
  stepHeader('Installing dependencies');

  if (selectedMode === 'local') {
    startSpinner('Running pnpm install');
    try {
      execSync('pnpm install --frozen-lockfile', { stdio: 'pipe', cwd: repoRoot });
      stopSpinner('Dependencies installed (frozen lockfile)');
    } catch {
      stopSpinner();
      startSpinner('Retrying without lockfile');
      try {
        execSync('pnpm install', { stdio: 'pipe', cwd: repoRoot });
        stopSpinner('Dependencies installed');
      } catch {
        stopSpinner();
        fail('pnpm install failed — try running it manually');
        rl.close();
        process.exit(1);
      }
    }
  } else {
    info('Docker mode — dependencies install during docker compose build');
    ok('Skipping local install');
  }

  // ── Summary ────────────────────────────────────────────────────────────
  line();
  console.log(`  ${paint('─'.repeat(52), 'darkGray')}`);
  line();

  const summaryLines = [
    `${paint('Mode:', 'bold')}           ${selectedMode === 'docker' ? 'Docker Compose' : 'Local Dev (PGlite)'}`,
    `${paint('AI providers:', 'bold')}     ${paint('BYOK — add keys after registration', 'cyan')}`,
    `${paint('Market data:', 'bold')}      ${Object.keys(collectedMarketKeys).length || paint('none (optional)', 'dim')}`,
  ];

  if (Object.keys(collectedMarketKeys).length > 0) {
    const names = Object.keys(collectedMarketKeys).map(k => {
      const provider = MARKET_DATA_PROVIDERS.find(p => p.envKey === k);
      return provider ? provider.label : k;
    });
    summaryLines.push(`                 ${paint(names.join(', '), 'dim')}`);
  }

  summaryLines.push(`${paint('BYOK:', 'bold')}           ${paint('Enabled', 'green')} ${paint('(BYOK_ENABLED=1)', 'dim')}`);
  summaryLines.push(`${paint('Config file:', 'bold')}     ${selectedMode === 'docker' ? '.env' : '.env.local'}`);
  summaryLines.push(`${paint('Next steps:', 'bold')}`);
  summaryLines.push(`  1. Start the app`);
  summaryLines.push(`  2. Register at /register`);
  summaryLines.push(`  3. Add your AI key in the onboarding wizard`);

  box('Setup Summary', summaryLines, { color: 'green', minWidth: 52 });

  // ── Start ──────────────────────────────────────────────────────────────
  line();
  console.log(`  ${paint('Ready to launch! 🚀', 'bold', 'green')}`);
  line();

  if (selectedMode === 'local') {
    console.log(`  ${paint('Start command:', 'bold')} ${paint('pnpm dev:local', 'green')}`);
    console.log(`  ${paint('App URL:', 'bold')}       http://localhost:3000`);
    console.log(`  ${paint('Register:', 'bold')}      http://localhost:3000/register`);
    line();

    const startNow = await rl.question(`  Start dev server now? ${paint('[Y/n]', 'dim')} `);

    if (startNow.trim().toLowerCase() !== 'n') {
      line();
      console.log(`  ${paint('Starting HamaFX-Ai...', 'cyan')}`);
      console.log(`  ${paint('Press Ctrl+C to stop', 'dim')}`);
      line();

      rl.close();

      const child = spawn('pnpm', ['dev:local'], {
        cwd: repoRoot,
        stdio: 'inherit',
        env: { ...process.env, HAMAFX_LOCAL_DEV: '1' },
      });

      child.on('exit', (code) => process.exit(code ?? 0));
    } else {
      line();
      console.log(`  ${paint('Run when ready:', 'dim')}`);
      console.log(`  ${paint('pnpm dev:local', 'green')}`);
      line();
      rl.close();
    }
  } else {
    console.log(`  ${paint('Start command:', 'bold')} ${paint('docker compose up -d --build', 'green')}`);
    console.log(`  ${paint('App URL:', 'bold')}       http://localhost:3000`);
    console.log(`  ${paint('Langfuse:', 'bold')}      http://localhost:3001`);
    console.log(`  ${paint('Register:', 'bold')}      http://localhost:3000/register`);
    line();

    const startNow = await rl.question(`  Start Docker stack now? ${paint('[Y/n]', 'dim')} `);

    if (startNow.trim().toLowerCase() !== 'n') {
      line();
      console.log(`  ${paint('Building & starting Docker stack...', 'cyan')}`);
      console.log(`  ${paint('First build takes a few minutes...', 'dim')}`);
      line();

      rl.close();

      const child = spawn('docker', ['compose', 'up', '-d', '--build'], {
        cwd: repoRoot,
        stdio: 'inherit',
      });

      child.on('exit', (code) => {
        if (code === 0) {
          line();
          ok('Docker stack is running!');
          line();
          console.log(`  ${paint('Web app:', 'bold')}    http://localhost:3000`);
          console.log(`  ${paint('Langfuse:', 'bold')}   http://localhost:3001`);
          line();
          console.log(`  ${paint('Logs:', 'dim')}  docker compose logs -f app`);
          console.log(`  ${paint('Stop:', 'dim')}  docker compose down`);
          line();
        } else {
          fail('Docker compose failed. Check the output above.');
        }
        process.exit(code ?? 1);
      });
    } else {
      line();
      console.log(`  ${paint('Run when ready:', 'dim')}`);
      console.log(`  ${paint('docker compose up -d --build', 'green')}`);
      line();
      rl.close();
    }
  }
}

main().catch((err) => {
  if (spinnerActive) stopSpinner();
  line();
  fail(`Setup failed: ${err.message}`);
  process.exit(1);
});
