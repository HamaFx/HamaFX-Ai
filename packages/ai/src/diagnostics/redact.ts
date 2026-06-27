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

// F5 — Secret Redaction Engine
//
// Ported from DSA's `run_diagnostics.py` and adapted for TypeScript.
// Provides comprehensive redaction of API keys, tokens, passwords, and
// other credentials from diagnostic logs and Sentry payloads.
//
// The redaction operates on strings (regex-based) and recursively on
// objects/arrays (key-based). Together these two layers ensure that
// secrets never leak into structured diagnostic traces.

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Regex patterns for redacting secrets in string values.
 * Each entry is [pattern, replacement] where replacement is either a
 * static string or a function that receives the match array.
 */
const REDACTION_PATTERNS: Array<[RegExp, string | ((m: RegExpExecArray) => string)]> = [
  // Authorization headers: "authorization: Bearer xxx" or "authorization=Token xxx"
  [
    /(?:authorization)\s*[:=]\s*(?:(?:Bearer|Basic|Token)\s+)?[^\s,&;]+/gi,
    'authorization=<redacted>',
  ],
  // URLs with embedded credentials: https://user:pass@host
  [/(https?:\/\/)([^/\s:@]+):([^@\s/]+)@/g, '$1<redacted>:<redacted>@'],
  // URLs containing token/key/secret/webhook query params
  [/https?:\/\/[^\s]+?(?:token|key|secret|webhook)[^\s]*/gi, '<redacted-url>'],
  // JSON-style key: "value" — "api_key": "sk-xxx", 'token': "abc"
  [
    /(["']?)([A-Z0-9_]*?(?:api[_-]?key|access[_-]?token|token|secret|password|cookie))\1\s*:\s*(["'])([^"']+)\3/gi,
    (m) => `${m[1]}${m[2]}${m[1]}: ${m[3]}<redacted>${m[3]}`,
  ],
  // key=value patterns — api_key=sk-xxx, token=abc123
  [
    /\b([A-Z0-9_]*?(?:api[_-]?key|access[_-]?token|token|secret|password|cookie))\s*=\s*[^\s,&;]+/gi,
    (m) => `${m[1]}=<redacted>`,
  ],
  // Bearer tokens — "Bearer eyJhbGciOi..."
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer <redacted>'],
  // x-api-key headers
  [/(?:x-api-key)\s*[:=]\s*[^\s,&;]+/gi, 'x-api-key=<redacted>'],
];

/**
 * Keys whose values are redacted entirely when found in objects.
 * Matches case-insensitively against any of these substrings.
 */
const SENSITIVE_KEY_PATTERN =
  /api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password|passwd|cookie|webhook|private[_-]?key|client[_-]?secret|refresh[_-]?token/i;

/**
 * Redact secrets from any value — string, array, or object.
 *
 * For strings: applies all regex patterns sequentially.
 * For objects: redacts any key matching SENSITIVE_KEY_PATTERN, recurses into others.
 * For arrays: maps each element through redactSecrets.
 * Primitives (number, boolean, null, undefined) pass through unchanged.
 */
export function redactSecrets(value: unknown): unknown {
  if (typeof value === 'string') {
    let result = value;
    for (const [pattern, replacement] of REDACTION_PATTERNS) {
      if (typeof replacement === 'function') {
        result = result.replace(pattern, (...args) => {
          // The last two args in String.replace are offset and full string;
          // RegExpExecArray-style indexing uses args[0..n-3].
          const matchArray = args.slice(0, -2) as unknown as RegExpExecArray;
          return replacement(matchArray);
        });
      } else {
        result = result.replace(pattern, replacement as string);
      }
    }
    return result;
  }

  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }

  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        out[k] = '<redacted>';
      } else {
        out[k] = redactSecrets(v);
      }
    }
    return out;
  }

  return value;
}

/**
 * Redact a single string — convenience wrapper for when you only have
 * a string and don't need the recursive object walk.
 */
export function redactString(value: string): string {
  return redactSecrets(value) as string;
}