#!/usr/bin/env node
// Copyright 2026 HamaFX
//
// Lightweight bundle-size guard for the web app.
// Reads apps/web/bundle-size-limits.json, walks .next/static/chunks,
// and exits non-zero when any file exceeds its matched limit.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CHUNKS_DIR = path.join(ROOT, '.next', 'static', 'chunks');
const DEFAULT_CONFIG_PATH = path.join(ROOT, 'bundle-size-limits.json');

/**
 * Minimal glob matcher supporting `*` (one segment, no slashes) and
 * `**` (zero or more segments). Patterns are relative paths under
 * .next/static/chunks, e.g. "app/dashboard-*.js".
 *
 * @param {string} filepath relative path to test, e.g. "app/dashboard-abc123.js"
 * @param {string} pattern glob pattern, e.g. "app/*.js"
 */
function matchesPattern(filepath, pattern) {
  return matchParts(filepath.split('/'), pattern.split('/'), 0, 0);
}

function matchParts(fileParts, patParts, fi, pi) {
  if (pi === patParts.length) return fi === fileParts.length;
  if (fi > fileParts.length) return false;

  const pat = patParts[pi];
  if (pat === '**') {
    // ** matches zero or more whole segments.
    for (let i = fi; i <= fileParts.length; i += 1) {
      if (matchParts(fileParts, patParts, i, pi + 1)) return true;
    }
    return false;
  }

  if (fi >= fileParts.length || !matchesSegment(fileParts[fi], pat)) return false;
  return matchParts(fileParts, patParts, fi + 1, pi + 1);
}

function matchesSegment(segment, pattern) {
  // Escape special regex characters except * which is converted to [^/]*
  const regex = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp(`^${regex}$`).test(segment);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function loadConfig(configPath) {
  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw);
}

function collectJsFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsFiles(fullPath));
    } else if (entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

function runGuard({ configPath = DEFAULT_CONFIG_PATH } = {}) {
  if (!fs.existsSync(CHUNKS_DIR)) {
    console.error(`❌ Chunks directory not found: ${CHUNKS_DIR}\n   Run \`pnpm --filter @hamafx/web build\` first.`);
    process.exit(1);
  }

  let config;
  try {
    config = loadConfig(configPath);
  } catch (err) {
    console.error(`❌ Failed to load config at ${configPath}: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  if (!Array.isArray(config.limits) || config.limits.length === 0) {
    console.error('❌ Config must contain a non-empty "limits" array.');
    process.exit(1);
  }

  for (let i = 0; i < config.limits.length; i += 1) {
    const limit = config.limits[i];
    if (typeof limit.pattern !== 'string' || limit.pattern.length === 0) {
      console.error(`❌ Limit at index ${i} is missing a non-empty "pattern" field.`);
      process.exit(1);
    }
    if (typeof limit.maxBytes !== 'number' || !Number.isFinite(limit.maxBytes) || limit.maxBytes <= 0) {
      console.error(`❌ Limit at index ${i} (${limit.pattern}) has an invalid "maxBytes" value. It must be a positive number.`);
      process.exit(1);
    }
  }

  const jsFiles = collectJsFiles(CHUNKS_DIR);
  const results = [];
  let hasFailure = false;

  for (const file of jsFiles) {
    const stats = fs.statSync(file);
    const sizeBytes = stats.size;
    const relativePath = path.relative(CHUNKS_DIR, file).replace(/\\/g, '/');

    const matchedLimits = config.limits
      .filter((limit) => matchesPattern(relativePath, limit.pattern))
      .sort((a, b) => (a.maxBytes ?? Infinity) - (b.maxBytes ?? Infinity));

    const winningLimit = matchedLimits[0];
    const limitBytes = winningLimit?.maxBytes;
    const exceeded = limitBytes !== undefined && sizeBytes > limitBytes;

    if (exceeded) {
      hasFailure = true;
    }

    results.push({
      chunk: relativePath,
      size: formatBytes(sizeBytes),
      rawBytes: sizeBytes,
      limit: limitBytes !== undefined ? formatBytes(limitBytes) : '-',
      matchedPattern: winningLimit?.pattern ?? '-',
      status: exceeded ? 'FAIL' : 'PASS',
    });
  }

  results.sort((a, b) => b.rawBytes - a.rawBytes);

  // eslint-disable-next-line no-console
  console.table(
    results.map(({ chunk, size, limit, matchedPattern, status }) => ({
      chunk,
      size,
      limit,
      pattern: matchedPattern,
      status,
    })),
  );

  if (hasFailure) {
    console.error('\n🚨 Bundle-size guard failed: one or more chunks exceed their configured limit.');
    console.error(`   Config: ${configPath}\n`);
    process.exit(1);
  }

  console.log(`\n✅ All ${results.length} chunks are within their configured size limits.`);
}

export { matchesPattern };

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runGuard({ configPath: process.argv[2] ? path.resolve(process.argv[2]) : undefined });
}
