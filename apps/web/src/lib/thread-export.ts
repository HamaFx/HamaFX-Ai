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

/**
 * Render a chat thread to a Markdown document.
 *
 * Phase B — UX_UPGRADE_PLAN.md item 14.
 *
 * Pure function. Tested in apps/web/test/thread-export.test.ts.
 *
 * Output shape:
 *   # <title or "Untitled thread">
 *
 *   _Exported <ISO date> from HamaFX-Ai · <symbol?>_
 *
 *   ## User · <ISO timestamp>
 *   <text>
 *
 *   ## Assistant · <ISO timestamp>
 *   <text>
 *
 *   > tool: <toolName>
 *   > <json-ish summary>
 *
 *   > **citation warning:** <warning text>
 *
 *   _(truncated to N messages)_   ← only when capped
 *
 * Special cases:
 *   - Empty thread: returns a minimal stub so the file is never empty.
 *   - Tool parts are rendered as a fenced ```json block (the raw
 *     part payload) so a reader can inspect the exact data the
 *     agent saw.
 *   - Diacritics and Markdown metacharacters in user-supplied text
 *     are escaped on a per-character basis to avoid breaking the
 *     rendered document. We do NOT use a heavy library.
 */

export interface ExportMessagePart {
  type: string;
  /** text parts carry a `text` field; tool parts may carry `input` / `output`. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface ExportMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  /** ISO timestamp string. */
  createdAt: string;
  /** Plain text fallback for callers that didn't pre-extract. */
  content?: string;
  parts?: ExportMessagePart[];
}

export interface ExportThread {
  id: string;
  title: string | null;
  pinnedSymbol: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RenderOptions {
  /** Maximum messages included in the export. Default 500. */
  maxMessages?: number;
  /** ISO timestamp the export was generated; injected into the header. */
  exportedAt?: string;
}

const DEFAULT_MAX_MESSAGES = 500;

/**
 * Escape Markdown metacharacters that would otherwise break inline
 * text or list rendering. We deliberately do NOT escape the
 * fenced code-block boundaries because those never appear in user
 * text on a normal keyboard — if a user pastes a triple backtick
 * into the composer, it is their content and we honour it.
 */
function escapeInline(s: string): string {
  // Order matters: backslash first so the substitutions we add are
  // not re-escaped. Then *, _, `, [, ], <, >, &, #.
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/`/g, '\\`')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/</g, '\\<')
    .replace(/>/g, '\\>')
    .replace(/&/g, '\\&')
    .replace(/#/g, '\\#');
}

function partText(p: ExportMessagePart): string {
  if (typeof p.text === 'string') return p.text;
  if (typeof p.content === 'string') return p.content;
  return '';
}

function partSummary(p: ExportMessagePart): string {
  // Tool parts: best-effort human-readable summary. We try `input`
  // and `output` shapes from the AI SDK v5 tool invocation; fall
  // back to the raw JSON.
  const lines: string[] = [];
  if (typeof p.toolName === 'string') lines.push(`tool: ${p.toolName}`);
  if (p.input && typeof p.input === 'object') {
    lines.push(`input: ${JSON.stringify(p.input)}`);
  }
  if (p.output !== undefined) {
    lines.push(
      `output: ${typeof p.output === 'string' ? p.output : JSON.stringify(p.output)}`,
    );
  }
  if (lines.length === 0) {
    return JSON.stringify(p);
  }
  return lines.join('\n');
}

function partBlockquote(p: ExportMessagePart): string {
  // Markdown blockquote — every line prefixed with "> ".
  const summary = partSummary(p);
  const lines = summary.split('\n');
  return lines.map((l) => `> ${l}`).join('\n');
}

export function renderThreadToMarkdown(
  thread: ExportThread,
  messages: readonly ExportMessage[],
  opts: RenderOptions = {},
): string {
  const max = opts.maxMessages ?? DEFAULT_MAX_MESSAGES;
  const exportedAt = opts.exportedAt ?? new Date().toISOString();
  const truncated = messages.length > max;
  const slice = truncated ? messages.slice(0, max) : messages;

  const title = thread.title?.trim() || 'Untitled thread';
  const symbolSuffix = thread.pinnedSymbol ? ` · ${thread.pinnedSymbol}` : '';
  const header =
    `# ${title}\n\n` +
    `_Exported ${exportedAt} from HamaFX-Ai${symbolSuffix}_\n` +
    `_Thread ${thread.id}_\n\n`;

  if (slice.length === 0) {
    return header + '_No messages in this thread._\n';
  }

  const body = slice
    .map((m) => {
      const ts = m.createdAt;
      const role = m.role.charAt(0).toUpperCase() + m.role.slice(1);
      const heading = `## ${role} · ${ts}\n\n`;

      if (!m.parts || m.parts.length === 0) {
        const fallback = (m.content ?? '').trim();
        return heading + (fallback ? `${escapeInline(fallback)}\n` : '_(empty)_\n');
      }

      const blocks: string[] = [];
      for (const p of m.parts) {
        const t = p.type;
        if (t === 'text') {
          const text = partText(p).trim();
          if (text) blocks.push(`${escapeInline(text)}`);
        } else if (t === 'reasoning' || t === 'source-document' || t === 'source-url') {
          // Internal model reasoning + source citations — skip
          // from the export. They are not user-facing in the chat
          // UI either.
        } else if (t && t.startsWith('tool-')) {
          const toolName = t.slice('tool-'.length);
          blocks.push(`> tool: ${toolName}\n${partBlockquote(p)}`);
        } else if (t === 'data-citation-warning' || t === 'data-verify-warning') {
          const reason = typeof p.reason === 'string' ? p.reason : 'unsupported claim';
          // Phase B — UX_UPGRADE_PLAN.md item 9. When the part
          // carries structured findings, list them as bullet
          // claims instead of the legacy one-line summary so the
          // exported Markdown is actionable.
          const findings = Array.isArray(p.findings) ? p.findings : null;
          if (findings && findings.length > 0) {
            const lines = findings.map(
              (f) =>
                `> - [ ] ${f.supported ? '✓' : '✗'} ${typeof f.text === 'string' ? f.text : JSON.stringify(f)}`,
            );
            blocks.push(`> **citation warning:** ${reason}\n${lines.join('\n')}`);
          } else {
            blocks.push(`> **citation warning:** ${reason}`);
          }
        } else if (t === 'data-fallback') {
          const reason = typeof p.reason === 'string' ? p.reason : 'override unavailable';
          blocks.push(`> **fallback:** ${escapeInline(reason)}`);
        } else if (t === 'file' || t === 'step-start') {
          // File metadata / multi-step boundary — skip from export.
        } else {
          // Unknown part shape — keep raw JSON in a fenced block so
          // the export is lossless and a future reader can inspect.
          blocks.push('```json\n' + JSON.stringify(p, null, 2) + '\n```');
        }
      }

      const inner = blocks.length > 0 ? blocks.join('\n\n') + '\n' : '_(empty)_\n';
      return heading + inner;
    })
    .join('\n');

  const trailer = truncated
    ? `\n_(truncated to ${max} of ${messages.length} messages)_\n`
    : '';

  return header + body + trailer;
}

/**
 * Build the filename for a downloaded export. Format:
 *   hamafx-<thread-id-slug>-YYYYMMDD.md
 * The id slug is the first 8 hex chars of the UUID, lowercased.
 */
export function exportFilename(thread: ExportThread, now: Date = new Date()): string {
  const slug = thread.id.replace(/-/g, '').slice(0, 8).toLowerCase();
  const yyyymmdd = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  return `hamafx-${slug}-${yyyymmdd}.md`;
}
