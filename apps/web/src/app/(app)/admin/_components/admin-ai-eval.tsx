'use client';

import { useCallback, useRef, useState } from 'react';
import { IconFlask, IconPlayerPlay, IconSquare, IconCheck, IconX, IconLoader2 } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { SettingsSection } from '@/app/(app)/settings/_components/settings-section';
import { AI_EVAL_PROMPTS } from '@/lib/ai-eval-prompts';
import { getCsrfToken } from '@/lib/csrf';

interface EvalRow {
  id: string;
  prompt: string;
  status: 'pending' | 'running' | 'ok' | 'failed';
  totalMs?: number;
  chars?: number;
  error?: string;
}

const REQUEST_TIMEOUT_MS = 120_000;
/** Stay under the 30/min chat rate limit while driving 30 prompts. */
const BETWEEN_PROMPTS_DELAY_MS = 4_000;

async function createThread(): Promise<string> {
  const csrf = getCsrfToken();
  const res = await fetch('/api/chat/threads', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    body: '{}',
  });
  if (!res.ok) {
    throw new Error(`Thread creation failed: HTTP ${res.status}`);
  }
  const json = (await res.json()) as { thread?: { id?: string } };
  const id = json.thread?.id;
  if (typeof id !== 'string' || id.length === 0) throw new Error('Thread creation returned no id');
  return id;
}

interface RunOneResult {
  ok: boolean;
  totalMs: number;
  text: string;
  error?: string;
}

async function runOnePrompt(threadId: string, prompt: string): Promise<RunOneResult> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const csrf = getCsrfToken();
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({
        threadId,
        messages: [
          {
            id: crypto.randomUUID(),
            role: 'user',
            parts: [{ type: 'text', text: prompt }],
          },
        ],
      }),
      signal: controller.signal,
    });
    const totalMs = Date.now() - startedAt;

    if (!res.ok) {
      let detail = '';
      try {
        const json = (await res.json()) as { error?: { message?: string } };
        detail = json.error?.message ?? '';
      } catch {
        /* ignore */
      }
      return {
        ok: false,
        totalMs,
        text: '',
        error: `HTTP ${res.status}${detail ? `: ${detail}` : ''}`,
      };
    }

    const text = await readSseText(res);
    const error = text.error ?? (text.text.length === 0 ? 'Stream closed without assistant text' : undefined);
    return {
      ok: !error,
      totalMs,
      text: text.text,
      error,
    };
  } catch (err) {
    const aborted = controller.signal.aborted;
    return {
      ok: false,
      totalMs: Date.now() - startedAt,
      text: '',
      error: aborted
        ? `Timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
        : err instanceof Error
          ? err.message
          : String(err),
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function parseSseEvent(raw: string): { type?: string; delta?: string; errorText?: string } | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed !== 'object' || parsed === null) return null;
    return {
      ...(typeof parsed.type === 'string' ? { type: parsed.type } : {}),
      ...(typeof parsed.delta === 'string' ? { delta: parsed.delta } : {}),
      ...(typeof parsed.errorText === 'string' ? { errorText: parsed.errorText } : {}),
    };
  } catch {
    return null;
  }
}

/** Minimal SSE reader for the chat stream: collects text, surfaces errors. */
async function readSseText(res: Response): Promise<{ text: string; error?: string }> {
  if (!res.body) return { text: '', error: 'Empty response body' };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let error: string | undefined;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]' || raw.length === 0) continue;
        const event = parseSseEvent(raw);
        if (!event) continue;
        if (event.type === 'text-delta' && typeof event.delta === 'string') {
          text += event.delta;
        } else if (event.type === 'error' && typeof event.errorText === 'string') {
          error = event.errorText;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  return { text, error };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function AdminAiEval() {
  const [rows, setRows] = useState<EvalRow[]>(() =>
    AI_EVAL_PROMPTS.map((p) => ({ id: p.id, prompt: p.prompt, status: 'pending' as const })),
  );
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const stopRef = useRef(false);

  const patchRow = useCallback((index: number, patch: Partial<EvalRow>) => {
    setRows((prev) => {
      const next = prev.slice();
      const current = next[index];
      if (current) next[index] = { ...current, ...patch };
      return next;
    });
  }, []);

  const run = useCallback(async () => {
    stopRef.current = false;
    setRunning(true);
    setSummary(null);
    setRows(AI_EVAL_PROMPTS.map((p) => ({ id: p.id, prompt: p.prompt, status: 'pending' as const })));

    let ok = 0;
    let failed = 0;
    const failures: string[] = [];

    for (let index = 0; index < AI_EVAL_PROMPTS.length; index += 1) {
      const prompt = AI_EVAL_PROMPTS[index];
      if (!prompt) break;
      if (stopRef.current) {
        setSummary(`Stopped at prompt ${index + 1}/${AI_EVAL_PROMPTS.length}`);
        setRunning(false);
        return;
      }

      patchRow(index, { status: 'running' });
      try {
        const threadId = await createThread();
        const result = await runOnePrompt(threadId, prompt.prompt);
        if (result.ok) {
          ok += 1;
          patchRow(index, { status: 'ok', totalMs: result.totalMs, chars: result.text.length });
        } else {
          failed += 1;
          failures.push(`${prompt.id}: ${result.error ?? 'failed'}`);
          patchRow(index, { status: 'failed', totalMs: result.totalMs, error: result.error });
        }
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        failures.push(`${prompt.id}: ${message}`);
        patchRow(index, { status: 'failed', error: message });
      }

      if (index < AI_EVAL_PROMPTS.length - 1 && !stopRef.current) {
        await delay(BETWEEN_PROMPTS_DELAY_MS);
      }
    }

    setRunning(false);
    setSummary(
      failures.length > 0
        ? `Done: ${ok} ok, ${failed} failed. Failures: ${failures.join('; ')}`
        : `Done: all ${ok} prompts completed successfully.`,
    );
  }, [patchRow]);

  const stop = useCallback(() => {
    stopRef.current = true;
  }, []);

  const completed = rows.filter((r) => r.status === 'ok' || r.status === 'failed').length;

  return (
    <SettingsSection
      title="AI Eval — XAUUSD comparison run"
      description={`Runs ${AI_EVAL_PROMPTS.length} read-only gold prompts through the normal chat route from your session. Each eligible prompt produces a Mastra report and a legacy shadow comparison for Admin → AI Compare. This uses Mistral tokens and takes roughly 10–20 minutes.`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => void run()} disabled={running} variant={running ? 'secondary' : 'primary'} size="sm">
          {running ? (
            <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <IconPlayerPlay className="size-4" aria-hidden="true" />
          )}
          {running ? `Running… ${completed}/${AI_EVAL_PROMPTS.length}` : 'Start eval run'}
        </Button>
        {running ? (
          <Button type="button" onClick={stop} variant="secondary" size="sm">
            <IconSquare className="size-4" aria-hidden="true" /> Stop
          </Button>
        ) : null}
        {!running && completed > 0 ? (
          <Button type="button" onClick={() => setRows(AI_EVAL_PROMPTS.map((p) => ({ id: p.id, prompt: p.prompt, status: 'pending' as const })))} variant="ghost" size="sm">
            Reset
          </Button>
        ) : null}
      </div>

      {summary ? (
        <p role="status" className="mt-3 text-sm text-fg-muted">{summary}</p>
      ) : null}

      {completed > 0 || running ? (
        <div className="border-border mt-4 overflow-x-auto rounded-sm border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-bg-elev-2 text-fg-subtle">
              <tr>
                <th className="px-3 py-2 text-left">Case</th>
                <th className="px-3 py-2 text-left">Prompt</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Time</th>
                <th className="px-3 py-2 text-left">Chars</th>
                <th className="px-3 py-2 text-left">Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-border border-t">
                  <td className="text-fg-subtle px-3 py-2 font-mono text-xs">{row.id}</td>
                  <td className="text-fg-subtle px-3 py-2 text-xs">{row.prompt}</td>
                  <td className="px-3 py-2">
                    {row.status === 'ok' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-bull">
                        <IconCheck className="size-3.5" aria-hidden="true" /> ok
                      </span>
                    ) : row.status === 'failed' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-danger">
                        <IconX className="size-3.5" aria-hidden="true" /> failed
                      </span>
                    ) : row.status === 'running' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-fg-subtle">
                        <IconLoader2 className="size-3.5 animate-spin" aria-hidden="true" /> running…
                      </span>
                    ) : (
                      <span className="text-xs text-fg-subtle">pending</span>
                    )}
                  </td>
                  <td className="text-fg-subtle px-3 py-2 text-xs tabular-nums">
                    {row.totalMs === undefined ? '—' : `${Math.round(row.totalMs / 1000)}s`}
                  </td>
                  <td className="text-fg-subtle px-3 py-2 text-xs tabular-nums">
                    {row.chars === undefined ? '—' : row.chars}
                  </td>
                  <td className="text-fg-subtle px-3 py-2 text-xs">{row.error ?? (row.status === 'ok' ? 'Mastra report generated' : '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border-border mt-4 flex items-start gap-2 rounded-sm border border-warn/30 bg-warn/5 p-3 text-xs text-fg-muted">
          <IconFlask className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
          <span>
            Keep this tab open while the run is in progress. Each prompt creates a fresh thread, waits for the Mastra report, and moves to the next. When it finishes, open <strong className="text-fg">AI Compare</strong> to review Mastra-vs-legacy rows.
          </span>
        </div>
      )}
    </SettingsSection>
  );
}
