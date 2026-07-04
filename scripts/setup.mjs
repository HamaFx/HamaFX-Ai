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
 * scripts/setup.mjs — Interactive first-run setup for HamaFX-Ai.
 *
 * Guides the user through:
 *   1. Prerequisite checks (Node, pnpm, Docker)
 *   2. Mode selection (Local dev vs Docker)
 *   3. AI provider key collection
 *   4. Secret generation
 *   5. Dependency installation
 *   6. Startup
 *
 * Usage:  pnpm setup   (or: node scripts/setup.mjs)
 */

import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

// ── Helpers ────────────────────────────────────────────────────────────────

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bg: '\x1b[48;5;236m',
};

function c(color, text) {
  return `${COLORS[color] ?? ''}${text}${COLORS.reset}`;
}

function log(msg) {
  console.log(msg);
}

function ok(msg) {
  console.log(`${c('green', '✓')} ${msg}`);
}

function warn(msg) {
  console.log(`${c('yellow', '⚠')}  ${msg}`);
}

function fail(msg) {
  console.log(`${c('red', '✗')} ${msg}`);
}

function banner() {
  console.log();
  console.log(c('bold', c('cyan', '  ╔══════════════════════════════════════════╗')));
  console.log(c('bold', c('cyan', '  ║         HamaFX-Ai  —  Setup Wizard       ║')));
  console.log(c('bold', c('cyan', '  ╚══════════════════════════════════════════╝')));
  console.log(c('dim', '  The open-source, multi-user AI trading platform'));
  console.log();
}

function hasBin(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getVersion(cmd, flag = '--version') {
  try {
    return execSync(`${cmd} ${flag}`, { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

function randHex(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  banner();

  const rl = createInterface({ input: stdin, output: stdout });

  // ── Step 1: Prerequisites ──────────────────────────────────────────────
  console.log(c('bold', 'Step 1: Checking prerequisites'));
  console.log(c('dim', '─'.repeat(50)));

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
          ok(`${name} ${c('dim', ver)}`);
        } else {
          warn(`${name} ${ver} — needs v${minVersion}+`);
          console.log(c('dim', `    Upgrade: ${installHint}`));
          allOk = false;
        }
      } else {
        ok(`${name} ${c('dim', ver ?? '')}`);
      }
    } else {
      fail(`${name} not found`);
      console.log(c('dim', `    Install: ${installHint}`));
      allOk = false;
    }
  }

  const hasDocker = hasBin('docker');
  if (hasDocker) {
    ok(`Docker ${c('dim', getVersion('docker') ?? '')}`);
  } else {
    console.log(c('dim', `   Docker not found (optional — needed for Docker mode only)`));
  }

  console.log();

  if (!allOk) {
    fail('Some prerequisites are missing. Install them and re-run: pnpm setup');
    rl.close();
    process.exit(1);
  }

  // ── Step 2: Mode selection ─────────────────────────────────────────────
  console.log(c('bold', 'Step 2: Choose your setup mode'));
  console.log(c('dim', '─'.repeat(50)));
  console.log();
  console.log(`  ${c('cyan', '1.')} ${c('bold', 'Local Dev')} ${c('dim', '(recommended for trying & contributing)')}`);
  console.log(`     ${c('dim', 'Embedded Postgres (PGlite), no Docker needed')}`);
  console.log(`     ${c('dim', 'Fast startup, hot reload, most features work')}`);
  console.log(`     ${c('dim', 'No vector search (RAG) or live market data')}`);
  console.log();
  console.log(`  ${c('cyan', '2.')} ${c('bold', 'Docker Compose')} ${c('dim', '(full features)')}`);
  console.log(`     ${c('dim', 'Postgres 16 + pgvector, worker, Langfuse')}`);
  console.log(`     ${c('dim', 'All features including vector search & crons')}`);
  console.log(`     ${c('dim', 'Requires Docker')}`);
  console.log();

  if (!hasDocker) {
    console.log(c('yellow', '  Docker not detected — Local Dev mode is your only option.'));
    console.log();
  }

  let modeChoice;
  if (hasDocker) {
    modeChoice = await rl.question(`  Choose [1/2] (default: 1): `);
  } else {
    modeChoice = '1';
  }
  const mode = modeChoice.trim() === '2' && hasDocker ? 'docker' : 'local';

  console.log();
  console.log(c('green', `  → Selected: ${mode === 'docker' ? 'Docker Compose' : 'Local Dev'}`));
  console.log();

  // ── Step 3: AI provider key ────────────────────────────────────────────
  console.log(c('bold', 'Step 3: AI Provider Key'));
  console.log(c('dim', '─'.repeat(50)));
  console.log();
  console.log('  HamaFX-Ai needs at least one AI provider to function.');
  console.log('  You can add more later in Settings → API Keys.');
  console.log();
  console.log(`  ${c('cyan', '1.')} Google Gemini (direct API)   ${c('dim', '— free tier available')}`);
  console.log(`     ${c('dim', 'Get a key: https://aistudio.google.com/apikey')}`);
  console.log();
  console.log(`  ${c('cyan', '2.')} Vercel AI Gateway              ${c('dim', '— multi-provider')}`);
  console.log(`     ${c('dim', 'Get a key: https://vercel.com/ai')}`);
  console.log();
  console.log(`  ${c('cyan', '3.')} Google Vertex AI              ${c('dim', '— GCP service account')}`);
  console.log(`     ${c('dim', 'Requires project + location + credentials JSON')}`);
  console.log();
  console.log(`  ${c('dim', '4. Skip for now')}  ${c('dim', '(you can add a key later)')}`);
  console.log();

  const providerChoice = await rl.question(`  Choose provider [1/2/3/4] (default: 1): `);

  let envKey = null;
  let envValue = null;
  let extraEnv = {};

  const choice = providerChoice.trim() || '1';

  if (choice === '4') {
    console.log(c('yellow', '  → Skipped. Add a key later in .env.local or Settings → API Keys.'));
  } else if (choice === '1') {
    envKey = 'GOOGLE_GENERATIVE_AI_API_KEY';
    console.log();
    envValue = await rl.question(`  Paste your Google Gemini API key: `);
    if (!envValue.trim()) {
      warn('No key entered — you can add it later in .env.local');
    }
  } else if (choice === '2') {
    envKey = 'AI_GATEWAY_API_KEY';
    console.log();
    envValue = await rl.question(`  Paste your Vercel AI Gateway key: `);
    if (!envValue.trim()) {
      warn('No key entered — you can add it later in .env.local');
    }
  } else if (choice === '3') {
    console.log();
    const project = (await rl.question(`  Google Cloud Project ID: `)).trim();
    const location = (await rl.question(`  Vertex AI location (default: us-central1): `)).trim() || 'us-central1';
    const creds = (await rl.question(`  Path to service account JSON file: `)).trim();

    if (project) extraEnv.GOOGLE_VERTEX_PROJECT = project;
    if (location) extraEnv.GOOGLE_VERTEX_LOCATION = location;

    if (creds && existsSync(creds)) {
      try {
        const json = readFileSync(creds, 'utf-8').replace(/\n/g, '\\n');
        extraEnv.GOOGLE_APPLICATION_CREDENTIALS_JSON = json;
        ok('Service account credentials loaded');
      } catch {
        fail(`Could not read file: ${creds}`);
        warn('You can set GOOGLE_APPLICATION_CREDENTIALS_JSON manually later');
      }
    } else if (creds) {
      fail(`File not found: ${creds}`);
      warn('Set GOOGLE_APPLICATION_CREDENTIALS_JSON manually later');
    }
  } else {
    warn(`Unknown choice "${choice}" — skipping for now`);
  }

  console.log();

  // ── Step 4: Generate secrets & write env ───────────────────────────────
  console.log(c('bold', 'Step 4: Generating secrets'));
  console.log(c('dim', '─'.repeat(50)));

  if (mode === 'local') {
    // Local dev: secrets auto-generate to .hamafx/dev-secrets.json on boot.
    // We only need to write the AI key (if provided) to .env.local
    const envLocalPath = resolve(repoRoot, '.env.local');

    // Read existing .env.local if present (don't overwrite)
    let existing = '';
    if (existsSync(envLocalPath)) {
      existing = readFileSync(envLocalPath, 'utf-8');
    }

    const lines = [];

    if (envKey && envValue && envValue.trim()) {
      // Don't duplicate if already present
      if (!existing.includes(`${envKey}=`)) {
        lines.push(`${envKey}=${envValue.trim()}`);
      } else {
        // Update existing line
        existing = existing.replace(
          new RegExp(`^${envKey}=.*$`, 'm'),
          `${envKey}=${envValue.trim()}`,
        );
      }
    }

    // Add extra Vertex env vars
    for (const [key, val] of Object.entries(extraEnv)) {
      if (!existing.includes(`${key}=`)) {
        lines.push(`${key}=${val}`);
      }
    }

    if (lines.length > 0) {
      if (existing && !existing.endsWith('\n')) {
        appendFileSync(envLocalPath, '\n');
      }
      appendFileSync(envLocalPath, lines.join('\n') + '\n');
      ok(`Wrote ${lines.length} env var(s) to ${c('dim', '.env.local')}`);
    } else if (existing) {
      ok(`.env.local already configured ${c('dim', '(no changes needed)')}`);
    } else {
      ok('No env vars to write — secrets will auto-generate on first boot');
    }

    ok(`Auth/encryption secrets auto-generate to ${c('dim', '.hamafx/dev-secrets.json')} on first boot`);
  } else {
    // Docker mode: use init-secrets.sh for Docker secrets + write AI key to .env
    const initScript = resolve(repoRoot, 'docker/init-secrets.sh');
    if (existsSync(initScript)) {
      try {
        execSync(`bash "${initScript}"`, { stdio: 'inherit', cwd: repoRoot });
        ok('Docker secrets generated');
      } catch {
        warn('init-secrets.sh reported .env already exists — leaving it');
      }
    }

    // Append AI key to .env
    const envPath = resolve(repoRoot, '.env');
    if (envKey && envValue && envValue.trim()) {
      let envExisting = '';
      if (existsSync(envPath)) {
        envExisting = readFileSync(envPath, 'utf-8');
      }

      if (!envExisting.includes(`${envKey}=`)) {
        appendFileSync(envPath, `${envKey}=${envValue.trim()}\n`);
        ok(`Added ${envKey} to ${c('dim', '.env')}`);
      } else {
        envExisting = envExisting.replace(
          new RegExp(`^${envKey}=.*$`, 'm'),
          `${envKey}=${envValue.trim()}`,
        );
        writeFileSync(envPath, envExisting);
        ok(`Updated ${envKey} in ${c('dim', '.env')}`);
      }
    }

    // Add extra Vertex env vars to .env
    for (const [key, val] of Object.entries(extraEnv)) {
      appendFileSync(envPath, `${key}=${val}\n`);
    }
  }

  console.log();

  // ── Step 5: Install dependencies ───────────────────────────────────────
  console.log(c('bold', 'Step 5: Installing dependencies'));
  console.log(c('dim', '─'.repeat(50)));

  if (mode === 'local') {
    try {
      execSync('pnpm install --frozen-lockfile', { stdio: 'inherit', cwd: repoRoot });
      ok('Dependencies installed');
    } catch {
      warn('Frozen lockfile failed — trying without lockfile');
      execSync('pnpm install', { stdio: 'inherit', cwd: repoRoot });
      ok('Dependencies installed');
    }
  } else {
    // Docker will handle the build — no need to install locally
    console.log(c('dim', '  Docker mode — dependencies are installed during docker compose build'));
    ok('Skipping local install (Docker handles it)');
  }

  console.log();

  // ── Step 6: Start ──────────────────────────────────────────────────────
  console.log(c('bold', 'Step 6: Ready to start!'));
  console.log(c('dim', '─'.repeat(50)));
  console.log();

  if (mode === 'local') {
    console.log(`  ${c('green', 'pnpm dev:local')}`);
    console.log();
    console.log(c('dim', '  Then open: http://localhost:3000'));
    console.log(c('dim', '  Register at: http://localhost:3000/register'));
    console.log();

    const startNow = await rl.question(`  Start dev server now? [Y/n]: `);

    if (startNow.trim().toLowerCase() !== 'n') {
      console.log();
      console.log(c('cyan', '  Starting HamaFX-Ai...'));
      console.log(c('dim', '  Press Ctrl+C to stop'));
      console.log();

      rl.close();

      // Spawn dev server — inherit stdio so user sees output
      const child = spawn('pnpm', ['dev:local'], {
        cwd: repoRoot,
        stdio: 'inherit',
        env: { ...process.env, HAMAFX_LOCAL_DEV: '1' },
      });

      child.on('exit', (code) => {
        process.exit(code ?? 0);
      });
    } else {
      console.log();
      console.log(c('dim', '  Run this whenever you\'re ready:'));
      console.log(`  ${c('green', 'pnpm dev:local')}`);
      console.log();
      rl.close();
    }
  } else {
    console.log(`  ${c('green', 'docker compose up -d')}`);
    console.log();
    console.log(c('dim', '  Then open: http://localhost:3000'));
    console.log(c('dim', '  Register at: http://localhost:3000/register'));
    console.log(c('dim', '  Langfuse UI: http://localhost:3001'));
    console.log();

    const startNow = await rl.question(`  Start Docker stack now? [Y/n]: `);

    if (startNow.trim().toLowerCase() !== 'n') {
      console.log();
      console.log(c('cyan', '  Building and starting Docker stack...'));
      console.log(c('dim', '  First build takes a few minutes. Subsequent starts are faster.'));
      console.log();

      rl.close();

      const child = spawn('docker', ['compose', 'up', '-d', '--build'], {
        cwd: repoRoot,
        stdio: 'inherit',
      });

      child.on('exit', (code) => {
        if (code === 0) {
          console.log();
          ok('Docker stack is running!');
          console.log();
          console.log(`  ${c('bold', 'Web app:')}    http://localhost:3000`);
          console.log(`  ${c('bold', 'Langfuse:')}   http://localhost:3001`);
          console.log();
          console.log(c('dim', '  Logs: docker compose logs -f app'));
          console.log(c('dim', '  Stop: docker compose down'));
          console.log();
        } else {
          fail('Docker compose failed. Check the output above.');
        }
        process.exit(code ?? 1);
      });
    } else {
      console.log();
      console.log(c('dim', '  Run this whenever you\'re ready:'));
      console.log(`  ${c('green', 'docker compose up -d --build')}`);
      console.log();
      rl.close();
    }
  }
}

main().catch((err) => {
  console.error('\n' + c('red', 'Setup failed:'), err.message);
  process.exit(1);
});
