#!/usr/bin/env node
// @ts-check
/**
 * generate-icons.mjs
 *
 * Generates the Kestrel PWA icon set in `apps/web/public/icons/` from the
 * brand logo (`public/brand/kestrel-logo.png`) composited as-is onto the
 * app background. Idempotent: by default it skips targets that already
 * exist on disk; pass `--force` to regenerate.
 *
 * Targets:
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

/** Brand background from the design system (matches manifest theme_color). */
const BRAND_BG = '#0A0A0A';

/** Source logo — uploaded kestrel bird mark (1536x1024), used as-is.
 * The reversible two-tone design reads on the #0A0A0A icon background:
 * white strokes show on dark, black strokes show on light. */
const LOGO_PATH = resolve(WEB_ROOT, 'public/brand/kestrel-logo.png');

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
 * Composite the logo onto the brand background for a target.
 * The logo is 3:2, so it is sized by width relative to the short side:
 *   - icon / apple-touch: 78% (fills the square, leaves breathing room)
 *   - maskable:           60% (inside the iOS/Android safe zone)
 *   - splash:             30% (small mark on a flat background)
 *
 * @param {IconTarget} t
 * @param {typeof import('sharp')} sharp
 * @returns {Promise<Buffer>} PNG buffer
 */
async function buildPng(t, sharp) {
  const { width, height, kind } = t;
  const short = Math.min(width, height);
  const ratio = kind === 'maskable' ? 0.6 : kind === 'splash' ? 0.3 : 0.78;
  const logoW = Math.round(short * ratio);
  // Derive height from the live source dimensions so the aspect stays exact.
  const meta = await sharp(LOGO_PATH).metadata();
  const logoAspect = (meta.width ?? 1536) / (meta.height ?? 1024);
  const logoH = Math.round(logoW / logoAspect);

  const background = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 10, g: 10, b: 10, alpha: 1 },
    },
  });

  const logo = await sharp(LOGO_PATH)
    .resize(logoW, logoH, { fit: 'fill' })
    .png()
    .toBuffer();

  return background
    .composite([{ input: logo, left: Math.round((width - logoW) / 2), top: Math.round((height - logoH) / 2) }])
    .png({ compressionLevel: 9 })
    .toBuffer();
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
        '`pnpm --filter @kestrel/web add -D sharp` then re-run this script. ' +
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
    const png = await buildPng(t, sharp);
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
