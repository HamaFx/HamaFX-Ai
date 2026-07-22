// SPDX-License-Identifier: Apache-2.0
// HTML body template for the architecture explorer.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _html = readFileSync(resolve(__dirname, '_html.txt'), 'utf-8');

export function getHtmlTemplate(): string {
  return '</head>\n<body>\n' + _html;
}
