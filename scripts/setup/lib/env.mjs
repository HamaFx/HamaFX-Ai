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

/**
 * Idempotent .env file handling.
 *
 * - readEnvFile / parseEnv: KEY=VALUE parsing (comments + blanks kept)
 * - upsertEnvFile: update or append values, preserving everything else
 * - diffEnv: describe exactly what would change (values can be masked)
 * - backupEnvFile: copy the current file to `.bak` before mutating
 *
 * Files are written with 0600 permissions. No existing value is ever
 * destroyed without first being captured in the returned diff.
 */

import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ENV_FILE_MODE = 0o600;

/** Parse raw env content into { entries, raw }. */
export function parseEnv(content) {
  const lines = content.split(/\r?\n/);
  const entries = new Map();
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    entries.set(key, value);
  }
  return { lines, entries };
}

export function readEnvFile(filePath) {
  if (!existsSync(filePath)) return { exists: false, lines: [], entries: new Map() };
  const { lines, entries } = parseEnv(readFileSync(filePath, 'utf8'));
  return { exists: true, lines, entries };
} /**
 * Compute the changes needed to bring `existing` to `target`.
 * Returns [{ key, old, new }] — added keys have old === undefined,
 * removed keys have new === undefined.
 *
 * `mask` options:
 *   - true        → mask every value
 *   - function    → mask(value, key) => display value
 *   - string[]    → mask only the listed keys
 *   - undefined   → mask keys that look secret (KEY/SECRET/PASSWORD/…)
 */
export function diffEnv(existing, target, { mask = undefined } = {}) {
  const maskValue = (value, key) => {
    if (value === undefined) return value;
    if (mask === true) return '•'.repeat(Math.min(value.length, 12));
    if (typeof mask === 'function') return mask(value, key);
    if (Array.isArray(mask))
      return mask.includes(key) ? '•'.repeat(Math.min(value.length, 12)) : value;
    if (mask === undefined && /(KEY|SECRET|PASSWORD|TOKEN|HASH)/i.test(key)) {
      return '•'.repeat(Math.min(value.length, 12));
    }
    return value;
  };

  const changes = [];
  for (const [key, value] of Object.entries(target)) {
    if (!existing.has(key)) changes.push({ key, old: undefined, new: maskValue(value, key) });
    else if (existing.get(key) !== value) {
      changes.push({ key, old: maskValue(existing.get(key), key), new: maskValue(value, key) });
    }
  }
  for (const key of existing.keys()) {
    if (!(key in target))
      changes.push({ key, old: maskValue(existing.get(key), key), new: undefined });
  }
  return changes;
}

/** Serialize entries back into env file content. */
export function serializeEnv(lines, entries) {
  const out = [...lines];
  const seen = new Set();
  for (let i = 0; i < out.length; i++) {
    const line = out[i].trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!entries.has(key)) {
      out[i] = null; // removed key
      continue;
    }
    seen.add(key);
    out[i] = `${key}=${entries.get(key)}`;
  }
  const body = out.filter((line) => line !== null);
  for (const [key, value] of entries.entries()) {
    if (!seen.has(key)) body.push(`${key}=${value}`);
  }
  return `${body.join('\n')}\n`;
}

/**
 * Backup a file to `<path>.bak` (rotating to .bak.1, .bak.2, … so a
 * previous backup is never silently clobbered). Returns the backup path
 * or null when there is nothing to back up.
 */
function backupEnvFile(filePath) {
  if (!existsSync(filePath)) return null;
  let backupPath = `${filePath}.bak`;
  let n = 1;
  while (existsSync(backupPath)) {
    backupPath = `${filePath}.bak.${n}`;
    n++;
  }
  writeFileSync(backupPath, readFileSync(filePath, 'utf8'), { mode: ENV_FILE_MODE });
  chmodSync(backupPath, ENV_FILE_MODE);
  return backupPath;
}

/**
 * Apply an upsert of `values` to the env file at `filePath`.
 *
 * options: { backup?: boolean, dryRun?: boolean, maskDiff?: boolean|function|string[], replace?: boolean }
 * With `replace`, keys that exist in the file but are absent from
 * `values` are dropped (used for a "fresh start" regeneration).
 * `maskDiff` defaults to secret-aware masking (see diffEnv).
 * Returns { changed: boolean, backupPath: string | null, diff: [...] }.
 * Never touches the filesystem when `dryRun` is set.
 */
export function upsertEnvFile(
  filePath,
  values,
  { backup = true, dryRun = false, maskDiff = undefined, replace = false } = {},
) {
  const existing = readEnvFile(filePath);
  const target = replace ? new Map() : new Map(existing.entries);
  let changed = false;

  for (const [key, value] of Object.entries(values)) {
    if (/\r|\n/.test(String(value))) {
      throw new Error(`${key} contains an invalid line break`);
    }
    if (target.get(key) !== value) {
      target.set(key, String(value));
      changed = true;
    }
  }

  const diff = diffEnv(existing.entries, Object.fromEntries(target), { mask: maskDiff });

  if (dryRun || !changed) {
    return { changed, backupPath: null, diff };
  }

  const backupPath = backup ? backupEnvFile(filePath) : null;
  const content = serializeEnv(existing.lines, target);
  writeFileSync(filePath, content, { mode: ENV_FILE_MODE });
  chmodSync(filePath, ENV_FILE_MODE);
  return { changed, backupPath, diff };
}
