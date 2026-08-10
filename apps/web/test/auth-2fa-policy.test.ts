// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..');
const authSource = readFileSync(resolve(root, 'apps/web/src/auth.ts'), 'utf8');
const actionsSource = readFileSync(resolve(root, 'apps/web/src/app/(auth)/actions.ts'), 'utf8');

describe('2FA rate-limit security policy', () => {
  it('fails closed when the database-backed limiter is unavailable', () => {
    const rateLimitBlockStart = authSource.indexOf("withRateLimit(user.id, '2fa_verify', 10)");
    const rateLimitBlockEnd = authSource.indexOf('if (!rateLimitAllowed)', rateLimitBlockStart);

    expect(rateLimitBlockStart).toBeGreaterThan(-1);
    expect(rateLimitBlockEnd).toBeGreaterThan(rateLimitBlockStart);

    const rateLimitBlock = authSource.slice(rateLimitBlockStart, rateLimitBlockEnd);
    expect(rateLimitBlock).toContain("throw new AuthError('2FA_SYSTEM_ERROR')");
    expect(rateLimitBlock).toContain('2FA rate limiting is a security control');
    expect(rateLimitBlock).not.toContain('fail open');
  });

  it('keeps backend failure distinct from an exceeded 2FA limit', () => {
    expect(authSource).toContain("throw new AuthError('2FA_RATE_LIMITED')");
    expect(actionsSource).toContain("message === '2FA_RATE_LIMITED'");
    expect(actionsSource).toContain("message === '2FA_SYSTEM_ERROR'");
    expect(actionsSource).toContain('Unable to verify 2FA right now. Please try again.');
    expect(actionsSource).toContain('requires2FA: true');
  });
});
