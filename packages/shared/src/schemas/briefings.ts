/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
