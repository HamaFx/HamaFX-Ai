// SPDX-License-Identifier: Apache-2.0

import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { diffEnv, parseEnv, serializeEnv, upsertEnvFile } from '../../scripts/setup/lib/env.mjs';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hamafx-env-test-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('parseEnv', () => {
  it('parses KEY=VALUE lines and skips comments/blanks', () => {
    const { entries, lines } = parseEnv(
      ['# header', '', 'A=1', 'B=hello world', 'C=  spaced  ', 'not-a-key'].join('\n'),
    );
    expect(entries.get('A')).toBe('1');
    expect(entries.get('B')).toBe('hello world');
    expect(entries.get('C')).toBe('spaced');
    expect(entries.has('not-a-key')).toBe(false);
    expect(lines.length).toBe(6);
  });
});

describe('diffEnv', () => {
  it('classifies added, changed, and removed keys', () => {
    const existing = new Map([
      ['A', '1'],
      ['B', 'old'],
      ['C', 'keep'],
    ]);
    const target = { A: '2', B: 'old', D: 'new' };
    const diff = diffEnv(existing, target);

    expect(diff).toContainEqual({ key: 'A', old: '1', new: '2' });
    expect(diff).toContainEqual({ key: 'D', old: undefined, new: 'new' });
    expect(diff).toContainEqual({ key: 'C', old: 'keep', new: undefined });
    // Unchanged keys produce no diff entry.
    expect(diff).not.toContainEqual(expect.objectContaining({ key: 'B' }));
  });

  it('masks values when asked', () => {
    const existing = new Map([['SECRET', 'abcdefgh']]);
    const diff = diffEnv(existing, { SECRET: 'ijklmnop' }, { mask: true });
    expect(diff[0]?.old).not.toBe('abcdefgh');
    expect(diff[0]?.old).toMatch(/^•+$/);
  });

  it('masks only secret-looking keys by default, keeps others readable', () => {
    const existing = new Map();
    const diff = diffEnv(existing, {
      API_KEY: 'abcdefgh',
      BYOK_ENABLED: '1',
      NEXTAUTH_URL: 'http://x',
    });
    const apiKey = diff.find((d) => d.key === 'API_KEY');
    const enabled = diff.find((d) => d.key === 'BYOK_ENABLED');
    const url = diff.find((d) => d.key === 'NEXTAUTH_URL');
    expect(apiKey?.new).toMatch(/^•+$/);
    expect(enabled?.new).toBe('1');
    expect(url?.new).toBe('http://x');
  });

  it('supports an explicit key list to mask', () => {
    const existing = new Map();
    const diff = diffEnv(existing, { A: '1', B: '2' }, { mask: ['A'] });
    expect(diff.find((d) => d.key === 'A')?.new).toMatch(/^•+$/);
    expect(diff.find((d) => d.key === 'B')?.new).toBe('2');
  });
});

describe('serializeEnv', () => {
  it('preserves comments and ordering while updating values', () => {
    const { lines, entries } = parseEnv('# c\nA=1\nB=2\n');
    const target = new Map(entries);
    target.set('A', '99');
    target.set('C', '3');
    const out = serializeEnv(lines, target);
    expect(out).toContain('# c');
    expect(out).toContain('A=99');
    expect(out).toContain('B=2');
    expect(out).toContain('C=3');
  });
});

describe('upsertEnvFile', () => {
  it('adds new keys, updates existing ones, and preserves unrelated lines', () => {
    const file = join(dir, '.env');
    writeFileSync(file, '# keep me\nA=1\n');

    const result = upsertEnvFile(file, { A: '2', B: 'new' }, { backup: false });
    expect(result.changed).toBe(true);
    expect(result.diff).toHaveLength(2);

    const content = readFileSync(file, 'utf8');
    expect(content).toContain('# keep me');
    expect(content).toContain('A=2');
    expect(content).toContain('B=new');
  });

  it('writes files with 0600 permissions', () => {
    const file = join(dir, '.env');
    const result = upsertEnvFile(file, { A: '1' }, { backup: false });
    expect(result.changed).toBe(true);
    const mode = statSync(file).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('creates a backup only when content changes', () => {
    const file = join(dir, '.env');
    writeFileSync(file, 'A=1\n');

    // No change → no backup written.
    const noChange = upsertEnvFile(file, { A: '1' }, { backup: true });
    expect(noChange.changed).toBe(false);
    expect(noChange.backupPath).toBeNull();

    const changed = upsertEnvFile(file, { A: '2' }, { backup: true });
    expect(changed.changed).toBe(true);
    expect(changed.backupPath).toBe(`${file}.bak`);
    expect(readFileSync(`${file}.bak`, 'utf8')).toContain('A=1');
  });

  it('rotates backups instead of clobbering an existing .bak', () => {
    const file = join(dir, '.env');
    writeFileSync(file, 'A=1\n');
    upsertEnvFile(file, { A: '2' }, { backup: true });
    upsertEnvFile(file, { A: '3' }, { backup: true });
    expect(existsSync(`${file}.bak`)).toBe(true);
    expect(existsSync(`${file}.bak.1`)).toBe(true);
    // .bak = first backup (A=1), .bak.1 = second backup (A=2), file = A=3
    expect(readFileSync(`${file}.bak`, 'utf8')).toContain('A=1');
    expect(readFileSync(`${file}.bak.1`, 'utf8')).toContain('A=2');
    expect(readFileSync(file, 'utf8')).toContain('A=3');
  });

  it('dry-run never touches the filesystem', () => {
    const file = join(dir, '.env');
    writeFileSync(file, 'A=1\n');
    const result = upsertEnvFile(file, { A: '2' }, { backup: true, dryRun: true });
    expect(result.changed).toBe(true);
    expect(result.backupPath).toBeNull();
    expect(readFileSync(file, 'utf8')).toContain('A=1');
    expect(readFileSync(file, 'utf8')).not.toContain('A=2');
    expect(existsSync(`${file}.bak`)).toBe(false);
  });

  it('replace mode drops keys absent from values (fresh start)', () => {
    const file = join(dir, '.env');
    writeFileSync(file, 'OLD=1\nKEEP=2\n');

    const result = upsertEnvFile(file, { KEEP: '3' }, { backup: false, replace: true });
    const removed = result.diff.find((d) => d.key === 'OLD');
    expect(removed?.new).toBeUndefined();

    const content = readFileSync(file, 'utf8');
    expect(content).not.toContain('OLD=');
    expect(content).toContain('KEEP=3');
  });

  it('rejects values with line breaks', () => {
    const file = join(dir, '.env');
    expect(() => upsertEnvFile(file, { A: 'x\ny' }, { backup: false })).toThrow(/line break/);
  });
});
