/**
 * Playwright global setup — loads environment variables from .env.local
 * so that getDb() and other modules can connect during E2E tests.
 *
 * Next.js auto-loads .env.local for the dev server (via webServer),
 * but the Playwright test runner process does not. This bridge ensures
 * the test runner sees the same env as the dev server.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default function globalSetup() {
  const files = [
    resolve(__dirname, '../../.env.local'),
    resolve(__dirname, '../../../.env.local'),
  ];

  for (const envPath of files) {
    try {
      const content = readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        // Skip multi-line values (JSON objects) — not needed for E2E tests
        if (trimmed.slice(eqIdx + 1).trim() === '"') continue;
        let value = trimmed.slice(eqIdx + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (key && value && !process.env[key]) {
          process.env[key] = value;
        }
      }
    } catch {}
  }

  // NextAuth requires AUTH_SECRET and NEXTAUTH_URL
  if (!process.env.AUTH_SECRET) {
    process.env.AUTH_SECRET = process.env.AUTH_COOKIE_SECRET || 'e2e-test-fallback-secret-key-32-chars!!';
  }
  if (!process.env.NEXTAUTH_URL) {
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
  }
  // Also ensure DATABASE_URL is set from POSTGRES_URL if needed
  if (!process.env.DATABASE_URL && process.env.POSTGRES_URL) {
    process.env.DATABASE_URL = process.env.POSTGRES_URL;
  }
}
