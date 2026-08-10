// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..');
const setup = readFileSync(resolve(root, 'scripts/setup.mjs'), 'utf8');


describe('beginner setup wizard policy', () => {
  it('supports simple and full modes without requiring Docker for simple mode', () => {
    expect(setup).toContain("Choose mode ${paint('[1=Simple / 2=Full]', 'dim')}");
    expect(setup).toContain('Full mode is unavailable because Docker Desktop is not running.');
    expect(setup).toContain('Simple mode needs pnpm or Corepack');
    expect(setup).toContain('BYOK_ENABLED: \'1\'');
  });

  it('preserves existing configuration while safely updating selected values', () => {
    expect(setup).toContain('function upsertEnvFile(filePath, values)');
    expect(setup).toContain("writeFileSync(filePath, content, { mode: 0o600 })");
    expect(setup).toContain("chmodSync(filePath, 0o600)");
  });

  it('waits for the app and opens the local browser after startup', () => {
    expect(setup).toContain('async function waitForApp');
    expect(setup).toContain('function openBrowser(url)');
    expect(setup).toContain('Waiting for the app to become ready');
    expect(setup).toContain('Opening it in your browser');
  });
});
