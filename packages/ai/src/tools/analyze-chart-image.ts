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

// Tool: analyze_chart_image.
//
// Re-runs the vision model on the most recent user-attached image with a
// structured-output schema, so the chat surface gets a typed
// `AnalyzeChartImageOutput` it can render via the bespoke chat part.
//
// Flow:
//   1. Locate the most recent user `chat_messages` row in the thread.
//   2. Walk its `parts` JSON for the latest `file` part with an `image/*`
//      mediaType.
//   3. Hash the bytes (sha256, hex prefix) for `sourceImageRef`.
//   4. Call `generateText` with `experimental_output` matching the schema.
//   5. Map the model's output through the schema's parser; on failure
//      emit a graceful "parse failed" placeholder.
//
// We pull the image via the existing `chat_messages` JSON rather than
// passing it through the tool's input — the AI SDK's structured-output
// path needs the image as a `file` content block on the model message,
// not as a tool input field.

import { createHash } from 'node:crypto';

import { getDb, schema } from '@hamafx/db';
import {
  AnalyzeChartImageInputSchema,
  AnalyzeChartImageOutputSchema,
  type AnalyzeChartImageOutput,
} from '@hamafx/shared';
import { generateText, type ModelMessage } from 'ai';
import { and, desc, eq } from 'drizzle-orm';
import type { z } from 'zod';

import { resolveModel, resolveVisionModel } from '../model';
import { maybeGetToolContext } from '../tool-context';

const InputSchema = AnalyzeChartImageInputSchema;

declare module '@hamafx/shared' {
  interface ToolIOMap {
    analyze_chart_image: { input: z.infer<typeof InputSchema> };
  }
}

interface ImagePartShape {
  type: 'file';
  mediaType?: unknown;
  url?: unknown;
  data?: unknown;
}

// Phase 3 hardening §1 — context flows in via AsyncLocalStorage now,
// not via a module-scoped setter. The legacy
// `setAnalyzeChartImageContext()` was removed.

const SYSTEM_PROMPT =
  'You are HamaFX-Ai analysing a chart screenshot. Return ONLY structured output matching the schema. Be terse — labels are short ("PDH", "weekly H", etc.); the observed paragraph is one to three sentences.';

const NO_CONTEXT: AnalyzeChartImageOutput = {
  symbol: null,
  tf: null,
  trend: null,
  bias: null,
  levels: [],
  observed: 'no chat context — call this tool from inside a chat turn',
  overlay: null,
  sourceImageRef: '',
};

const NO_IMAGE: AnalyzeChartImageOutput = {
  symbol: null,
  tf: null,
  trend: null,
  bias: null,
  levels: [],
  observed: 'no image attached',
  overlay: null,
  sourceImageRef: '',
};

export const analyzeChartImageTool = {
  description:
    "Run a structured technical readout on the most recent chart screenshot the user attached this turn. Returns a typed observation: identified symbol/timeframe, trend, bias, labelled price levels, and an English observation paragraph. Use whenever the user attaches an image and asks anything chart-shaped. Returns observed='no image attached' if there's no image to analyse.",
  inputSchema: InputSchema,
  execute: async (input: z.infer<typeof InputSchema>): Promise<AnalyzeChartImageOutput> => {
    const ctx = maybeGetToolContext();
    if (!ctx) return NO_CONTEXT;
    const { threadId, env } = ctx;

    const imagePart = await findLatestImagePart(threadId);
    if (!imagePart) return NO_IMAGE;

    const sourceImageRef = sourceRefFor(imagePart);

    const hint = [
      input.symbolHint ? `User hint: symbol=${input.symbolHint}.` : null,
      input.timeframeHint ? `User hint: timeframe=${input.timeframeHint}.` : null,
    ]
      .filter((x): x is string => x !== null)
      .join(' ');

    const messages: ModelMessage[] = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `${hint || 'Analyse this chart screenshot.'} Identify the symbol (XAUUSD/EURUSD/GBPUSD or null) and timeframe; list the visible price levels with short labels; describe the trend / bias; emit a one-paragraph observation.`,
          },
          asContentImagePart(imagePart),
        ],
      },
    ];

    try {
      // Phase D2 — the vision model now respects the user's pick from
      // /settings/models → Advanced. The resolver walks:
      //   1. user_settings.vision_model (if set + valid)
      //   2. spec.defaultModels.vision of the priority-ordered
      //      configured provider (with vision support)
      //   3. throws with a UI-friendly error
      // If the toolContext is missing (test/CI edge case), we fall
      // back to AI_DEFAULT_MODEL + the configured provider's default
      // vision so the tool still works in isolation.
      const ctx = maybeGetToolContext();
      let vision;
      if (ctx) {
        vision = resolveVisionModel(ctx.userSettings, env);
      } else {
        // No toolContext — use AI_DEFAULT_MODEL as a generic fallback
        // for the bare model id.
        const modelId = env.AI_DEFAULT_MODEL;
        vision = {
          model: resolveModel(modelId, env),
          modelId,
          providerId: 'google',
          bareModelId: modelId.replace(/^.*\//, ''),
        };
      }
      const { text } = await generateText({
        model: vision.model,
        system: SYSTEM_PROMPT,
        messages,
      });

      // Try strict parse first; if the model returned plain text, build a
      // graceful no-overlay shape with the text in `observed`.
      const parsed = tryParseStructured(text);
      if (parsed) return { ...parsed, sourceImageRef };
      return {
        symbol: null,
        tf: null,
        trend: null,
        bias: null,
        levels: [],
        observed: text.trim().slice(0, 1500),
        overlay: null,
        sourceImageRef,
      };
    } catch (err) {
      if (env.LOG_PROMPTS) console.warn('[analyze_chart_image] failed', err);
      return {
        symbol: null,
        tf: null,
        trend: null,
        bias: null,
        levels: [],
        observed: `vision model failed: ${err instanceof Error ? err.message : 'unknown'}`,
        overlay: null,
        sourceImageRef,
      };
    }
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function findLatestImagePart(threadId: string): Promise<ImagePartShape | null> {
  const rows = await getDb()
    .select({ parts: schema.chatMessages.parts })
    .from(schema.chatMessages)
    .where(and(eq(schema.chatMessages.threadId, threadId), eq(schema.chatMessages.role, 'user')))
    .orderBy(desc(schema.chatMessages.createdAt))
    .limit(1);
  const parts = rows[0]?.parts;
  if (!Array.isArray(parts)) return null;
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const p = parts[i];
    if (
      p !== null &&
      typeof p === 'object' &&
      'type' in (p as Record<string, unknown>) &&
      (p as { type: unknown }).type === 'file' &&
      typeof (p as { mediaType?: unknown }).mediaType === 'string' &&
      ((p as { mediaType: string }).mediaType.startsWith('image/'))
    ) {
      return p as ImagePartShape;
    }
  }
  return null;
}

function sourceRefFor(part: ImagePartShape): string {
  // Hash the `data` or `url` portion of the part — both are deterministic
  // per-image. We prefix with sha256: so future schemes can distinguish.
  const probe = (part.data ?? part.url ?? '').toString();
  if (!probe) return 'sha256:unknown';
  return `sha256:${createHash('sha256').update(probe).digest('hex').slice(0, 32)}`;
}

function asContentImagePart(part: ImagePartShape): { type: 'image'; image: string } {
  // The AI SDK accepts either a URL string (data URL or http/s) or a
  // Buffer/ArrayBuffer; we store data URLs in the parts JSON, so the
  // string form is the right shape here.
  const value = (part.data ?? part.url ?? '').toString();
  return { type: 'image', image: value };
}

function tryParseStructured(text: string): AnalyzeChartImageOutput | null {
  // Strip code fences and try to JSON-parse the first object literal.
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const result = AnalyzeChartImageOutputSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
