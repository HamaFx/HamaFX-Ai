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
import { memo, useEffect, useMemo, useState } from 'react';
import { m } from 'motion/react';
import { useCopied } from '@/hooks/use-copied';

import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { MAX_TEXT_CHARS } from './composer-helpers';

import { CitationWarningPartView } from './parts/citation-warning';
import { FallbackPartView } from './parts/fallback';
import { ChatToolPart, type ToolPartState } from './parts/registry';
import { PlanPart } from './parts/plan';
import { TextPart } from './parts/text';
import { MessageFooter } from './_components/message-footer';

interface MessageProps {
  message: UIMessage;
  onCopy?: (text: string) => void;
  onRegenerate?: (opts?: { modelOverride?: string }) => void;
  onEdit?: (messageId: string, newText: string) => void;
  isStreaming?: boolean;
}

/**
 * Phase E — the "Regenerate with…" popover used to be a hardcoded
 * 3-Gemini-options list. Now it's a full picker sourced from the
 * live `/api/settings/catalog` + `/api/settings/default-model`
 * endpoints via `<RegenModelPicker>`. The picker renders only
 * models from providers the user has a key for, grouped by provider
 * and tagged with tier + price.
 */
import { RegenModelPicker } from './_components/regen-model-picker';

function MessageImpl({ message, onCopy, onRegenerate, onEdit, isStreaming }: MessageProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plainText = useMemo(() => extractText(message), [message.parts]);
  const [copied, triggerCopy] = useCopied(1200);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(plainText);
  const [hasPopoverSupport, setHasPopoverSupport] = useState(true);
  const [isOpenFallback, setIsOpenFallback] = useState(false);

  useEffect(() => {
    setHasPopoverSupport(
      typeof HTMLElement !== 'undefined' && 'popover' in HTMLElement.prototype
    );
  }, []);

  useEffect(() => {
    if (hasPopoverSupport || !isOpenFallback) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const insideMenu = target.closest(`#regen-menu-${message.id}`);
      const insideBtn = target.closest(`button[aria-label="Regenerate with a different model"]`);
      if (!insideMenu && !insideBtn) {
        setIsOpenFallback(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [hasPopoverSupport, isOpenFallback, message.id]);

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
              {...(isStreaming !== undefined ? { streaming: isStreaming } : {})}
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
    triggerCopy();
  }

  if (isUser && isEditing) {
    return (
      <div className="mb-2 mt-1 flex w-full justify-end">
        <div className="flex w-full max-w-[88%] flex-col gap-2 rounded-3xl rounded-br-md border border-brand/50 bg-bg-elev-1/80 p-3 shadow-md focus-within:ring-2 focus-within:ring-brand">
          <textarea
            className="w-full resize-none bg-transparent text-sm text-fg outline-none [field-sizing:content]"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            maxLength={MAX_TEXT_CHARS}
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
    <m.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={cn('group flex w-full flex-col gap-2', isUser ? 'items-end' : 'items-start')}
    >
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
        {/* Phase 1.3 — aria-live so screen readers announce the final
            assistant message when streaming completes. */}
        <div aria-live={isUser ? undefined : 'polite'}>
        {message.parts.map((part, idx) => {
          if (part.type === 'text') {
            return (
              <MemoizedTextPart
                key={idx}
                text={part.text}
                role={message.role === 'user' ? 'user' : 'assistant'}
                isStreaming={!!isStreaming}
              />
            );
          }
          if (part.type.startsWith('tool-')) {
            const p = part as StreamToolPart;
            const name = part.type.slice('tool-'.length);
            const streamState: StreamToolState = p.state ?? 'output-available';
            const errorMessage = p.errorText;
            return (
              <MemoizedToolPart
                key={idx}
                name={name}
                output={p.output ?? null}
                state={toPartState(streamState)}
                {...(errorMessage !== undefined ? { errorMessage } : {})}
              />
            );
          }
          return renderPart(part, idx, message.role);
        })}
        </div>
      </div>

      {/* Phase 1.3 — trust footer on assistant messages (model, time,
          token usage, cost, citations). Hidden while streaming. */}
      {!isUser && !isStreaming ? (
        <div className="max-w-[88%]">
          <MessageFooter message={message} />
        </div>
      ) : null}

      {/* Action row — only assistant messages, only when there's something
          to do. Visible on hover/focus, accessible via keyboard. */}
      {hasActions ? (
        <div
          className={cn(
            'mr-2 flex items-center gap-1 transition-opacity duration-150',
            'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100',
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
                  popoverTarget={hasPopoverSupport ? `regen-menu-${message.id}` : undefined}
                  onClick={hasPopoverSupport ? undefined : () => setIsOpenFallback(!isOpenFallback)}
                  aria-label="Regenerate with a different model"
                  className="bg-bg-elev-1 border border-divider text-fg-muted hover:text-fg focus-visible:ring-brand inline-flex size-8 items-center justify-center rounded-r-lg border-l border-divider/40 transition-colors focus:outline-none focus-visible:ring-2"
                  style={
                    hasPopoverSupport
                      ? ({ anchorName: `--regen-btn-${message.id}` } as React.CSSProperties)
                      : undefined
                  }
                >
                  <ChevronDown className="size-3.5" />
                </button>
              </Tooltip>
              <div
                id={`regen-menu-${message.id}`}
                popover={hasPopoverSupport ? "auto" : undefined}
                role="menu"
                className={cn(
                  "bg-bg-elev-1 border border-divider border-divider/60 m-0 rounded-xl border p-1 shadow-xl",
                  !hasPopoverSupport && "absolute bottom-full right-0 mb-2 z-50",
                  !hasPopoverSupport && !isOpenFallback && "hidden"
                )}
                style={
                  hasPopoverSupport
                    ? ({ 
                        minWidth: '12rem',
                        positionAnchor: `--regen-btn-${message.id}`,
                        bottom: 'calc(anchor(top) + 8px)',
                        right: 'anchor(right)',
                        position: 'fixed'
                      } as React.CSSProperties)
                    : { minWidth: '12rem' }
                }
              >
                <RegenModelPicker
                  popoverId={`regen-menu-${message.id}`}
                  activeModelId={(message as unknown as { metadata?: { model?: string } }).metadata?.model ?? null}
                  onPick={(modelId) => {
                    onRegenerate({ modelOverride: modelId });
                    setIsOpenFallback(false);
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </m.div>
  );
}

export const Message = memo(MessageImpl, (prev, next) => {
  if (prev.message.id !== next.message.id) return false;
  if (prev.onRegenerate !== next.onRegenerate) return false;
  if (prev.onEdit !== next.onEdit) return false;
  if (prev.onCopy !== next.onCopy) return false;
  if (prev.isStreaming !== next.isStreaming) return false;

  // Compare parts array
  if (prev.message.parts !== next.message.parts) {
    if (!prev.message.parts || !next.message.parts) return false;
    if (prev.message.parts.length !== next.message.parts.length) return false;
    for (let i = 0; i < prev.message.parts.length; i++) {
      if (prev.message.parts[i] !== next.message.parts[i]) return false;
    }
  }
  return true;
});

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
  _role: UIMessage['role'],
): React.ReactNode {
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

  // Phase B — UX_UPGRADE_PLAN.md item 15. Inline card explaining
  // that the requested model override failed and the default was
  // used instead. The amber tone is distinct from citation
  // warnings (bear) so the user can tell them apart at a glance.
  if (part.type === 'data-fallback') {
    return (
      <FallbackPartView
        key={idx}
        part={
          part as unknown as Parameters<typeof FallbackPartView>[0]['part']
        }
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

const MemoizedTextPart = memo(function MemoizedTextPart({
  text,
  role,
  isStreaming,
}: {
  text: string;
  role: 'user' | 'assistant';
  isStreaming: boolean;
}) {
  return <TextPart text={text} role={role} isStreaming={isStreaming} />;
});

const MemoizedToolPart = memo(function MemoizedToolPart({
  name,
  output,
  state,
  errorMessage,
}: {
  name: string;
  output: unknown;
  state: ToolPartState;
  errorMessage?: string;
}) {
  return (
    <ChatToolPart
      name={name}
      output={output}
      state={state}
      {...(errorMessage !== undefined ? { errorMessage } : {})}
    />
  );
});
