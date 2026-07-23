// SPDX-License-Identifier: Apache-2.0
// JavaScript for the architecture explorer HTML output.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _js = readFileSync(resolve(__dirname, '_js.txt'), 'utf-8');

export function getScripts(): string {
  // The _js.txt source file uses backslash-escaped template syntax for its
  // template literals. Strip these so the generated JS has valid syntax.
  let js = _js;
  js = js.replace(/\\`/g, '`');
  js = js.replace(/\\\$/g, '$');
  return '<script>\n' + js;
}
