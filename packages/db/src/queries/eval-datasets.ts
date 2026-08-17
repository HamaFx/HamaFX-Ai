/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

import { and, asc, desc, eq } from 'drizzle-orm';
import { getDb, schema } from '../client';
import type { EvalDatasetStatus } from '../schema/eval-datasets';

export interface RegisterEvalDatasetInput {
  version: string;
  contentSha256: string;
  recordCount: number;
  source: string;
  provenance: Record<string, unknown>;
  createdBy: string;
}

export async function registerEvalDataset(
  input: RegisterEvalDatasetInput,
): Promise<typeof schema.evalDatasets.$inferSelect | null> {
  const db = getDb();
  const [row] = await db
    .insert(schema.evalDatasets)
    .values({
      version: input.version,
      contentSha256: input.contentSha256,
      recordCount: input.recordCount,
      source: input.source,
      provenance: input.provenance,
      createdBy: input.createdBy,
    })
    .onConflictDoNothing({ target: schema.evalDatasets.version })
    .returning();
  return row ?? null;
}

export async function getEvalDataset(version: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.evalDatasets)
    .where(eq(schema.evalDatasets.version, version))
    .limit(1);
  return row ?? null;
}

export async function listEvalDatasets(
  limit = 50,
  offset = 0,
  status?: EvalDatasetStatus,
) {
  const db = getDb();
  return db
    .select()
    .from(schema.evalDatasets)
    .where(status ? eq(schema.evalDatasets.status, status) : undefined)
    .orderBy(desc(schema.evalDatasets.createdAt), asc(schema.evalDatasets.version))
    .limit(Math.min(100, Math.max(1, limit)))
    .offset(Math.max(0, offset));
}

export async function approveEvalDataset(input: {
  version: string;
  reviewerId: string;
  status: 'approved' | 'archived' | 'in_review' | 'draft';
}) {
  const db = getDb();
  const expectedCurrentStatus: Record<typeof input.status, EvalDatasetStatus> = {
    draft: 'draft',
    in_review: 'draft',
    approved: 'in_review',
    archived: 'approved',
  };
  const [row] = await db
    .update(schema.evalDatasets)
    .set({
      status: input.status,
      approvedBy: input.status === 'approved' ? input.reviewerId : null,
      approvedAt: input.status === 'approved' ? new Date() : null,
    })
    .where(and(
      eq(schema.evalDatasets.version, input.version),
      // Content-addressed versions are immutable; only lifecycle metadata may change.
      eq(schema.evalDatasets.status, expectedCurrentStatus[input.status]),
    ))
    .returning();
  return row ?? null;
}
