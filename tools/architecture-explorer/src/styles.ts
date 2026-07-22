// SPDX-License-Identifier: Apache-2.0
// CSS styles for the architecture explorer HTML output.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _css = readFileSync(resolve(__dirname, '_css.txt'), 'utf-8');

export function getStyles(): string {
  return '<style>\n' + _css + '</style>';
}
