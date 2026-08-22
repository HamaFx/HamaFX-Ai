// SPDX-License-Identifier: Apache-2.0

// Phase 7 — mutation confirmation.
//
// POST /api/chat/mutations/confirm
//
// Body: { mutation: MutationKind, runId: string, confirmationToken: string }
//
// Resolves a suspended mutation workflow run. The draft step's resume branch
// re-validates the single-use token (timing-safe digest + expiry) and the
// server-side mutation policy BEFORE any write executes; the confirmed input
// then flows to the execute step, which performs the audited Drizzle write.
// The run leaves the suspended state after confirmation, so the same token
// cannot be replayed.
//
// The executor + audit writer are wired here (composition edge, DIP-1): the
// web route owns the Drizzle connection and calls the existing @kestrel/db
// queries (createAlert / createJournalEntry) plus createAuditLog.

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { appendAssistantMessage } from '@kestrel/ai';
import {
  assertMastraMutationAllowed,
  createMutationWorkflow,
  getKestrelMastra,
  MutationKindSchema,
  runMutationWorkflow,
  type MutationExecutor,
} from '@kestrel/ai/mastra';
import {
  createAlert,
  createAuditLog,
  createJournalEntry,
  getDb,
  schema,
} from '@kestrel/db';

import { withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ConfirmBodySchema = z.object({
  mutation: MutationKindSchema,
  runId: z.string().min(1),
  threadId: z.string().uuid(),
  confirmationToken: z.string().min(1),
});

/** Build the executor for a mutation kind, scoped to the run's owner. */
function executorFor(kind: z.infer<typeof MutationKindSchema>, userId: string): MutationExecutor {
  return async (input) => {
    switch (kind) {
      case 'set_alert': {
        if (input.kind !== 'set_alert') throw new Error('mutation kind mismatch');
        const row = await createAlert({
          userId,
          rule: input.rule,
          channels: input.channels ?? ['email'],
          note: input.note ?? null,
          snoozeHours: input.snoozeHours ?? 0,
        });
        return { id: row.id };
      }
      case 'log_journal': {
        if (input.kind !== 'log_journal') throw new Error('mutation kind mismatch');
        const row = await createJournalEntry({
          userId,
          symbol: input.symbol,
          side: input.side,
          openedAt: new Date(input.openedAt),
          entry: input.entry,
          stop: input.stop ?? null,
          target: input.target ?? null,
          exit: input.exit ?? null,
          size: input.size ?? null,
          outcome: input.outcome ?? 'open',
          rMultiple: input.rMultiple ?? null,
          notes: input.notes ?? null,
          tags: input.tags ?? [],
        });
        return { id: row.id };
      }
      case 'share_snapshot': {
        if (input.kind !== 'share_snapshot') throw new Error('mutation kind mismatch');
        // shared_snapshots has no dedicated query helper yet; the schema is
        // exported from @kestrel/db and the write is a plain insert.
        const db = getDb();
        const rows = await db
          .insert(schema.sharedSnapshots)
          .values({
            userId,
            title: input.title,
            body: input.body,
            symbol: input.symbol ?? null,
            tf: input.tf ?? null,
            expiresAt: new Date(Date.now() + (input.ttlMinutes ?? 7 * 24 * 60) * 60_000),
          })
          .returning({ id: schema.sharedSnapshots.id });
        return { id: rows[0]!.id };
      }
      case 'run_system_action': {
        if (input.kind !== 'run_system_action') throw new Error('mutation kind mismatch');
        // Operator actions have no business row; the audit log IS the write.
        return { id: `system:${input.action}` };
      }
    }
  };
}

export const POST = withAuth(async (req: Request, { user }) => {
  const parsed = ConfirmBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Invalid confirmation body', details: parsed.error.issues } },
      { status: 400 },
    );
  }
  const { mutation, runId, threadId, confirmationToken } = parsed.data;

  // The mutation capability remains fail-closed unless the operator enables
  // it explicitly — the same gate the draft path applies.
  assertMastraMutationAllowed({
    mutation,
    userId: user.userId,
    threadId,
    confirmed: true,
    approvalId: runId,
  });

  // Ownership: the run's resourceId is the userId set at draft time. Verify
  // before resuming so one user cannot confirm another user's mutation.
  const owner = await readRunOwner(runId, mutation);
  if (owner === null) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Mutation run not found' } },
      { status: 404 },
    );
  }
  if (owner !== user.userId) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Not allowed to confirm this mutation' } },
      { status: 403 },
    );
  }

  const mastra = getKestrelMastra().instance;
  const workflow = createMutationWorkflow({
    mutation,
    userId: user.userId,
    threadId,
    execute: executorFor(mutation, user.userId),
    writeAudit: (userId, action, metadata) => createAuditLog(userId, action, metadata),
    mastra,
  });

  const result = await runMutationWorkflow(workflow, {
    runId,
    resumeData: { confirmationToken },
    ...(threadId ? { threadId } : {}),
  });

  if (result.status === 'executed') {
    // Persist a result message so the mutation is visible in thread history.
    const summary = result.output?.summary ?? `${mutation.replaceAll('_', ' ')} executed`;
    await appendAssistantMessage(
      user.userId,
      threadId,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        parts: [{ type: 'text', text: `✅ ${summary}` }],
      },
      { idempotencyKey: `mutation-confirm:${runId}:assistant` },
    );
    return NextResponse.json({
      ok: true,
      status: 'executed',
      runId,
      output: result.output,
    });
  }
  return NextResponse.json(
    { error: { code: 'CONFLICT', message: 'Mutation run is not in a confirmable state' } },
    { status: 409 },
  );
});

/** Read the run's resourceId (owner) from the Mastra workflow snapshot. */
async function readRunOwner(
  runId: string,
  mutation: z.infer<typeof MutationKindSchema>,
): Promise<string | null> {
  const storage = getKestrelMastra().instance.getStorage() as {
    getWorkflowRunById?: (args: { runId: string; workflowName?: string }) => Promise<{ resourceId?: string } | null>;
  } | null;
  if (!storage?.getWorkflowRunById) return null;
  const run = await storage.getWorkflowRunById({ runId, workflowName: `mutation-${mutation}` });
  return run?.resourceId ?? null;
}
