// SPDX-License-Identifier: Apache-2.0

// HTML generator — produces a self-contained HTML file that renders
// the architecture graph with D3.js. Refactored: CSS, HTML body, and
// JavaScript are now separate modules for maintainability.

import type { ArchitectureModel } from './types.js';
import { getStyles } from './styles.js';
import { getHtmlTemplate } from './html-template.js';
import { getScripts } from './scripts.js';

export function generateHtml(model: ArchitectureModel): string {
  // Base64-encode the JSON payload to avoid ALL escaping issues.
  // Template literals and JSON.parse() had chronic corruption when the
  // model contained `, $, \$ or other special characters in description
  // strings.  Base64 (A-Za-z0-9+/=) has zero overlap with JavaScript or
  // HTML syntax, so it is unconditionally safe.
  const jsonPayload = JSON.stringify(model);
  const base64 = Buffer.from(jsonPayload, 'utf-8').toString('base64');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>HamaFX-Ai Architecture Explorer</title>
${getStyles()}
${getHtmlTemplate()}
<script src="/d3.v7.min.js"></script>
${getScripts(base64)}
</script>
</body>
</html>`;
}
