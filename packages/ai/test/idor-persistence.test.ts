// IDOR (Insecure Direct Object Reference) test.
//
// Proves that Phase B's user-scoping fix on `getThread`, `listMessages`,
// and `deleteThread` actually blocks cross-user access. Two users
// (A and B) exist; A creates a thread; B attempts to read, list, and
// delete it — every B call must be a no-op.
//
// Uses PGlite (embedded Postgres) for the DB; the same migrations as
// production. Runs in Node, no Next.js context needed — these are pure
// persistence-layer functions.

import { vi } from 'vitest';

vi.hoisted(() => {
  // The IDOR test runs against PGlite via `getLocalDb()` below. But the
  // production code (`getThread`, `listMessages`, etc.) calls the
  // synchronous `getDb()` which throws without DATABASE_URL even when
  // PGlite is in use. Set a placeholder URL so the synchronous client
  // doesn't throw on first read; the mock below redirects the calls to
  // the PGlite instance for actual queries.
  process.env.DATABASE_URL = '';
  process.env.NEXTAUTH_SECRET='idor-t...hars';
  process.env.CRON_SECRET='idor-t...-min';
});

// Replace `getDb()` with a function that returns the active PGlite
// instance. The test sets up PGlite in `beforeAll`, then swaps the
// `getDb` symbol on every persistence call to read from the same DB.
vi.mock('@hamafx/db', async () => {
  const actual = await vi.importActual<typeof import('@hamafx/db')>('@hamafx/db');
  let activeDb: unknown = null;
  return {
    ...actual,
    getDb: () => {
      if (!activeDb) {
        throw new Error(
          'Test must call `setDb()` before invoking code that calls getDb()',
        );
      }
      return activeDb as ReturnType<typeof actual.getDb>;
    },
    // Expose a setter so beforeAll can register the PGlite instance.
    __esModule: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __setDb: (d: any) => {
      activeDb = d;
    },
  } as typeof actual;
});

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { getLocalDb, ensureMigrations } from '@hamafx/db/local-db';
import * as dbModule from '@hamafx/db';
import { schema } from '@hamafx/db';
import {
  createThread,
  deleteThread,
  getThread,
  listMessages,
} from '../src/persistence';

// The mock in the hoisted block exposes `__setDb` so we can register
// the active PGlite instance after beforeAll creates it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const setDb = (dbModule as any).__setDb as (d: any) => void;

let db: Awaited<ReturnType<typeof getLocalDb>>;

const USER_A = '00000000-0000-0000-0000-00000000000a';
const USER_B = '00000000-0000-0000-0000-00000000000b';

beforeAll(async () => {
  db = await getLocalDb();
  await ensureMigrations();
  // Register the PGlite instance so calls to `getDb()` from production
  // code (`persistence.ts`) hit the same DB as the test setup/teardown.
  setDb(db);
}, 30_000);

beforeEach(async () => {
  // Clean both users' threads + messages before each test.
  await db.delete(schema.chatMessages);
  await db.delete(schema.chatThreads);
  await db.delete(schema.userSettings);
  await db.delete(schema.users);
});

async function seedUser(id: string, email: string): Promise<void> {
  await db.insert(schema.users).values({ id, email, role: 'user' });
}

describe('Phase B IDOR fix — getThread / listMessages / deleteThread', () => {
  it('blocks User B from reading User A\'s thread (returns null, not 403)', async () => {
    await seedUser(USER_A, 'a@example.com');
    await seedUser(USER_B, 'b@example.com');
    const aThread = await createThread(USER_A);
    const aThreadId = aThread.id;

    // Sanity: A can read their own thread.
    const aReads = await getThread(USER_A, aThreadId);
    expect(aReads).not.toBeNull();
    expect(aReads?.id).toBe(aThreadId);

    // The fix: B asking for A's thread gets null.
    const bReads = await getThread(USER_B, aThreadId);
    expect(bReads).toBeNull();
  });

  it('blocks User B from listing User A\'s messages', async () => {
    await seedUser(USER_A, 'a@example.com');
    await seedUser(USER_B, 'b@example.com');
    const aThread = await createThread(USER_A);
    // Add a message to User A's thread. Use the PGlite instance directly
    // rather than getDb() — we're in test mode.
    await db.insert(schema.chatMessages).values({
      threadId: aThread.id,
      role: 'user',
      content: 'private A message',
      parts: [],
    });

    const aMessages = await listMessages(USER_A, aThread.id);
    expect(aMessages).toHaveLength(1);

    // B asking for A's thread's messages gets the empty list — never
    // sees A's private content.
    const bMessages = await listMessages(USER_B, aThread.id);
    expect(bMessages).toEqual([]);
  });

  it('User B cannot delete User A\'s thread (no-op, not an error)', async () => {
    await seedUser(USER_A, 'a@example.com');
    await seedUser(USER_B, 'b@example.com');
    const aThread = await createThread(USER_A);

    // B's delete call is a no-op — no exception, but A's thread survives.
    await expect(deleteThread(USER_B, aThread.id)).resolves.toBeUndefined();

    const stillThere = await getThread(USER_A, aThread.id);
    expect(stillThere).not.toBeNull();
    expect(stillThere?.id).toBe(aThread.id);

    // A can still delete their own thread.
    await deleteThread(USER_A, aThread.id);
    const goneNow = await getThread(USER_A, aThread.id);
    expect(goneNow).toBeNull();
  });

  it('a non-existent thread id returns null for any user', async () => {
    await seedUser(USER_A, 'a@example.com');
    const fake = '00000000-0000-0000-0000-deadbeef0000';
    const result = await getThread(USER_A, fake);
    expect(result).toBeNull();
  });
});
