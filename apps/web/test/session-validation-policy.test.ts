// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { DbClient } from '@kestrel/db';
import { validateSession, type SessionToken } from '../src/lib/auth/session-validators';

const authSource = readFileSync(resolve(process.cwd(), 'src/auth.ts'), 'utf8');

function token(overrides: Partial<SessionToken> = {}): SessionToken {
  return {
    id: 'user-1',
    tokenVersion: 3,
    sessionId: 'session-1',
    iat: 1_000,
    ...overrides,
  };
}

function validSelectChain(row: unknown) {
  const limit = vi.fn().mockResolvedValue(row === undefined ? [{ tv: 3, sessionId: 'session-1' }] : row);
  const where = vi.fn(() => ({ limit }));
  const leftJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ leftJoin }));
  const select = vi.fn(() => ({ from }));
  return { select, from, leftJoin, where, limit };
}

function dbWithSelect(select: DbClient['select'], update?: DbClient['update']): DbClient {
  return { select, update: update ?? vi.fn() } as unknown as DbClient;
}

describe('session validation outage policy', () => {
  it('invalidates the session when auth cannot acquire the database client', () => {
    expect(authSource).toContain("auth/session_database_unavailable");
    expect(authSource).toContain("return { ...session, user: undefined, expires: '0' }");
    expect(authSource).toContain('validateSession(db, token, session, now, { failClosed: true })');
  });

  it('invalidates the session when the revocation query fails by default', async () => {
    const select = vi.fn(() => {
      throw new Error('database unavailable');
    });
    const session = { user: { id: 'user-1' }, expires: 'future' };

    const result = await validateSession(
      dbWithSelect(select),
      token(),
      session,
      2_000,
    );

    expect(result).toEqual({ user: undefined, expires: '0' });
    expect(select).toHaveBeenCalledOnce();
  });

  it('invalidates the session when the last-active update fails', async () => {
    const chain = validSelectChain();
    const update = vi.fn(() => ({
      set: vi.fn(() => {
        throw new Error('database unavailable');
      }),
    }));
    const session = { user: { id: 'user-1' }, expires: 'future' };

    const result = await validateSession(
      dbWithSelect(chain.select, update),
      token(),
      session,
      2_000,
    );

    expect(result).toEqual({ user: undefined, expires: '0' });
    expect(chain.select).toHaveBeenCalledOnce();
    expect(chain.from).toHaveBeenCalledOnce();
    expect(chain.leftJoin).toHaveBeenCalledOnce();
    expect(chain.where).toHaveBeenCalledOnce();
    expect(chain.limit).toHaveBeenCalledOnce();
  });

  it('keeps a valid session and advances validation timestamps when checks succeed', async () => {
    const chain = validSelectChain();
    const set = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    const update = vi.fn(() => ({ set }));
    const sessionToken = token();
    const session = { user: { id: 'user-1' }, expires: 'future' };

    const result = await validateSession(
      dbWithSelect(chain.select, update),
      sessionToken,
      session,
      2_000,
    );

    expect(result).toBeNull();
    expect(sessionToken.tvCheckedAt).toBe(2_000);
    expect(sessionToken.lastActiveUpdate).toBe(2_000);
    expect(set).toHaveBeenCalled();
    expect(chain.select).toHaveBeenCalledOnce();
    expect(chain.limit).toHaveBeenCalledOnce();
  });
});
