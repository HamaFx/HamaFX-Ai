// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ALL_SYMBOLS, CFTC_SUPPORTED_SYMBOLS, SymbolSchema } from '@kestrel/shared';

const root = resolve(process.cwd(), '../..');
const authSource = readFileSync(resolve(root, 'apps/web/src/auth.ts'), 'utf8');
const actionsSource = readFileSync(resolve(root, 'apps/web/src/app/(auth)/actions.ts'), 'utf8');
const promptSource = readFileSync(resolve(root, 'packages/ai/src/prompt/system.ts'), 'utf8');
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), 'utf8');

describe('Phase 4 authentication persistence policy', () => {
  it('fails closed for every security-critical login persistence path', () => {
    expect(authSource).toContain("throw new AuthError('AUTH_SYSTEM_ERROR')");
    expect(authSource).toContain("throw new AuthError('2FA_SYSTEM_ERROR')");
    expect(authSource).toContain("throw new AuthError('SESSION_SYSTEM_ERROR')");
    expect(authSource).toContain("'auth/lockout_increment'");
    expect(authSource).toContain("'auth/lockout_reset'");
    expect(authSource).toContain("'auth/2fa_lockout_increment'");
    expect(authSource).toContain("'auth/2fa_lockout_reset'");
    expect(authSource).toContain("'auth/consume_backup_code'");
    expect(authSource).toContain("array_remove");
    expect(authSource).toContain(".returning({ id: schema.users.id })");
    expect(authSource).not.toContain('fail open — lockout');
    expect(authSource).not.toContain('fail open — session insert');
  });

  it('maps persistence failures to safe user-facing responses', () => {
    expect(actionsSource).toContain("message === 'AUTH_SYSTEM_ERROR'");
    expect(actionsSource).toContain("message === 'SESSION_SYSTEM_ERROR'");
    expect(actionsSource).toContain('Unable to sign in right now. Please try again.');
  });
});

describe('Phase 5 canonical product scope', () => {
  it('exposes the full catalog while preserving the intentional CFTC subset', () => {
    expect(ALL_SYMBOLS).toHaveLength(18);
    expect(CFTC_SUPPORTED_SYMBOLS).toEqual(['XAUUSD', 'EURUSD', 'GBPUSD']);
    for (const symbol of ALL_SYMBOLS) {
      expect(SymbolSchema.safeParse(symbol).success).toBe(true);
    }
  });

  it('describes the broader scope in active product surfaces', () => {
    expect(read('README.md')).toContain('gold, forex, and crypto research');
    expect(promptSource).toContain('canonical supported instruments');
    expect(read('packages/ai/src/tools/get-price.ts')).toContain('gold, forex, and crypto catalog');
    expect(read('apps/web/src/app/(app)/settings/_components/about-card.tsx')).toContain('Gold · forex · crypto');
  });

  it('labels narrow legacy analytics instead of implying product-wide limits', () => {
    expect(read('packages/ai/src/tools/get-correlation.ts')).toContain('legacy CFTC/intermarket trio');
    expect(read('packages/ai/src/tools/get-intermarket.ts')).toContain('legacy CFTC/intermarket trio');
  });
});
