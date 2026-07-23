// SPDX-License-Identifier: Apache-2.0

// HTML generator — produces a self-contained HTML file that renders
// the architecture graph with D3.js. Refactored: CSS, HTML body, and
// JavaScript are now separate modules for maintainability.

import type { ArchitectureModel } from './types.js';
import { getStyles } from './styles.js';
import { getHtmlTemplate } from './html-template.js';
import { getScripts } from './scripts.js';

export function generateHtml(model: ArchitectureModel): string {
  // Embed the JSON payload in a dedicated <script type="application/json">
  // element.  This completely separates data from executable code, avoiding
  // ALL escaping issues (no template literals, no base64, no TextDecoder).
  // The only thing we guard against is </script> inside the JSON, which
  // would prematurely close the data element.
  const jsonPayload = JSON.stringify(model).replace(/<\/script>/gi, '<\\/script>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>HamaFX-Ai Architecture Explorer</title>
${getStyles()}
${getHtmlTemplate()}
<script src="/d3.v7.min.js"></script>
<script type="application/json" id="arch-data">
${jsonPayload}
</script>
${getScripts()}
</script>
</body>
</html>`;
}
