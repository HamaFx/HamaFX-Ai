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
 * Secret generation from the single source of truth:
 * scripts/setup/secret-template.json.
 *
 * The template drives BOTH the interactive wizard and the
 * docker/init-secrets.sh bootstrap (which delegates to
 * generate-env.mjs), so the two can never drift apart.
 */

import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readEnvFile } from './env.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = resolve(__dirname, '../secret-template.json');

/** Load and validate the shared secret template. */
export function loadSecretTemplate() {
  const raw = JSON.parse(readFileSync(TEMPLATE_PATH, 'utf8'));
  const defaults = raw?.defaults;
  if (!defaults || typeof defaults !== 'object') {
    throw new Error('secret-template.json is missing a "defaults" object');
  }
  return defaults;
}

/** Resolve a template entry to a concrete string value. */
export function resolveTemplateValue(entry) {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object' && entry.type === 'random') {
    const bytes = Number(entry.bytes) || 32;
    return randomBytes(bytes).toString('hex');
  }
  throw new Error(`Invalid secret template entry: ${JSON.stringify(entry)}`);
}

/**
 * Build the map of missing secret values for an env file, and the full
 * canonical set of template keys. Existing values are never overwritten.
 */
export function missingSecrets(envFilePath) {
  const template = loadSecretTemplate();
  const { entries } = readEnvFile(envFilePath);
  const missing = {};
  for (const [key, entry] of Object.entries(template)) {
    if (!entries.has(key)) missing[key] = resolveTemplateValue(entry);
  }
  return { template, missing };
}

/** True when an env file already contains every template key. */
export function hasAllSecrets(envFilePath) {
  const template = loadSecretTemplate();
  const { entries } = readEnvFile(envFilePath);
  return Object.keys(template).every((key) => entries.has(key));
}
