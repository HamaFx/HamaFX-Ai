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
 *   1. Checks available prerequisites (Node, package manager, Docker)
 *   2. Helps choose a setup mode (Simple vs Full)
 *   3. Explains the BYOK model and lists all supported providers
 *   4. Collects optional market data provider keys (env-level)
 *   5. Generates secrets & writes config (BYOK_ENABLED=1)
 *   6. Installs dependencies and offers to start the app
 *
 * Usage:  pnpm setup   (or: corepack pnpm setup / node scripts/setup.mjs)
 */

import { execFileSync, execSync, spawn } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
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
  try {
    if (process.platform === 'win32') {
      execFileSync('where', [cmd], { stdio: 'ignore' });
    } else {
      execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    }
    return true;
  } catch {
    return false;
  }
}

function getVersion(cmd, flag = '--version') {
  try { return execFileSync(cmd, [flag], { encoding: 'utf-8' }).trim(); }
  catch { return null; }
}

function canUseDocker() {
  if (!hasBin('docker')) return false;
  try {
    execFileSync('docker', ['compose', 'version'], { stdio: 'ignore', timeout: 5_000 });
    execFileSync('docker', ['info'], { stdio: 'ignore', timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

async function waitForDocker(timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (canUseDocker()) return true;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
  }
  return false;
}

function getPackageManager() {
  if (hasBin('pnpm')) return { command: 'pnpm', prefix: [] };
  if (hasBin('corepack')) return { command: 'corepack', prefix: ['pnpm'] };
  return null;
}

function runPackageManager(args, options = {}) {
  const manager = getPackageManager();
  if (!manager) throw new Error('pnpm or Corepack was not found');
  return execFileSync(manager.command, [...manager.prefix, ...args], options);
}

function packageManagerLabel() {
  const manager = getPackageManager();
  return manager?.command === 'corepack' ? 'corepack pnpm' : 'pnpm';
}

function upsertEnvFile(filePath, values) {
  const existing = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  const lines = existing ? existing.split(/\r?\n/) : [];

  for (const [key, value] of Object.entries(values)) {
    if (/\r|\n/.test(String(value))) throw new Error(`${key} contains an invalid line break`);
    const index = lines.findIndex((line) => line.startsWith(`${key}=`));
    const nextLine = `${key}=${value}`;
    if (index >= 0) lines[index] = nextLine;
    else lines.push(nextLine);
  }

  const content = `${lines.filter((line, index) => index < lines.length - 1 || line !== '').join('\n').replace(/\n+$/, '')}\n`;
  writeFileSync(filePath, content, { mode: 0o600 });
  chmodSync(filePath, 0o600);
}

function randomHex(bytes) {
  return randomBytes(bytes).toString('hex');
}

function ensureDockerEnv(filePath) {
  const defaults = {
    POSTGRES_PASSWORD: randomHex(16),
    BACKUP_INTERVAL_SECONDS: '86400',
    BACKUP_RETENTION_DAYS: '7',
    BACKUP_MAX_AGE_SECONDS: '172800',
    LANGFUSE_NEXTAUTH_SECRET: randomHex(32),
    LANGFUSE_SALT: randomHex(16),
    AUTH_SECRET: randomHex(32),
    NEXTAUTH_URL: 'http://localhost:3000',
    CRON_SECRET: randomHex(16),
    ENCRYPTION_SECRET: randomHex(32),
    BYOK_ENABLED: '1',
    MULTI_USER_ENABLED: '0',
    REGISTRATION_MODE: 'owner-first',
    HAMAFX_ENABLE_RLS: '0',
  };
  const existing = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  const lines = existing ? existing.split(/\r?\n/) : [];
  const missing = {};

  for (const [key, value] of Object.entries(defaults)) {
    const index = lines.findIndex((line) => line.startsWith(`${key}=`));
    const current = index >= 0 ? lines[index].slice(key.length + 1) : '';
    if (!current) missing[key] = value;
  }

  upsertEnvFile(filePath, missing);
}


function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else if (hasBin('xdg-open')) {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      info(`Open this address in your browser: ${url}`);
    }
  } catch {
    info(`Open this address in your browser: ${url}`);
  }
}

async function waitForApp(url, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
  }
  return false;
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
  console.log(paint('  The open-source, single-user BYOK AI trading platform', 'dim'));
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
  { name: 'IAMHC API',        tier: 'Low',     hint: 'sk-…',               url: 'https://api.iamhc.cn',                              color: 'lavender' },
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
  stepHeader('Checking what is available on this computer');

  const nodeVersion = getVersion('node');
  const nodeMajor = nodeVersion?.match(/v?(\d+)/)?.[1];
  const nodeOk = Boolean(nodeMajor && Number(nodeMajor) >= 20);
  const packageManager = getPackageManager();
  let dockerReady = canUseDocker();

  if (nodeOk) ok(`Node.js ${paint(nodeVersion ?? '', 'dim')}`);
  else {
    fail(`Node.js 20+ is required${nodeVersion ? ` (found ${nodeVersion})` : ''}`);
    console.log(`    ${paint('Install:', 'dim')} https://nodejs.org/`);
  }

  if (packageManager) ok(`${packageManagerLabel()} available`);
  else console.log(`  ${paint('○', 'gray')} pnpm ${paint('not found (only needed for Local mode)', 'dim')}`);

  if (hasBin('git')) ok(`Git ${paint(getVersion('git') ?? '', 'dim')}`);
  else console.log(`  ${paint('○', 'gray')} Git ${paint('not found (not needed when using a downloaded folder)', 'dim')}`);

  if (dockerReady) ok(`Docker ${paint(getVersion('docker') ?? '', 'dim')} is running`);
  else if (hasBin('docker')) warn('Docker is installed but not running — start Docker Desktop for Full mode');
  else console.log(`  ${paint('○', 'gray')} Docker ${paint('not found (needed only for Full mode)', 'dim')}`);

  if (!nodeOk) {
    line();
    fail('Node.js 20 or newer is required. Install it, then run setup again.');
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

  box('Simple mode (lightweight)', [
    `${paint('Recommended for:', 'bold')} trying the app quickly`,
    '',
    ...localFeatures.map(([icon, feat, desc]) =>
      `${icon === '✓' ? paint('✓', 'green') : paint('✗', 'red')}  ${feat.padEnd(28)} ${paint(desc, 'dim')}`
    ),
    '',
    `${paint('What it does:', 'bold')} runs the app on this computer`,
  ], { color: 'cyan', minWidth: 54 });

  line();

  box('Full mode (Docker)', [
    `${paint('Recommended for:', 'bold')} a complete self-hosted install`,
    '',
    ...dockerFeatures.map(([icon, feat, desc]) =>
      `${icon === '✓' ? paint('✓', 'green') : icon === '!' ? paint('!', 'yellow') : paint('✗', 'red')}  ${feat.padEnd(28)} ${paint(desc, 'dim')}`
    ),
    '',
    `${paint('What it does:', 'bold')} runs the complete app automatically`,
  ], { color: 'teal', minWidth: 54 });

  line();

  if (!dockerReady && hasBin('docker')) {
    const retry = await rl.question(`  Docker Desktop is not ready. Wait up to 60 seconds for it? ${paint('[Y/n]', 'dim')} `);
    if (retry.trim().toLowerCase() !== 'n') {
      startSpinner('Waiting for Docker Desktop');
      dockerReady = await waitForDocker();
      stopSpinner(dockerReady ? 'Docker Desktop is ready' : null);
    }
  }

  if (!dockerReady) {
    info('Full mode is unavailable because Docker Desktop is not running.');
    selectedMode = 'local';
  } else {
    const choice = await rl.question(`  Choose mode ${paint('[1=Simple / 2=Full]', 'dim')} (default: 2): `);
    selectedMode = choice.trim() === '1' ? 'local' : 'docker';
  }

  if (selectedMode === 'local' && !packageManager) {
    line();
    fail('Simple mode needs pnpm or Corepack. Install Node.js with Corepack enabled, then run setup again.');
    rl.close();
    process.exit(1);
  }

  line();
  console.log(`  ${paint('→', 'green')} Selected: ${paint(selectedMode === 'docker' ? 'Full mode (Docker)' : 'Simple mode', 'bold', selectedMode === 'docker' ? 'teal' : 'cyan')}`);

  // ── Step 3: BYOK Explanation ───────────────────────────────────────────
  stepHeader('AI Providers — Bring Your Own Key (BYOK)');

  console.log(`  HamaFX-Ai uses ${paint('BYOK', 'bold', 'cyan')} (Bring Your Own Key).`);
  console.log(`  ${paint('No server-level AI keys are needed to start the app.', 'dim')}`);
  line();
  console.log(`  After registering, you'll add your AI provider key via the`);
  console.log(`  ${paint('onboarding wizard', 'bold')} or ${paint('Settings → API Keys', 'bold')}.`);
  console.log(`  Your key is encrypted at rest (AES-256-GCM) on your instance.`);
  console.log(`  The server must use it to call your selected provider; protect your instance, database, backups, and encryption secret.`);
  line();
  console.log(`  ${paint('Supported providers:', 'bold')}`);
  line();

  for (const p of BYOK_PROVIDERS_INFO) {
    const tierColor = p.tier === 'Free' ? 'green' : p.tier === 'Low' ? 'lime' : 'gold';
    console.log(`  ${paint('●', p.color)} ${paint(p.name.padEnd(22), 'bold', p.color)} ${paint(p.tier, tierColor)} ${paint(`(${p.hint})`, 'dim')}`);
    console.log(`     ${paint('Get key:', 'dim')} ${p.url}`);
  }

  line();
  info(`You can add multiple providers from the ${BYOK_PROVIDERS_INFO.length} supported options and switch between them in the app.`);
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

      if (!key) {
        warn(`No key for ${provider.label} — skipping`);
      } else if (/\r|\n/.test(key)) {
        warn(`${provider.label} key contains an invalid line break — skipping`);
      } else {
        collectedMarketKeys[provider.envKey] = key;
        ok(`${provider.label} key saved ${paint(maskKey(key), 'dim')}`);
      }
    }
  } else {
    info('Skipped market data providers — add them later in .env.local');
  }

  // ── Step 5: Generate Secrets & Write Config ────────────────────────────
  stepHeader('Generating secrets & writing config');

  if (selectedMode === 'local') {
    const envLocalPath = resolve(repoRoot, '.env.local');
    const values = { BYOK_ENABLED: '1', ...collectedMarketKeys };
    upsertEnvFile(envLocalPath, values);
    ok(`Saved simple-mode settings to ${paint('.env.local', 'dim')}`);
    ok(`Auth & encryption secrets auto-generate to ${paint('.hamafx/dev-secrets.json', 'dim')} on first boot`);
  } else {
    // Full mode: generate required settings in Node so Windows users do not
    // need Bash or a separate shell script.
    const envPath = resolve(repoRoot, '.env');
    ensureDockerEnv(envPath);
    upsertEnvFile(envPath, { BYOK_ENABLED: '1', ...collectedMarketKeys });
    ok(`Saved full-mode settings to ${paint('.env', 'dim')}`);
  }

  // ── Step 6: Install Dependencies ───────────────────────────────────────
  stepHeader('Installing dependencies');

  if (selectedMode === 'local') {
    startSpinner('Running pnpm install');
    try {
      runPackageManager(['install', '--frozen-lockfile'], { stdio: 'pipe', cwd: repoRoot });
      stopSpinner('Dependencies installed (frozen lockfile)');
    } catch {
      stopSpinner();
      startSpinner('Retrying without lockfile');
      try {
        runPackageManager(['install'], { stdio: 'pipe', cwd: repoRoot });
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
    `${paint('Mode:', 'bold')}           ${selectedMode === 'docker' ? 'Full mode (Docker)' : 'Simple mode'}`,
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
    console.log(`  ${paint('Start command:', 'bold')} ${paint(`${packageManagerLabel()} dev:local`, 'green')}`);
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

      const manager = getPackageManager();
      if (!manager) {
        fail('The package manager is no longer available. Please restart setup.');
        process.exit(1);
      }
      const child = spawn(manager.command, [...manager.prefix, 'dev:local'], {
        cwd: repoRoot,
        stdio: 'inherit',
        env: { ...process.env, HAMAFX_LOCAL_DEV: '1' },
      });

      child.on('spawn', async () => {
        info('Waiting for the app to become ready...');
        if (await waitForApp('http://localhost:3000')) {
          ok('The app is ready. Opening it in your browser.');
          openBrowser('http://localhost:3000');
        } else {
          warn('The app is still starting. Open http://localhost:3000 in a moment.');
        }
      });
      child.on('exit', (code) => process.exit(code ?? 0));
    } else {
      line();
      console.log(`  ${paint('Run when ready:', 'dim')}`);
      console.log(`  ${paint(`${packageManagerLabel()} dev:local`, 'green')}`);
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

      child.on('exit', async (code) => {
        if (code === 0) {
          line();
          info('Waiting for the app to become ready...');
          const ready = await waitForApp('http://localhost:3000', 180_000);
          if (ready) {
            ok('Full mode is ready. Opening it in your browser.');
            openBrowser('http://localhost:3000');
          } else {
            warn('The containers started, but the app is still warming up. Open http://localhost:3000 in a moment.');
          }
          line();
          console.log(`  ${paint('Web app:', 'bold')}    http://localhost:3000`);
          console.log(`  ${paint('Logs:', 'dim')}       docker compose logs -f app`);
          console.log(`  ${paint('Stop:', 'dim')}       docker compose down`);
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
