// SPDX-License-Identifier: Apache-2.0
// JavaScript for the architecture explorer HTML output.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _js = readFileSync(resolve(__dirname, '_js.txt'), 'utf-8');

export function getScripts(jsonData: string): string {
  return '<script>\n' + _js.replace('${jsonData}', jsonData);
}
