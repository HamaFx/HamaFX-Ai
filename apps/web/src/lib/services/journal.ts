// SPDX-License-Identifier: Apache-2.0

// PF-22 — Journal service layer.
//
// Separates business logic from HTTP handling. Route handlers (controllers)
// call these service functions instead of importing @hamafx/ai directly.
// The service layer handles:
//   - Input validation (re-exports Zod schemas)
//   - Authorization checks (scoped to userId)
//   - Error wrapping (converts domain errors to typed results)
//   - Response formatting (returns typed DTOs)
//
// Pattern: Service (PF-22). Each domain (journal, alerts, portfolio, etc.)
// gets its own service file. Controllers remain thin: parse request →
// call service → format Response.

import {
  computeStats,
  createEntry,
  deleteEntry,
  getEntry,
  listEntries,
  updateEntry,
} from '@hamafx/ai';
import type { JournalEntry } from '@hamafx/shared';
import { SymbolSchema, TradeOutcomeSchema, TradeSideSchema } from '@hamafx/shared';
import { z } from 'zod';

// ── Schemas (shared between controller and tests) ──────────────────────────

export const JournalCreateSchema = z.object({
  symbol: SymbolSchema,
  side: TradeSideSchema,
  openedAt: z.number().int(),
  entry: z.number(),
  stop: z.number().nullable().optional(),
  target: z.number().nullable().optional(),
  size: z.number().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  tags: z.array(z.string().max(40)).max(10).optional(),
  screenshotUrl: z.string().nullable().optional(),
});

export const JournalPatchSchema = z.object({
  closedAt: z.number().int().nullable().optional(),
  exit: z.number().nullable().optional(),
  stop: z.number().nullable().optional(),
  target: z.number().nullable().optional(),
  size: z.number().nullable().optional(),
  outcome: TradeOutcomeSchema.optional(),
  notes: z.string().max(5000).nullable().optional(),
  tags: z.array(z.string().max(40)).max(10).optional(),
});

export type JournalCreateInput = z.infer<typeof JournalCreateSchema>;
export type JournalPatchInput = z.infer<typeof JournalPatchSchema>;

// ── DTOs ────────────────────────────────────────────────────────────────────

export interface EntryDTO {
  id: string;
  symbol: string;
  side: string;
  entry: number;
  exit: number | null;
  stop: number | null;
  target: number | null;
  size: number | null;
  notes: string | null;
  tags: string[];
  screenshotUrl: string | null;
  attachments: string[];
  openedAt: number;
  closedAt: number | null;
  outcome: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── DTO mappers ─────────────────────────────────────────────────────────────

/** Map domain JournalEntry → EntryDTO (number timestamps → Date objects). */
function toEntryDTO(e: JournalEntry): EntryDTO {
  return {
    id: e.id,
    symbol: e.symbol,
    side: e.side,
    entry: e.entry,
    exit: e.exit,
    stop: e.stop,
    target: e.target,
    size: e.size,
    notes: e.notes,
    tags: e.tags,
    screenshotUrl: e.screenshotUrl ?? null,
    attachments: e.attachments ?? [],
    openedAt: e.openedAt,
    closedAt: e.closedAt,
    outcome: e.outcome,
    createdAt: new Date(e.createdAt),
    updatedAt: new Date(e.updatedAt),
  };
}

// ── Service functions ─────────────────────────────────────────────────────

export async function listJournalEntriesService(
  userId: string,
  opts?: { symbol?: string },
): Promise<{ entries: EntryDTO[]; stats: Record<string, unknown> }> {
  const [entries, stats] = await Promise.all([
    listEntries(userId, opts),
    computeStats(userId),
  ]);
  return { entries: entries.map(toEntryDTO), stats };
}

export async function createJournalEntryService(
  userId: string,
  input: JournalCreateInput,
): Promise<EntryDTO> {
  const entry = await createEntry({
    userId,
    symbol: input.symbol,
    side: input.side,
    openedAt: input.openedAt,
    entry: input.entry,
    stop: input.stop ?? null,
    target: input.target ?? null,
    size: input.size ?? null,
    notes: input.notes ?? null,
    tags: input.tags ?? [],
    screenshotUrl: input.screenshotUrl ?? null,
  });
  return toEntryDTO(entry);
}

export async function getJournalEntryService(
  userId: string,
  id: string,
): Promise<EntryDTO | null> {
  const entry = await getEntry(userId, id);
  return entry ? toEntryDTO(entry) : null;
}

export async function updateJournalEntryService(
  userId: string,
  id: string,
  input: JournalPatchInput,
): Promise<EntryDTO | null> {
  const entry = await updateEntry(userId, id, input);
  return entry ? toEntryDTO(entry) : null;
}

export async function deleteJournalEntryService(
  userId: string,
  id: string,
): Promise<boolean> {
  return deleteEntry(userId, id);
}
