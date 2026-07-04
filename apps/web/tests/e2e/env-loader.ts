/**
 * Shared environment loader for Playwright E2E tests.
 *
 * Extracted from playwright.config.ts and global-setup.ts to avoid
 * code duplication. Loads .env.local, falls back to .env.production.local
 * for values that are empty or missing (e.g. ENCRYPTION_SECRET="") and
 * sets defaults for AUTH_SECRET / NEXTAUTH_URL / DATABASE_URL.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Parse a single .env file and load its key=value pairs into process.env,
 * respecting existing values (first-write-wins).
 */
function loadEnvFile(path: string) {
  try {
    const content = readFileSync(path, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      if (trimmed.slice(eqIdx + 1).trim() === '"') continue; // skip multi-line JSON start
      let value = trimmed.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && value && !process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // file not found / unreadable — skip
  }
}

/**
 * Walk up from `dir` to find the monorepo root (where turbo.json exists).
 */
function findMonorepoRoot(dir: string): string | null {
  let current = dir;
  for (let i = 0; i < 10; i++) {
    try {
      if (existsSync(resolve(current, 'turbo.json'))) {
        return current;
      }
    } catch {
      return null;
    }
    const parent = resolve(current, '..');
    if (parent === current) return null; // hit filesystem root
    current = parent;
  }
  return null;
}

/**
 * Bootstrap process.env for E2E tests.
 *
 * 1. Loads .env.local from the config directory and monorepo root
 * 2. Falls back to .env.production.local for any still-missing values
 * 3. Sets AUTH_SECRET, NEXTAUTH_URL, and DATABASE_URL defaults
 */
export function loadE2eEnv(dir: string) {
  const root = findMonorepoRoot(dir);

  // .env.local first (user-local overrides)
  loadEnvFile(resolve(dir, '.env.local'));
  if (root) {
    loadEnvFile(resolve(root, '.env.local'));
  }

  // .env.production.local as fallback for empty/missing values
  // (fixes ENCRYPTION_SECRET="" override in .env.local)
  if (root) {
    loadEnvFile(resolve(root, '.env.production.local'));
  }
  loadEnvFile(resolve(dir, '.env.production.local'));

  // NextAuth defaults
  if (!process.env.AUTH_SECRET) {
    process.env.AUTH_SECRET =
      process.env.AUTH_COOKIE_SECRET || 'e2e-test-fallback-secret-key-32-chars!!';
  }
  if (!process.env.NEXTAUTH_URL) {
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
  }
  if (!process.env.DATABASE_URL && process.env.POSTGRES_URL) {
    process.env.DATABASE_URL = process.env.POSTGRES_URL;
  }
}
