/**
 * LLM-based extraction of a structured mutation input from free chat text.
 *
 * The classifier (mutation-detect.ts) picks the kind; this module runs a
 * bounded structured generation through the Mastra text runner with a
 * per-kind extraction schema, then validates/normalizes the result into the
 * workflow's `MutationInput` shape (defaults applied, garbage rejected).
 *
 * Pure helpers (`mutationExtractionSchemaFor`, `buildMutationInput`) are
 * exported so unit tests can cover validation/normalization without an LLM.
 */

import { AlertChannelSchema, AlertRuleSchema } from '@kestrel/shared';
import type { LanguageModel } from 'ai';
import { z } from 'zod';

import {
  MutationInputSchema,
  type MutationInput,
  type MutationKind,
} from '../mastra-v2/workflows/mutation';
import { runMastraStructured } from './text-runner';

export class MutationExtractionError extends Error {
  constructor(
    message: string,
    readonly kind: MutationKind,
  ) {
    super(message);
    this.name = 'MutationExtractionError';
  }
}

const ALERT_EXTRACTION_SCHEMA = z.object({
  rule: AlertRuleSchema.describe(
    'The alert condition as a structured rule (priceCross / candleClose / indicatorCross)',
  ),
  channels: z.array(AlertChannelSchema).default(['email']),
  note: z.string().nullish(),
});
const JOURNAL_EXTRACTION_SCHEMA = z.object({
  symbol: z.string().min(1).describe('The trading symbol, e.g. XAUUSD'),
  side: z.enum(['long', 'short']),
  entry: z.number(),
  stop: z.number().nullish(),
  target: z.number().nullish(),
  exit: z.number().nullish(),
  size: z.number().nullish(),
  outcome: z.enum(['win', 'loss', 'breakeven', 'open']).default('open'),
  rMultiple: z.number().nullish(),
  notes: z.string().nullish(),
  tags: z.array(z.string()).default([]),
});
const SHARE_EXTRACTION_SCHEMA = z.object({
  title: z.string().min(2).describe('Short title for the shared snapshot'),
  body: z.string().min(2).describe('The analysis text to share'),
  symbol: z.string().nullish(),
  tf: z.string().nullish(),
});
const ACTION_EXTRACTION_SCHEMA = z.object({
  action: z.string().min(2).describe('The operator action to run'),
  params: z.record(z.unknown()).default({}),
});

export const MUTATION_EXTRACTION_SCHEMAS: Record<
  MutationKind,
  | typeof ALERT_EXTRACTION_SCHEMA
  | typeof JOURNAL_EXTRACTION_SCHEMA
  | typeof SHARE_EXTRACTION_SCHEMA
  | typeof ACTION_EXTRACTION_SCHEMA
> = {
  set_alert: ALERT_EXTRACTION_SCHEMA,
  log_journal: JOURNAL_EXTRACTION_SCHEMA,
  share_snapshot: SHARE_EXTRACTION_SCHEMA,
  run_system_action: ACTION_EXTRACTION_SCHEMA,
};

export function mutationExtractionSchemaFor(kind: MutationKind): z.ZodType {
  return MUTATION_EXTRACTION_SCHEMAS[kind];
}

type AlertExtraction = z.output<typeof ALERT_EXTRACTION_SCHEMA>;
type JournalExtraction = z.output<typeof JOURNAL_EXTRACTION_SCHEMA>;
type ShareExtraction = z.output<typeof SHARE_EXTRACTION_SCHEMA>;
type ActionExtraction = z.output<typeof ACTION_EXTRACTION_SCHEMA>;

const SYSTEM_PROMPTS: Record<MutationKind, string> = {
  set_alert:
    'Extract the alert request into structured fields. If the user did not specify channels, use ["email"]. Reply only with JSON matching the schema.',
  log_journal:
    'Extract the journal entry into structured fields. If the user did not specify an outcome, use "open". If a price is missing, omit it (null). Reply only with JSON matching the schema.',
  share_snapshot:
    'Extract the share request into a title and body. The body should be a faithful summary of the analysis the user wants to share. Reply only with JSON matching the schema.',
  run_system_action:
    'Extract the operator system action into structured fields. Reply only with JSON matching the schema.',
};

export interface ExtractMutationInputArgs {
  kind: MutationKind;
  text: string;
  model: LanguageModel;
  userId?: string;
  threadId?: string;
  signal?: AbortSignal;
}

/**
 * Normalize a per-kind extraction result into a validated `MutationInput`,
 * applying defaults. Throws `MutationExtractionError` on shape violations.
 * Pure (no I/O) — exported for tests.
 */
export function buildMutationInput(kind: MutationKind, raw: unknown): MutationInput {
  let input: MutationInput;
  switch (kind) {
    case 'set_alert': {
      const e = parseStrict<AlertExtraction>(ALERT_EXTRACTION_SCHEMA, raw, kind);
      input = {
        kind,
        rule: e.rule,
        channels: e.channels,
        ...(e.note ? { note: e.note } : {}),
      };
      break;
    }
    case 'log_journal': {
      const e = parseStrict<JournalExtraction>(JOURNAL_EXTRACTION_SCHEMA, raw, kind);
      input = {
        kind,
        symbol: normalizeSymbol(e.symbol),
        side: e.side,
        openedAt: Date.now(),
        entry: e.entry,
        ...(e.stop != null ? { stop: e.stop } : {}),
        ...(e.target != null ? { target: e.target } : {}),
        ...(e.exit != null ? { exit: e.exit } : {}),
        ...(e.size != null ? { size: e.size } : {}),
        outcome: e.outcome,
        ...(e.rMultiple != null ? { rMultiple: e.rMultiple } : {}),
        ...(e.notes ? { notes: e.notes } : {}),
        ...(e.tags.length > 0 ? { tags: e.tags } : {}),
      };
      break;
    }
    case 'share_snapshot': {
      const e = parseStrict<ShareExtraction>(SHARE_EXTRACTION_SCHEMA, raw, kind);
      input = {
        kind,
        title: e.title,
        body: e.body,
        ...(e.symbol ? { symbol: normalizeSymbol(e.symbol) } : {}),
        ...(e.tf ? { tf: e.tf } : {}),
      };
      break;
    }
    case 'run_system_action': {
      const e = parseStrict<ActionExtraction>(ACTION_EXTRACTION_SCHEMA, raw, kind);
      input = { kind, action: e.action, params: e.params };
      break;
    }
  }

  const validated = MutationInputSchema.safeParse(input);
  if (!validated.success) {
    throw new MutationExtractionError(
      `Could not build a valid ${kind} input from your request.`,
      kind,
    );
  }
  return validated.data;
}

function parseStrict<T>(schema: z.ZodTypeAny, raw: unknown, kind: MutationKind): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new MutationExtractionError(
      `Could not understand the ${kind} request (extraction failed validation).`,
      kind,
    );
  }
  return parsed.data as T;
}

/** Uppercase symbols (XAUUSD) so extraction variance cannot poison writes. */
function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

/**
 * Run the extraction generation. Throws `MutationExtractionError` when the
 * model cannot produce a valid structured input.
 */
export async function extractMutationInput(
  args: ExtractMutationInputArgs,
): Promise<MutationInput> {
  const { kind, text } = args;
  try {
    const result = await runMastraStructured({
      task: `mutation-extract-${kind}`,
      model: args.model,
      system: SYSTEM_PROMPTS[kind],
      prompt: text.slice(0, 4000),
      schema: mutationExtractionSchemaFor(kind),
      ...(args.userId ? { userId: args.userId } : {}),
      ...(args.threadId ? { threadId: args.threadId } : {}),
      ...(args.signal ? { signal: args.signal } : {}),
      maxOutputTokens: 600,
    });
    return buildMutationInput(kind, result.object);
  } catch (error) {
    if (error instanceof MutationExtractionError) throw error;
    throw new MutationExtractionError(
      `Could not extract the ${kind} request (${error instanceof Error ? error.message : String(error)}).`,
      kind,
    );
  }
}
