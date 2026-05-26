// Briefings — the cron-emitted assistant messages that populate the
// reserved `Briefings_Thread` (see packages/ai/src/briefings/).
//
// We persist the briefing context in `chat_messages.parts` as a typed
// part shape so the chat UI can recognize it and render an event link
// alongside the standard text part. The lookup table
// `briefings_emitted` enforces idempotency at the (eventId, kind) key.

import { z } from 'zod';

export const BriefingKindSchema = z.union([
  z.literal('pre'),
  z.literal('post'),
  z.literal('weekly_review'),
]);
export type BriefingKind = z.infer<typeof BriefingKindSchema>;

/**
 * Custom UIMessage part embedded in `chat_messages.parts` alongside the
 * standard `text` part for a briefing message. Lets the chat UI surface a
 * "📅 briefing" badge and link to the source event without parsing the body.
 */
export const BriefingMessagePartSchema = z.object({
  type: z.literal('briefing'),
  /** Source event id for pre/post; null for weekly_review. */
  eventId: z.string().nullable(),
  kind: BriefingKindSchema,
  /** One-line summary suitable for thread-list previews. */
  summary: z.string(),
});
export type BriefingMessagePart = z.infer<typeof BriefingMessagePartSchema>;
