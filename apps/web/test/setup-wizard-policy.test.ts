// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseFlags } from '../../scripts/setup/index.mjs';
import { MARKET_DATA_PROVIDERS, parseMarketFlag } from '../../scripts/setup/lib/market-data.mjs';
import { loadSecretTemplate } from '../../scripts/setup/lib/secrets.mjs';
import * as configStep from '../../scripts/setup/steps/config.mjs';
import * as detectStep from '../../scripts/setup/steps/detect-existing.mjs';
import * as installStep from '../../scripts/setup/steps/install.mjs';
import * as launchStep from '../../scripts/setup/steps/launch.mjs';
import * as marketStep from '../../scripts/setup/steps/market-data.mjs';
import * as modeStep from '../../scripts/setup/steps/mode.mjs';
import * as prereqsStep from '../../scripts/setup/steps/prereqs.mjs';

const root = resolve(process.cwd(), '../..');

const REQUIRED_SECRETS = [
  'POSTGRES_PASSWORD',
  'BACKUP_INTERVAL_SECONDS',
  'BACKUP_RETENTION_DAYS',
  'BACKUP_MAX_AGE_SECONDS',
  'LANGFUSE_NEXTAUTH_SECRET',
  'LANGFUSE_SALT',
  'AUTH_SECRET',
  'NEXTAUTH_URL',
  'CRON_SECRET',
  'ENCRYPTION_SECRET',
  'BYOK_ENABLED',
  'MULTI_USER_ENABLED',
  'REGISTRATION_MODE',
  'HAMAFX_ENABLE_RLS',
];

describe('setup wizard structure', () => {
  it('exports run() and a title from every step module', () => {
    const steps = [
      prereqsStep,
      modeStep,
      detectStep,
      marketStep,
      configStep,
      installStep,
      launchStep,
    ];
    for (const step of steps) {
      expect(typeof step.run, `${step.title ?? 'step'} exports run`).toBe('function');
      expect(typeof step.title, `${step.title ?? 'step'} exports title`).toBe('string');
    }
  });

  it('offers the four documented market data providers', () => {
    const ids = MARKET_DATA_PROVIDERS.map((p) => p.id);
    expect(ids).toEqual(['finnhub', 'marketaux', 'fred', 'alphavantage']);
    for (const p of MARKET_DATA_PROVIDERS) {
      expect(p.envKey).toMatch(/^[A-Z0-9_]+_API_KEY$/);
      expect(typeof p.url).toBe('string');
    }
  });

  it('parses the --market flag into provider ids (case/whitespace tolerant)', () => {
    expect(parseMarketFlag('finnhub,fred')).toEqual(['finnhub', 'fred']);
    expect(parseMarketFlag(' Finnhub , MARKETAUX ')).toEqual(['finnhub', 'marketaux']);
    expect(parseMarketFlag('bogus')).toEqual([]);
    expect(parseMarketFlag('')).toEqual([]);
  });

  it('keeps graceful abort messaging and exit code 130 in the entry point', () => {
    const source = readFileSync(resolve(root, 'scripts/setup/index.mjs'), 'utf8');
    expect(source).toContain('Setup interrupted. Re-run anytime: pnpm setup');
    expect(source).toContain('return 130');
  });

  it('keeps the documented node scripts/setup.mjs invocation as a thin wrapper', () => {
    const wrapper = readFileSync(resolve(root, 'scripts/setup.mjs'), 'utf8');
    expect(wrapper).toContain("import { main } from './setup/index.mjs'");
    expect(wrapper).toContain('process.exitCode = code');
  });
});

describe('setup wizard flags', () => {
  it('parses long and short flags', () => {
    const flags = parseFlags([
      '--mode=docker',
      '--market=finnhub,fred',
      '--fresh',
      '--skip-install',
      '--no-launch',
      '--yes',
      '--dry-run',
      '--json',
      '--no-color',
    ]);
    expect(flags.mode).toBe('docker');
    expect(flags.market).toBe('finnhub,fred');
    expect(flags.fresh).toBe(true);
    expect(flags.skipInstall).toBe(true);
    expect(flags.noLaunch).toBe(true);
    expect(flags.yes).toBe(true);
    expect(flags.dryRun).toBe(true);
    expect(flags.json).toBe(true);
    expect(flags.noColor).toBe(true);
    expect(flags.help).toBe(false);
  });

  it('parses space-separated flag values and aliases', () => {
    const flags = parseFlags(['--mode', 'simple', '-y', '-h']);
    expect(flags.mode).toBe('simple');
    expect(flags.yes).toBe(true);
    expect(flags.help).toBe(true);
  });

  it('rejects unknown modes at the main() level', async () => {
    const { main } = await import('../../scripts/setup/index.mjs');
    // Inject a silent io so the error message does not pollute test output.
    const silent = { write: () => {}, line: () => {}, isTTY: false };
    const code = await main(['--mode=banana'], { io: silent });
    expect(code).toBe(1);
  });

  it('emits a machine-readable JSON result with --json', async () => {
    const { main } = await import('../../scripts/setup/index.mjs');
    const silent = { write: () => {}, line: () => {}, isTTY: false };
    const jsonOut = { buffer: '', write: (s: string) => (jsonOut.buffer += s) };
    const code = await main(['--mode=simple', '--dry-run', '--json'], {
      io: silent,
      jsonStream: jsonOut,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(jsonOut.buffer);
    expect(parsed.ok).toBe(true);
    expect(parsed.mode).toBe('simple');
    expect(parsed.dryRun).toBe(true);
    expect(parsed.configFile).toBe('.env.local');
    expect(Array.isArray(parsed.marketProviders)).toBe(true);
  });

  it('emits a JSON error for invalid modes with --json', async () => {
    const { main } = await import('../../scripts/setup/index.mjs');
    const silent = { write: () => {}, line: () => {}, isTTY: false };
    const jsonOut = { buffer: '', write: (s: string) => (jsonOut.buffer += s) };
    const code = await main(['--mode=banana', '--json'], { io: silent, jsonStream: jsonOut });
    expect(code).toBe(1);
    const parsed = JSON.parse(jsonOut.buffer);
    expect(parsed.ok).toBe(false);
    expect(String(parsed.error)).toContain('banana');
  });
});

describe('secret template — single source of truth', () => {
  let template: Record<string, unknown>;

  beforeEach(() => {
    template = loadSecretTemplate();
  });

  it('covers every secret docker-compose.yml expects', () => {
    const compose = readFileSync(resolve(root, 'docker-compose.yml'), 'utf8');
    const refs = [...compose.matchAll(/\$\{([A-Z0-9_]+)(?::-(?:[^}]*))?\}/g)].map((m) => m[1]);
    for (const key of refs) {
      if (key === 'POSTGRES_PUBLISHED_PORT') continue; // host port, not a secret
      expect(template, `docker-compose.yml references ${key}`).toHaveProperty(key);
    }
  });

  it('includes every canonical secret', () => {
    for (const key of REQUIRED_SECRETS) {
      expect(template, `template must define ${key}`).toHaveProperty(key);
    }
  });

  it('lists every template key in the generate-env.mjs section layout', () => {
    const source = readFileSync(resolve(root, 'scripts/setup/lib/generate-env.mjs'), 'utf8');
    for (const key of Object.keys(template)) {
      expect(source, `generate-env.mjs must render ${key}`).toContain(`'${key}'`);
    }
  });
});

describe('generate-env.mjs CLI', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(resolve(tmpdir(), 'hamafx-genenv-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates a .env with all template keys and 0600 permissions', () => {
    const target = resolve(dir, '.env');
    execFileSync('node', [resolve(root, 'scripts/setup/lib/generate-env.mjs'), '--file', target]);

    const content = readFileSync(target, 'utf8');
    for (const key of REQUIRED_SECRETS) {
      expect(content, `fresh .env contains ${key}`).toContain(`${key}=`);
    }
    expect(content).toContain('DO NOT commit this file');
    expect(statSync(target).mode & 0o777).toBe(0o600);
  });

  it('never overwrites an existing file with --if-missing', () => {
    const target = resolve(dir, '.env');
    writeFileSync(target, 'A=1\n');
    const before = readFileSync(target, 'utf8');

    execFileSync('node', [
      resolve(root, 'scripts/setup/lib/generate-env.mjs'),
      '--file',
      target,
      '--if-missing',
    ]);
    expect(readFileSync(target, 'utf8')).toBe(before);
  });

  it('completes missing secrets in an existing partial file', () => {
    const target = resolve(dir, '.env');
    writeFileSync(target, 'AUTH_SECRET=already-set\n');
    execFileSync('node', [resolve(root, 'scripts/setup/lib/generate-env.mjs'), '--file', target]);

    const content = readFileSync(target, 'utf8');
    expect(content).toContain('AUTH_SECRET=already-set');
    expect(content).toContain('POSTGRES_PASSWORD=');
  });
});

describe('docker/init-secrets.sh delegation', () => {
  it('delegates to the single source of truth generator', () => {
    const script = readFileSync(resolve(root, 'docker/init-secrets.sh'), 'utf8');
    expect(script).toContain('generate-env.mjs');
    expect(script).toContain('--if-missing');
    expect(script).toContain('exec node');
    expect(script).not.toContain('openssl');
    expect(script).not.toContain('rand_hex()');
    expect(script).not.toContain('POSTGRES_PASSWORD=');
  });
});
