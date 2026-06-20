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

// One chat message. Iterates over UIMessage parts and dispatches each to
// its dedicated renderer.
//
// Action row appears on hover (desktop) / focus (keyboard) at the bottom-
// right of the bubble:
//   - Copy (always, when the message has plain text)
//   - Regenerate (only for the last assistant message, drives `regenerate()`)
//
// Both controls are 32×32 pills that stack horizontally so they don't
// require absolute layout gymnastics on narrow viewports.
//
// Phase 7c: a system-role message that carries a `data-plan` part is
// rendered as a planner card (collapsible "Thinking" pill) at the chat-
// thread top-level. System messages with only `text` (e.g. rolling-summary
// system notes used internally) are NOT rendered to the user — they're
// internal context.

import type { UIMessage } from 'ai';
import { Check, ChevronDown, Copy, Pencil, RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';

import { CitationWarningPartView } from './parts/citation-warning';
import { ChatToolPart, type ToolPartState } from './parts/registry';
import { PlanPart } from './parts/plan';
import { TextPart } from './parts/text';

interface MessageProps {
  message: UIMessage;
  onCopy?: (text: string) => void;
  onRegenerate?: (opts?: { modelOverride?: string }) => void;
  onEdit?: (messageId: string, newText: string) => void;
}

/**
 * Shortcut model ids exposed in the "Regenerate with…" menu. Picked to
 * line up with the per-domain defaults from `routeTurn` so the user can
 * test all three tiers from a single click. Keeping this list short on
 * purpose — full model selection lives in /settings.
 */
const REGEN_MODELS: Array<{ id: string; label: string; tier: 'fast' | 'pro' }> = [
  { id: 'google-vertex/gemini-2.5-flash-lite', label: 'Lite (cheapest)', tier: 'fast' },
  { id: 'google-vertex/gemini-2.5-flash', label: 'Flash (default)', tier: 'fast' },
  { id: 'google-vertex/gemini-2.5-pro', label: 'Pro (deep)', tier: 'pro' },
];

export function Message({ message, onCopy, onRegenerate, onEdit }: MessageProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const plainText = extractText(message);
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(plainText);

  // Phase 7c — system messages: render planner cards but suppress
  // anything else (rolling-summary notes are internal context only).
  if (isSystem) {
    const planPart = (message.parts ?? []).find(
      (p) =>
        p !== null &&
        typeof p === 'object' &&
        (p as { type?: string }).type === 'data-plan',
    );
    if (planPart) {
      return (
        <div className="flex w-full justify-start">
          <div className="w-full max-w-[88%]">
            <PlanPart
              plan={planPart as unknown as Parameters<typeof PlanPart>[0]['plan']}
            />
          </div>
        </div>
      );
    }
    return null;
  }

  const hasActions = (!isUser && (plainText.length > 0 || onRegenerate)) || (isUser && onEdit);

  function copy() {
    if (!plainText) return;
    void navigator.clipboard.writeText(plainText);
    onCopy?.(plainText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  if (isUser && isEditing) {
    return (
      <div className="mb-2 mt-1 flex w-full justify-end">
        <div className="flex w-full max-w-[88%] flex-col gap-2 rounded-3xl rounded-br-md border border-brand/50 bg-bg-elev-1/80 p-3 shadow-md focus-within:ring-2 focus-within:ring-brand">
          <textarea
            className="w-full resize-none bg-transparent text-sm text-fg outline-none [field-sizing:content]"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            autoFocus
          />
          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-full bg-bg-elev-2 px-3 py-1 text-xs text-fg-muted transition-colors hover:text-fg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                onEdit?.(message.id, editValue);
              }}
              className="rounded-full bg-brand px-3 py-1 text-xs text-brand-fg transition-colors hover:brightness-110"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('group flex w-full flex-col gap-2', isUser ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'relative flex max-w-[88%] flex-col gap-2 px-4 py-3',
          isUser
            ? 'text-brand-fg rounded-3xl rounded-br-md font-medium shadow-sm'
            : 'glass-subtle text-fg rounded-3xl rounded-bl-md',
        )}
        style={
          isUser
            ? {
                backgroundImage: 'var(--gradient-brand)',
                boxShadow:
                  'inset 0 1px 0 0 oklch(100% 0 0 / 0.15), 0 4px 12px -4px oklch(78% 0.16 78 / 0.4)',
              }
            : undefined
        }
      >
        {message.parts.map((part, idx) => renderPart(part, idx, message.role))}
      </div>

      {/* Action row — only assistant messages, only when there's something
          to do. Visible on hover/focus, accessible via keyboard. */}
      {hasActions ? (
        <div
          className={cn(
            'mr-2 flex items-center gap-1 transition-opacity duration-150',
            'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
            'sm:opacity-0', // re-assert in case base opacity was bumped
          )}
        >
          {plainText.length > 0 ? (
            <Tooltip label={copied ? 'Copied' : 'Copy'}>
              <button
                type="button"
                onClick={copy}
                aria-label={copied ? 'Copied' : 'Copy message'}
                className="bg-bg-elev-1 border border-divider text-fg-muted hover:text-fg focus-visible:ring-brand inline-flex size-8 items-center justify-center rounded-lg transition-colors focus:outline-none focus-visible:ring-2"
              >
                {copied ? (
                  <Check className="text-bull size-3.5" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </button>
            </Tooltip>
          ) : null}
          {isUser && onEdit ? (
            <Tooltip label="Edit prompt">
              <button
                type="button"
                onClick={() => {
                  setEditValue(plainText);
                  setIsEditing(true);
                }}
                aria-label="Edit prompt"
                className="bg-bg-elev-1 border border-divider text-fg-muted hover:text-fg focus-visible:ring-brand inline-flex size-8 items-center justify-center rounded-lg transition-colors focus:outline-none focus-visible:ring-2"
              >
                <Pencil className="size-3.5" />
              </button>
            </Tooltip>
          ) : null}
          {onRegenerate ? (
            <div className="relative inline-flex">
              <Tooltip label="Regenerate">
                <button
                  type="button"
                  onClick={() => onRegenerate()}
                  aria-label="Regenerate response"
                  className="bg-bg-elev-1 border border-divider text-fg-muted hover:text-fg focus-visible:ring-brand inline-flex size-8 items-center justify-center rounded-l-lg transition-colors focus:outline-none focus-visible:ring-2"
                >
                  <RotateCcw className="size-3.5" />
                </button>
              </Tooltip>
              <Tooltip label="Regenerate with…">
                <button
                  type="button"
                  popoverTarget={`regen-menu-${message.id}`}
                  aria-label="Regenerate with a different model"
                  className="bg-bg-elev-1 border border-divider text-fg-muted hover:text-fg focus-visible:ring-brand inline-flex size-8 items-center justify-center rounded-r-lg border-l border-divider/40 transition-colors focus:outline-none focus-visible:ring-2"
                  style={{ anchorName: `--regen-btn-${message.id}` } as React.CSSProperties}
                >
                  <ChevronDown className="size-3.5" />
                </button>
              </Tooltip>
              <div
                id={`regen-menu-${message.id}`}
                popover="auto"
                role="menu"
                className="bg-bg-elev-1 border border-divider border-divider/60 m-0 flex-col gap-0.5 rounded-xl border p-1 shadow-xl"
                style={{ 
                  minWidth: '12rem',
                  positionAnchor: `--regen-btn-${message.id}`,
                  bottom: 'calc(anchor(top) + 8px)',
                  right: 'anchor(right)',
                  position: 'fixed'
                } as React.CSSProperties}
              >
                {REGEN_MODELS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      (e.currentTarget.closest('[popover]') as HTMLElement)?.hidePopover();
                      onRegenerate({ modelOverride: m.id });
                    }}
                    className="text-fg hover:bg-bg-elev-2 focus:bg-bg-elev-2 flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors focus:outline-none"
                  >
                    <span>{m.label}</span>
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                        m.tier === 'pro'
                          ? 'bg-brand/15 text-brand'
                          : 'bg-bg-elev-3 text-fg-muted',
                      )}
                    >
                      {m.tier}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** AI SDK v5 streamed tool-part state vocabulary. */
type StreamToolState =
  | 'input-streaming'
  | 'input-available'
  | 'output-available'
  | 'output-error';

function toPartState(state: StreamToolState): ToolPartState {
  if (state === 'output-available') return 'done';
  if (state === 'output-error') return 'error';
  return 'loading';
}

interface StreamToolPart {
  state?: StreamToolState;
  output?: unknown;
  errorText?: string;
}

function renderPart(
  part: UIMessage['parts'][number],
  idx: number,
  role: UIMessage['role'],
): React.ReactNode {
  if (part.type === 'text') {
    return <TextPart key={idx} text={part.text} role={role === 'user' ? 'user' : 'assistant'} />;
  }
  if (part.type === 'reasoning') return null;
  if (part.type.startsWith('source-') || part.type === 'file' || part.type === 'step-start')
    return null;

  // Phase 7c — UI-only parts written into the assistant message after
  // streamText finishes (citation warning, verify warning) or written
  // into a sibling system message before the turn (data-plan, handled
  // at the message level above).
  if (part.type === 'data-citation-warning') {
    // The persisted JSON shape matches `CitationWarningPart` exactly.
    return (
      <CitationWarningPartView
        key={idx}
        part={part as unknown as Parameters<typeof CitationWarningPartView>[0]['part']}
      />
    );
  }
  if (part.type === 'data-verify-warning') {
    // For now reuse the citation warning's tone-styled card with a custom
    // header; a bespoke verify-warning component can graduate later.
    return (
      <CitationWarningPartView
        key={idx}
        part={
          {
            type: 'data-citation-warning',
            unsupportedClaims: ((part as unknown as { caveats?: string[] }).caveats ?? []),
            toolsInvoked: [],
            stance: 'strict',
            createdAt:
              (part as unknown as { createdAt?: number }).createdAt ?? Date.now(),
          } as Parameters<typeof CitationWarningPartView>[0]['part']
        }
      />
    );
  }
  if (part.type === 'data-plan') {
    // Defensive fallback — the planner persists plans on a sibling
    // system message and this branch is unreachable in practice.
    return (
      <PlanPart
        key={idx}
        plan={part as unknown as Parameters<typeof PlanPart>[0]['plan']}
      />
    );
  }

  if (part.type.startsWith('tool-')) {
    const p = part as StreamToolPart;
    const name = part.type.slice('tool-'.length);
    const streamState: StreamToolState = p.state ?? 'output-available';
    const errorMessage = p.errorText;
    return (
      <ChatToolPart
        key={idx}
        name={name}
        output={p.output ?? null}
        state={toPartState(streamState)}
        {...(errorMessage !== undefined ? { errorMessage } : {})}
      />
    );
  }
  return null;
}

function extractText(m: UIMessage): string {
  return m.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
    .trim();
}
