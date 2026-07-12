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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

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
// With shamefully-hoist=true, external deps are available from the monorepo
// root node_modules. ws is bundled via the pnpm-resolver plugin below
// to avoid runtime resolution issues with pnpm's strict layout.
const alwaysBundle = new Set(['ws']);
const external = deps.filter(
  (d) => !d.startsWith('@hamafx/') && !d.startsWith('@opentelemetry/') && !alwaysBundle.has(d),
);

// Plus Node built-ins that shouldn't be inlined.
external.push(
  'node:*',
  // @sentry/node lazily imports OpenTelemetry transports + agents that
  // dynamic-resolve based on the environment; let Node load them as
  // installed packages rather than bundling them.
  '@sentry/node',
);

// Stub out `server-only` — it's a build-time guard that throws at module
// load time, which breaks the worker (Node.js backend with no bundler
// stripping). The modules that import it (@hamafx/shared/src/encryption)
// are never called by the worker, but the import side-effect is evaluated
// eagerly during ESM module graph loading.
const serverOnlyPlugin = {
  name: 'server-only',
  setup(build) {
    build.onResolve({ filter: /^server-only$/ }, () => ({
      path: 'server-only-stub',
      namespace: 'server-only-stub',
    }));
    build.onLoad({ filter: /^server-only-stub$/, namespace: 'server-only-stub' }, () => ({
      contents: '',
      loader: 'js',
    }));
  },
};

// Resolve packages from the monorepo root's node_modules so esbuild can
// find packages in pnpm's .pnpm store when alwaysBundle includes them.
const monorepoRoot = resolve(root, '..', '..');

// Plugin: resolve specific packages from pnpm's .pnpm store when
// esbuild's default resolution fails (pnpm strict layout).
// Only activates for packages listed in pnpmBundlePackages.
const pnpmBundlePackages = new Set(['ws']);
const pnpmResolver = {
  name: 'pnpm-resolver',
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      // Only handle specific packages that need bundling from pnpm store
      if (!pnpmBundlePackages.has(args.path)) return undefined;
      if (args.path.startsWith('.') || args.path.startsWith('/') || args.path.startsWith('node:')) {
        return undefined;
      }
      // Search .pnpm store for matching package directories
      const pnpmStore = join(monorepoRoot, 'node_modules', '.pnpm');
      if (!existsSync(pnpmStore)) return undefined;
      const entries = readdirSync(pnpmStore);
      const match = entries.find((e) => e.startsWith(`${args.path}@`));
      if (match) {
        const pkgDir = join(pnpmStore, match, 'node_modules', args.path);
        // Read the package.json main field to get the entry point
        const pkgJsonPath = join(pkgDir, 'package.json');
        if (existsSync(pkgJsonPath)) {
          const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
          const mainFile = pkgJson.main || 'index.js';
          const entryPath = join(pkgDir, mainFile);
          if (existsSync(entryPath)) {
            return { path: entryPath };
          }
        }
        // Fallback: try index.js
        const fallback = join(pkgDir, 'index.js');
        if (existsSync(fallback)) return { path: fallback };
      }
      return undefined;
    });
  },
};

const common = {
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  external,
  nodePaths: [resolve(monorepoRoot, 'node_modules')],
  plugins: [pnpmResolver, serverOnlyPlugin],
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
