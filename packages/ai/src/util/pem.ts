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

// SEC-4: Shared PEM key normalization.
//
// Environment variables often carry PEM private keys as one long line
// (no newlines), which OpenSSL 3.x's stricter decoder rejects with
// `ERR_OSSL_UNSUPPORTED` / `DECODER routines::unsupported`.
//
// This function re-wraps the base64 body to canonical 64-char lines
// so `crypto.createPrivateKey()` works on Node 20+ without the
// `--openssl-legacy-provider` flag.

/**
 * Normalize a PEM private key so it works with OpenSSL 3.x's stricter
 * decoder. Environment variables often carry the key as one long line
 * (no newlines), which the legacy `Sign.sign()` API rejects with
 * `ERR_OSSL_UNSUPPORTED` / `DECODER routines::unsupported`.
 *
 * This function:
 *   1. Strips any existing header/footer whitespace and normalises
 *      CRLF → LF.
 *   2. Extracts the base64 body.
 *   3. Re-wraps the body at 64-char lines.
 *   4. Emits a canonical PEM block with a trailing newline.
 */
export function normalizePemPrivateKey(raw: string): string {
  // Collapse CRLF → LF and trim surrounding whitespace.
  const key = raw.replace(/\r\n/g, '\n').trim();

  // Extract header and footer, then pull the base64 body from between them.
  // Note: do NOT include `PRIVATE` in the character class — `[A-Z ]+` would
  // greedily consume `PRIVATE KEY`, making the literal `PRIVATE KEY-----`
  // never match. Instead use `[A-Z ]+KEY-----` or just match the whole
  // marker string directly.
  const headerMatch = key.match(/^-----BEGIN [A-Z ]+KEY-----/m);
  const footerMatch = key.match(/-----END [A-Z ]+KEY-----/m);
  if (!headerMatch || !footerMatch) {
    // Not a recognised PEM block — return as-is and let OpenSSL reject it
    // with a readable error.
    return raw;
  }
  const header = headerMatch[0]!;
  const footer = footerMatch[0]!;

  // Remove header, footer, and all whitespace to get the raw base64 body.
  const body = key
    .replace(header, '')
    .replace(footer, '')
    .replace(/\s+/g, '');

  if (body.length === 0) return raw;

  // Wrap at 64 characters.
  const wrapped = body.match(/.{1,64}/g)?.join('\n') ?? body;

  return `${header}\n${wrapped}\n${footer}\n`;
}
