// Bundle the worker into self-contained ESM files. Workspace packages
// (`@hamafx/shared`, `@hamafx/db`, `@hamafx/data`, `@hamafx/ai`,
// `@hamafx/indicators`) export TypeScript source directly via
// `package.json#main = "./src/index.ts"`, which Node can't load
// natively. Bundling into one file per entrypoint is the standard fix
// — same pattern as deploying TypeScript Node services anywhere.
//
// We do NOT bundle native modules / Node built-ins; everything is
// `external` except the workspace packages and their direct deps.
//
// Two entrypoints:
//   - dist/index.js       — long-running worker (BiQuote SignalR + flush loop)
//   - dist/runner/cli.js  — `node dist/runner/cli.js <job-name>`
//
// Run from the package root: `pnpm --filter @hamafx/worker build`.

import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Read the worker's own package.json to figure out which deps stay
// external (anything from `dependencies` other than @hamafx/* gets
// installed via pnpm at runtime).
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const deps = Object.keys(pkg.dependencies ?? {});
// Don't auto-externalize OpenTelemetry packages — they'd need to resolve
// from node_modules at runtime, but pnpm's strict layout won't hoist
// transitive @opentelemetry/* deps into the worker's node_modules.
// Bundling them is simpler and avoids a long chain of manual deps.
const external = deps.filter(
  (d) => !d.startsWith('@hamafx/') && !d.startsWith('@opentelemetry/'),
);

// Plus Node built-ins that shouldn't be inlined.
external.push(
  'node:*',
  // @sentry/node lazily imports OpenTelemetry transports + agents that
  // dynamic-resolve based on the environment; let Node load them as
  // installed packages rather than bundling them.
  '@sentry/node',
);

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  external,
  // Workspace packages are pure ESM; force the bundler to emit ESM and
  // not wrap dynamic-import shims that confuse Node.
  banner: {
    js: "import { createRequire as _cr } from 'node:module'; const require = _cr(import.meta.url);",
  },
  logLevel: 'info',
};

await Promise.all([
  build({
    ...common,
    entryPoints: [resolve(root, 'src/index.ts')],
    outfile: resolve(root, 'dist/index.js'),
  }),
  build({
    ...common,
    entryPoints: [resolve(root, 'src/runner/cli.ts')],
    outfile: resolve(root, 'dist/runner/cli.js'),
  }),
]);
