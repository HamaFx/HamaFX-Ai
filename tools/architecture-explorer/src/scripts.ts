// SPDX-License-Identifier: Apache-2.0
// JavaScript for the architecture explorer HTML output.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _js = readFileSync(resolve(__dirname, '_js.txt'), 'utf-8');

export function getScripts(base64Data: string): string {
  // The _js.txt source file uses backslash-escaped template syntax for its
  // OWN template literals (not the JSON data). Strip these so the generated
  // JS has valid template literals and expressions.
  let js = _js;
  js = js.replace(/\\`/g, '`');
  js = js.replace(/\\\$/g, '$');
  // Embed the base64-encoded JSON payload into the atob() call.
  // Base64 is A-Za-z0-9+/= only — zero overlap with JS/HTML syntax.
  js = js.replace('${jsonData}', base64Data);
  return '<script>\n' + js;
}
