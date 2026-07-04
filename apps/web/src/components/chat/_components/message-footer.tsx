'use client';

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

// Phase 1.3 — Trust layer for assistant messages.
//
// A compact footer below the assistant bubble showing the model that
// produced the answer, the timestamp, and an expandable details section
// (token usage, cost, citations). Everything is guarded with optional
// chaining — metadata is only present on finished assistant turns.

import type { UIMessage } from 'ai';
import {IconRobot, IconChevronDown, IconChevronRight, IconLink as LinkIcon} from '@tabler/icons-react';
import { useState } from 'react';

interface MessageFooterProps {
  message: UIMessage;
}

interface UsageMeta {
  promptTokens: number;
  completionTokens: number;
  cost?: number;
}

interface Citation {
  url: string;
  title?: string;
}

/**
 * Parse a model id into a short, human-friendly label.
 *   `google-vertex/gemini-2.5-flash` → "Gemini 2.5 Flash"
 *   `anthropic/claude-sonnet-4`       → "Claude Sonnet 4"
 *   `openai/gpt-4o`                   → "Gpt 4o"
 */
export function formatModelLabel(model: string): string {
  // Drop the provider prefix if present.
  const tail = model.includes('/') ? model.slice(model.lastIndexOf('/') + 1) : model;
  // Split on dashes/underscores into words, title-case, rejoin.
  const words = tail.split(/[-_]/).filter(Boolean);
  return words
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

export function MessageFooter({ message }: MessageFooterProps) {
  const [open, setOpen] = useState(false);

  const meta = message.metadata as
    | { model?: string; usage?: UsageMeta; createdAt?: string | number | Date }
    | undefined;
  const model = meta?.model;
  const usage = meta?.usage;

  const citations = extractCitations(message);

  // Nothing to show if there's no model and no usage and no citations.
  if (!model && !usage && citations.length === 0) return null;

  const rawTime = meta?.createdAt ?? (message as unknown as { createdAt?: string | number | Date }).createdAt;
  const time =
    rawTime instanceof Date
      ? rawTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      : typeof rawTime === 'number' || typeof rawTime === 'string'
        ? new Date(rawTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
        : null;

  return (
    <div className="flex flex-col gap-0">
      <div className="flex items-center gap-2 text-caption text-fg-subtle mt-1.5">
        {model ? (
          <span className="inline-flex items-center gap-1">
            <IconRobot className="size-3" />
            {formatModelLabel(model)}
          </span>
        ) : null}
        {time ? <span>· {time}</span> : null}
        {(usage || citations.length > 0) ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="ml-auto inline-flex items-center gap-0.5 text-fg-subtle hover:text-fg transition-colors"
          >
            {open ? <IconChevronDown className="size-3" /> : <IconChevronRight className="size-3" />}
            details
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="border-t border-border mt-2 pt-2 flex flex-col gap-1.5 text-caption">
          {usage ? (
            <div className="flex justify-between">
              <span className="text-fg-subtle">Tokens</span>
              <span className="text-fg-muted tabular-nums">
                {usage.promptTokens} in · {usage.completionTokens} out
              </span>
            </div>
          ) : null}
          {usage?.cost !== undefined ? (
            <div className="flex justify-between">
              <span className="text-fg-subtle">Est. cost</span>
              <span className="text-fg-muted tabular-nums">${usage.cost.toFixed(4)}</span>
            </div>
          ) : null}
          {citations.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-fg-subtle">Sources</span>
              {citations.map((c, i) => (
                <a
                  key={i}
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-fg hover:underline flex items-center gap-1"
                >
                  <LinkIcon className="size-3 shrink-0" />
                  <span className="truncate">{c.title || c.url}</span>
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Extract citation links from message parts. The AI SDK emits source parts
 * (`source-url` / `source-document`) and we also accept a `tool-cite_sources`
 * custom part. Defensive — malformed parts are skipped.
 */
function extractCitations(message: UIMessage): Citation[] {
  const out: Citation[] = [];
  for (const part of message.parts) {
    if (!part || typeof part !== 'object') continue;
    const t = (part as { type?: string }).type;
    if (t === 'source-url' || t === 'source-document') {
      const url = (part as { url?: string }).url;
      const title = (part as { title?: string }).title;
      if (url) out.push({ url, ...(title ? { title } : {}) });
    } else if (t === 'tool-cite_sources') {
      const sources = (part as { output?: unknown }).output;
      if (Array.isArray(sources)) {
        for (const s of sources) {
          if (s && typeof s === 'object') {
            const url = (s as { url?: string }).url;
            const title = (s as { title?: string }).title;
            if (url) out.push({ url, ...(title ? { title } : {}) });
          }
        }
      }
    }
  }
  return out;
}