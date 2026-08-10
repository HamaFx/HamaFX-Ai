#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve(process.argv[2] ?? 'dist');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function resolveImport(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    `${base}.js`,
    path.join(base, 'index.js'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function rewriteSpecifier(file, specifier) {
  if (!specifier.startsWith('.') || path.extname(specifier)) return specifier;
  const resolved = resolveImport(file, specifier);
  if (!resolved) return specifier;
  return `${specifier}/${path.basename(resolved)}`.replace(/\/index\.js$/, '/index.js').replace(/\/([^/]+)\/\1\.js$/, '/$1.js');
}

const files = walk(distDir).filter((file) => file.endsWith('.js'));
const importPattern = /(from\s*["']|import\s*\(\s*["']|import\s*["'])(\.[^"']+)(["'])/g;

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const rewritten = source.replace(importPattern, (match, prefix, specifier, quote) => {
    const next = rewriteSpecifier(file, specifier);
    return `${prefix}${next}${quote}`;
  });
  if (rewritten !== source) fs.writeFileSync(file, rewritten);
}

console.log(`Rewrote publish imports in ${files.length} JavaScript files under ${distDir}`);
