import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LibSQLStore } from '@mastra/libsql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createKestrelMastra,
  initializeKestrelMastra,
} from '../src/mastra-v2';
import {
  createMutationWorkflow,
  runMutationWorkflow,
} from '../src/mastra-v2/workflows/mutation';
import {
  issueMutationConfirmationToken,
  storedConfirmationForToken,
  verifyMutationConfirmationToken,
  type StoredMutationConfirmation,
} from '../src/mastra/mutation-policy';
import type { MutationInput } from '../src/mastra-v2/workflows/mutation';

const SECRET = 'x'.repeat(64);

function setMutationsEnabled(value: string): void {
  process.env.ENABLE_MASTRA_MUTATIONS = value;
}

const sampleInput = (): MutationInput => ({
  kind: 'set_alert',
  rule: {
    type: 'priceCross',
    symbol: 'XAUUSD',
    level: 2350,
    direction: 'above',
  },
  channels: ['email'],
  note: 'test alert',
  snoozeHours: 1,
});

describe('mutation confirmation tokens', () => {
  it('issues a token with an expiry and computes a persisted digest', () => {
    const now = 1_000_000;
    const issued = issueMutationConfirmationToken({
      mutation: 'set_alert',
      userId: 'u1',
      secret: SECRET,
      now,
      ttlMs: 60_000,
    });
    expect(issued.token).toHaveLength(43); // 32 random bytes, base64url
    expect(issued.expiresAt).toBe(now + 60_000);

    const stored = storedConfirmationForToken(issued.token, {
      mutation: 'set_alert',
      userId: 'u1',
      expiresAt: issued.expiresAt,
      secret: SECRET,
    });
    expect(stored.digest.length).toBe(64); // sha256 hex
  });

  it('verifies the correct token within its window', () => {
    const now = 1_000_000;
    const issued = issueMutationConfirmationToken({
      mutation: 'set_alert',
      userId: 'u1',
      secret: SECRET,
      now,
      ttlMs: 60_000,
    });
    const stored = storedConfirmationForToken(issued.token, {
      mutation: 'set_alert',
      userId: 'u1',
      expiresAt: issued.expiresAt,
      secret: SECRET,
    });
    expect(
      verifyMutationConfirmationToken({
        token: issued.token,
        stored,
        mutation: 'set_alert',
        userId: 'u1',
        secret: SECRET,
        now: now + 30_000,
      }),
    ).toBe(true);
  });

  it('rejects an expired token', () => {
    const now = 1_000_000;
    const issued = issueMutationConfirmationToken({
      mutation: 'set_alert',
      userId: 'u1',
      secret: SECRET,
      now,
      ttlMs: 60_000,
    });
    const stored = storedConfirmationForToken(issued.token, {
      mutation: 'set_alert',
      userId: 'u1',
      expiresAt: issued.expiresAt,
      secret: SECRET,
    });
    expect(
      verifyMutationConfirmationToken({
        token: issued.token,
        stored,
        mutation: 'set_alert',
        userId: 'u1',
        secret: SECRET,
        now: issued.expiresAt + 1,
      }),
    ).toBe(false);
  });

  it('rejects a wrong token and a token minted for another user', () => {
    const now = 1_000_000;
    const issued = issueMutationConfirmationToken({
      mutation: 'set_alert',
      userId: 'u1',
      secret: SECRET,
      now,
      ttlMs: 60_000,
    });
    const stored = storedConfirmationForToken(issued.token, {
      mutation: 'set_alert',
      userId: 'u1',
      expiresAt: issued.expiresAt,
      secret: SECRET,
    });
    expect(
      verifyMutationConfirmationToken({
        token: 'wrong-token',
        stored,
        mutation: 'set_alert',
        userId: 'u1',
        secret: SECRET,
        now,
      }),
    ).toBe(false);
    // Cross-user replay: u2's run mints its OWN token and stores its digest.
    // u1's token presented against u2's stored digest fails because the
    // digests were computed from different tokens.
    const u2Issued = issueMutationConfirmationToken({
      mutation: 'set_alert',
      userId: 'u2',
      secret: SECRET,
      now,
      ttlMs: 60_000,
    });
    const u2Stored = storedConfirmationForToken(u2Issued.token, {
      mutation: 'set_alert',
      userId: 'u2',
      expiresAt: u2Issued.expiresAt,
      secret: SECRET,
    });
    expect(
      verifyMutationConfirmationToken({
        token: issued.token, // u1's token, not u2's
        stored: u2Stored,
        mutation: 'set_alert',
        userId: 'u2',
        secret: SECRET,
        now,
      }),
    ).toBe(false);
  });
});

describe('mutation workflow', () => {
  let dbFile: string;
  let executed: Array<{ input: MutationInput; runId: string }>;
  let audited: Array<Record<string, unknown>>;
  let mastraInstance: ReturnType<typeof createKestrelMastra>['instance'];

  beforeEach(async () => {
    dbFile = join(tmpdir(), `kestrel-mutation-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    executed = [];
    audited = [];
    setMutationsEnabled('true');
    const storage = new LibSQLStore({ id: 'test', url: `file:${dbFile}` });
    const built = createKestrelMastra({ storage });
    await initializeKestrelMastra({ instance: built.instance, storageKind: 'libsql' });
    mastraInstance = built.instance;
  });

  afterEach(() => {
    rmSync(dbFile, { recursive: true, force: true });
    vi.restoreAllMocks();
    setMutationsEnabled('false');
  });

  function buildWorkflow(overrides: { threadId?: string; now?: () => number } = {}) {
    const deps = {
      mutation: 'set_alert' as const,
      userId: 'u1',
      threadId: overrides.threadId ?? 't1',
      execute: async (input: MutationInput) => {
        executed.push({ input, runId: 'run-ref' });
        return { id: 'alert-1' };
      },
      writeAudit: async (userId: string, action: string, metadata: Record<string, unknown>) => {
        audited.push({ userId, action, metadata });
      },
      mastra: mastraInstance,
      secret: SECRET,
    };
    if (overrides.now) return createMutationWorkflow({ ...deps, now: overrides.now });
    return createMutationWorkflow(deps);
  }

  it('drafts → suspends with a confirmation payload (no write executes)', async () => {
    const workflow = buildWorkflow();
    const result = await runMutationWorkflow(workflow, { input: sampleInput() });

    expect(result.status).toBe('suspended');
    expect(result.runId.length).toBeGreaterThan(0);
    expect(result.suspendPayload).toBeDefined();
    expect(result.suspendPayload!.mutation).toBe('set_alert');
    expect(result.suspendPayload!.summary).toContain('XAUUSD');
    expect(result.suspendPayload!.expiresAt).toBeGreaterThan(Date.now());
    expect(executed).toHaveLength(0);
    expect(audited).toHaveLength(0);
  });

  it('resumes with the correct token → executes the write + audit exactly once', async () => {
    const workflow = buildWorkflow();
    const draft = await runMutationWorkflow(workflow, { input: sampleInput() });
    expect(draft.status).toBe('suspended');
    const runId = draft.runId;
    const token = draft.suspendPayload!.confirmationToken;
    expect(token.length).toBeGreaterThan(0);

    // Recreate the workflow against the same storage (fresh factory like the
    // confirm route) and resume with the token from the draft payload.
    const confirmWorkflow = buildWorkflow();
    const result = await runMutationWorkflow(confirmWorkflow, {
      runId,
      resumeData: { confirmationToken: token },
    });

    expect(result.status).toBe('executed');
    expect(result.output?.status).toBe('executed');
    expect(result.output?.resultId).toBe('alert-1');
    expect(executed).toHaveLength(1);
    expect(audited).toHaveLength(1);
    expect(audited[0]?.action).toBe('mutation.set_alert.executed');
  });

  it('rejects a resume with a wrong token (no write, no audit)', async () => {
    const workflow = buildWorkflow();
    const draft = await runMutationWorkflow(workflow, { input: sampleInput() });
    expect(draft.status).toBe('suspended');

    const confirmWorkflow = buildWorkflow();
    await expect(
      runMutationWorkflow(confirmWorkflow, {
        runId: draft.runId,
        resumeData: { confirmationToken: 'attacker-token' },
      }),
    ).rejects.toThrow(/token is invalid/i);
    expect(executed).toHaveLength(0);
    expect(audited).toHaveLength(0);
  });

  it('blocks the draft when the mutation flag is disabled', async () => {
    setMutationsEnabled('false');
    const workflow = buildWorkflow();
    await expect(runMutationWorkflow(workflow, { input: sampleInput() })).rejects.toThrow(
      /disabled by policy/i,
    );
    expect(executed).toHaveLength(0);
  });
});

describe('mutation policy — stored confirmation type', () => {
  it('StoredMutationConfirmation shape is usable', () => {
    const stored: StoredMutationConfirmation = { digest: 'a'.repeat(64), expiresAt: 123 };
    expect(stored.expiresAt).toBe(123);
  });
});
