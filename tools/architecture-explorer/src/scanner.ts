// SPDX-License-Identifier: Apache-2.0

// Project scanner — walks the directory tree, respects .gitignore,
// and identifies file types relevant to architecture analysis.

import * as fs from 'node:fs';
import * as path from 'node:path';
import ignore from 'ignore';
import type { ScanOptions } from './types.js';

const RELEVANT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts',
  '.json', '.css', '.scss', '.less',
  '.prisma', '.sql',
  '.md', '.mdx',
  '.yml', '.yaml', '.toml',
  '.env', '.env.example', '.env.local',
  '.dockerfile', 'Dockerfile',
]);

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.next', '.turbo', 'dist', 'build',
  '.vercel', '.hamafx', 'coverage', '__pycache__', '.pytest_cache',
  '.changeset', '.github',
]);

const IGNORE_FILES = new Set([
  'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock',
  'CHANGELOG.md', '.DS_Store', '*.log',
]);

function shouldIgnoreDir(name: string): boolean {
  return IGNORE_DIRS.has(name) || name.startsWith('.');
}

function shouldIgnoreFile(name: string): boolean {
  if (IGNORE_FILES.has(name)) return true;
  if (name.endsWith('.log')) return true;
  if (name.endsWith('.lock')) return true;
  if (name === '.gitignore') return true;
  if (name === '.npmrc') return true;
  if (name === '.nvmrc') return true;
  if (name === '.editorconfig') return true;
  if (name === '.prettierignore') return true;
  if (name === '.prettierrc.json') return true;
  return false;
}

function isRelevantFile(name: string): boolean {
  // Always include certain files
  if (name === 'package.json') return true;
  if (name === 'tsconfig.json' || name === 'tsconfig.base.json') return true;
  if (name === 'turbo.json') return true;
  if (name === 'vitest.config.ts' || name === 'vitest.workspace.ts') return true;
  if (name === 'drizzle.config.ts') return true;
  if (name === 'next.config.mjs') return true;
  if (name === 'docker-compose.yml' || name === 'docker-compose.vm.yml') return true;
  if (name === 'Dockerfile' || name === 'Dockerfile.worker') return true;
  if (name.endsWith('.env') || name.endsWith('.env.example')) return true;
  if (name === 'eslint.config.js') return true;

  // Check extensions
  const ext = path.extname(name).toLowerCase();
  return RELEVANT_EXTENSIONS.has(ext);
}

function loadGitignore(rootDir: string): ReturnType<typeof ignore> {
  const ig = ignore();
  // Always ignore common patterns
  ig.add([
    'node_modules',
    '.git',
    '.next',
    '.turbo',
    'dist',
    'build',
    '.vercel',
    '.hamafx',
    'coverage',
    'pnpm-lock.yaml',
    '*.log',
  ]);

  const gitignorePath = path.join(rootDir, '.gitignore');
  try {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    ig.add(content);
  } catch {
    // No .gitignore found
  }
  return ig;
}

export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  name: string;
  ext: string;
  pkg: string; // derived package name
  size: number;
}

export function getPackageName(filePath: string, rootDir: string): string {
  // Derive package name from path relative to root
  const rel = path.relative(rootDir, filePath);
  const parts = rel.split(path.sep);

  if (parts[0] === 'apps' && parts[1]) return `@hamafx/${parts[1]}`;
  if (parts[0] === 'packages' && parts[1]) return `@hamafx/${parts[1]}`;
  if (parts[0] === 'tools' && parts[1]) return `tool:${parts[1]}`;
  if (parts[0] === 'loadtest') return 'loadtest';
  if (parts[0] === 'infra') return 'infra';
  if (parts[0] === 'docs') return 'docs';
  if (parts[0] === 'scripts') return 'scripts';
  if (parts[0] === 'docker') return 'docker';
  return 'root';
}

export interface ScanResult {
  files: ScannedFile[];
  rootDir: string;
  packageNames: Set<string>;
}

export function scanProject(opts: ScanOptions): ScanResult {
  const { rootDir, verbose } = opts;
  const ig = loadGitignore(rootDir);
  const files: ScannedFile[] = [];
  const packageNames = new Set<string>();

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(rootDir, fullPath);

      if (entry.isDirectory()) {
        if (shouldIgnoreDir(entry.name)) continue;
        if (ig.ignores(relPath)) continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        if (shouldIgnoreFile(entry.name)) continue;
        if (ig.ignores(relPath)) continue;
        if (!isRelevantFile(entry.name)) continue;

        const pkg = getPackageName(fullPath, rootDir);
        packageNames.add(pkg);

        let size = 0;
        try {
          size = fs.statSync(fullPath).size;
        } catch { /* ignore */ }

        files.push({
          absolutePath: fullPath,
          relativePath: relPath,
          name: entry.name,
          ext: path.extname(entry.name).toLowerCase(),
          pkg,
          size,
        });
      }
    }
  }

  walk(rootDir);

  if (verbose) {
    console.log(`[scanner] Scanned ${files.length} files across ${packageNames.size} packages`);
    for (const pkg of packageNames) {
      const count = files.filter((f) => f.pkg === pkg).length;
      console.log(`  ${pkg}: ${count} files`);
    }
  }

  return { files, rootDir, packageNames };
}

export function filterByExt(files: ScannedFile[], exts: string[]): ScannedFile[] {
  return files.filter((f) => exts.includes(f.ext));
}

export function filterByPkg(files: ScannedFile[], pkg: string): ScannedFile[] {
  return files.filter((f) => f.pkg === pkg);
}

export function getTsFiles(files: ScannedFile[]): ScannedFile[] {
  return filterByExt(files, ['.ts', '.tsx', '.mts']);
}

export function getRouteFiles(files: ScannedFile[]): ScannedFile[] {
  return files.filter((f) => f.name === 'route.ts' || f.name === 'route.tsx');
}

export function getSchemaFiles(files: ScannedFile[]): ScannedFile[] {
  return files.filter((f) => f.relativePath.includes('/schema/') && f.ext === '.ts');
}

export function getComponentFiles(files: ScannedFile[]): ScannedFile[] {
  return files.filter((f) => f.ext === '.tsx' && f.relativePath.includes('/components/'));
}

export function getToolFiles(files: ScannedFile[]): ScannedFile[] {
  return files.filter((f) =>
    f.relativePath.includes('/tools/') &&
    f.ext === '.ts' &&
    !f.name.endsWith('.test.ts') &&
    f.name !== 'index.ts' &&
    f.name !== 'registry.ts' &&
    f.name !== 'by-domain.ts' &&
    f.name !== 'with-telemetry.ts' &&
    f.name !== 'mutation-guard.ts'
  );
}

export function getAgentFiles(files: ScannedFile[]): ScannedFile[] {
  return files.filter((f) =>
    f.relativePath.includes('/multi-agent/agents/') &&
    f.ext === '.ts' &&
    f.name.endsWith('-agent.ts')
  );
}
