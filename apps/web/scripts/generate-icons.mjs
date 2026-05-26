#!/usr/bin/env node
// @ts-check
/**
 * generate-icons.mjs
 *
 * Generates the placeholder PWA icon set in `apps/web/public/icons/` from a
 * single inline SVG source. Idempotent: by default it skips targets that
 * already exist on disk; pass `--force` to regenerate.
 *
 * Targets (matches design §6 / Requirement 5.7 + 5.8):
 *   - icon-192.png                 (192x192)
 *   - icon-512.png                 (512x512)
 *   - icon-maskable-512.png        (512x512 with safe zone)
 *   - apple-touch-icon-180.png     (180x180)
 *   - apple-splash-1179x2556.png   (iPhone 15 / 14 Pro portrait)
 *
 * `sharp` is loaded dynamically so this script never crashes a `next build`
 * when the dep is not present yet — it just logs a hint and exits 0.
 *
 * Usage:
 *   node scripts/generate-icons.mjs              # write missing files only
 *   node scripts/generate-icons.mjs --force      # overwrite all targets
 *
 * Requirements: 5.7
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, '..');
const ICONS_DIR = resolve(WEB_ROOT, 'public/icons');

/** Brand colors from the design system (placeholder, replaced in task 13.5). */
const BRAND_BG = '#0b0d10';
const BRAND_FG = '#d4af37';

/**
 * @typedef {Object} IconTarget
 * @property {string} file
 * @property {number} width
 * @property {number} height
 * @property {'icon' | 'maskable' | 'splash'} kind
 */

/** @type {readonly IconTarget[]} */
const TARGETS = Object.freeze([
  { file: 'icon-192.png', width: 192, height: 192, kind: 'icon' },
  { file: 'icon-512.png', width: 512, height: 512, kind: 'icon' },
  { file: 'icon-maskable-512.png', width: 512, height: 512, kind: 'maskable' },
  { file: 'apple-touch-icon-180.png', width: 180, height: 180, kind: 'icon' },
  { file: 'apple-splash-1179x2556.png', width: 1179, height: 2556, kind: 'splash' },
]);

/**
 * Build an inline SVG for a given target. Maskable variant insets the glyph
 * to keep it inside the iOS/Android safe zone (inner 80% of the square).
 *
 * @param {IconTarget} t
 * @returns {string} SVG markup
 */
function buildSvg(t) {
  const { width, height, kind } = t;
  const cx = width / 2;
  const cy = height / 2;
  // Glyph radius: 38% of the short side for icons, 30% for maskable (safe
  // zone), and 12% for splash (small mark on a flat background).
  const short = Math.min(width, height);
  const r =
    kind === 'maskable' ? short * 0.3 : kind === 'splash' ? short * 0.12 : short * 0.38;
  const fontSize = r * 1.2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${BRAND_BG}"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${BRAND_FG}" stroke-width="${Math.max(2, r * 0.06)}"/>
  <text x="${cx}" y="${cy}" fill="${BRAND_FG}" font-family="-apple-system, system-ui, sans-serif" font-size="${fontSize}" font-weight="700" text-anchor="middle" dominant-baseline="central">H</text>
</svg>`;
}

async function main() {
  const force = process.argv.includes('--force');

  /** @type {typeof import('sharp')} */
  let sharp;
  try {
    ({ default: sharp } = await import('sharp'));
  } catch {
    // eslint-disable-next-line no-console
    console.warn(
      '[generate-icons] `sharp` is not installed. Run ' +
        '`pnpm --filter @hamafx/web add -D sharp` then re-run this script. ' +
        'Skipping icon generation.',
    );
    return;
  }

  mkdirSync(ICONS_DIR, { recursive: true });

  let written = 0;
  let skipped = 0;
  for (const t of TARGETS) {
    const out = resolve(ICONS_DIR, t.file);
    if (existsSync(out) && !force) {
      skipped += 1;
      continue;
    }
    const svg = buildSvg(t);
    const png = await sharp(Buffer.from(svg))
      .resize(t.width, t.height, { fit: 'cover' })
      .png({ compressionLevel: 9 })
      .toBuffer();
    writeFileSync(out, png);
    written += 1;
    // eslint-disable-next-line no-console
    console.log(`[generate-icons] wrote ${out} (${t.width}x${t.height})`);
  }
  // eslint-disable-next-line no-console
  console.log(
    `[generate-icons] done — ${written} written, ${skipped} skipped${force ? ' (force)' : ''}`,
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[generate-icons] failed:', err);
  process.exit(1);
});
