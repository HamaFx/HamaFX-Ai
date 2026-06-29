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

// Settings island for linking/unlinking Telegram bot.
// Phase 7D — Settings & Polish.

import { Check, Link2, Loader2, Unlink, Copy, RefreshCw, ExternalLink } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

interface LinkStatus {
  linked: boolean;
  linkedAt?: string;
}

interface LinkCodeResponse {
  code: string;
  expiresAt: string;
  instructions: string;
  alreadyLinked?: boolean;
}

export function TelegramLinkCard(): React.JSX.Element {
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkCode, setLinkCode] = useState<LinkCodeResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [polling, setPolling] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/bot/status');
      if (res.ok) {
        const data = (await res.json()) as LinkStatus;
        setStatus(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const startPolling = useCallback(() => {
    let attempts = 0;
    setPolling(true);
    pollingRef.current = setInterval(async () => {
      attempts += 1;
      if (attempts > 15) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        setPolling(false);
        return;
      }
      try {
        const res = await fetch('/api/bot/status');
        if (res.ok) {
          const data = (await res.json()) as LinkStatus;
          if (data.linked) {
            setStatus(data);
            setLinkCode(null);
            setPolling(false);
            if (pollingRef.current) clearInterval(pollingRef.current);
            toast.success('Telegram linked!', {
              description: 'Your Telegram account is now connected.',
            });
          }
        }
      } catch {
        // ignore polling errors
      }
    }, 2000);
  }, []);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  async function generateCode(): Promise<void> {
    setGenerating(true);
    setCopied(false);
    try {
      const res = await fetch('/api/bot/link-code', { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as LinkCodeResponse;
        if (data.alreadyLinked) {
          toast.info('Already linked', {
            description: 'Your Telegram is already connected. Unlink first to re-link.',
          });
          await fetchStatus();
          return;
        }
        setLinkCode(data);
        toast.success('Link code generated', {
          description: 'Send the code to the HamaFX bot on Telegram',
        });
        startPolling();
      } else {
        const text = await res.text().catch(() => 'Failed to generate code');
        toast.error('Failed', { description: text });
      }
    } catch (err) {
      toast.error('Failed', {
        description: err instanceof Error ? err.message : 'unknown error',
      });
    } finally {
      setGenerating(false);
    }
  }

  async function unlink(): Promise<void> {
    setUnlinking(true);
    try {
      const res = await fetch('/api/bot/unlink', { method: 'POST' });
      if (res.ok) {
        toast.success('Telegram unlinked');
        setStatus({ linked: false });
        setLinkCode(null);
      } else {
        toast.error('Failed to unlink');
      }
    } catch (err) {
      toast.error('Failed', {
        description: err instanceof Error ? err.message : 'unknown error',
      });
    } finally {
      setUnlinking(false);
    }
  }

  function copyCode(): void {
    if (!linkCode) return;
    navigator.clipboard.writeText(linkCode.code).then(() => {
      setCopied(true);
      toast.success('Code copied');
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-fg-subtle">
        <Loader2 className="size-4 animate-spin" />
        Checking Telegram link status…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status badge */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
            status?.linked
              ? 'bg-bull/10 text-bull'
              : 'bg-bg-elev-2/10 text-fg-muted',
          )}
        >
          {status?.linked ? (
            <>
              <Check className="size-3" /> Linked
            </>
          ) : (
            <>
              <Link2 className="size-3" /> Not linked
            </>
          )}
        </span>
        {status?.linked && status.linkedAt && (
          <span className="text-xs text-fg-subtle">
            Since {new Date(status.linkedAt).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* Linked state */}
      {status?.linked ? (
        <div className="space-y-3">
          <p className="text-sm text-fg-subtle">
            Your Telegram account is connected. You can use bot commands like{' '}
            <code className="rounded bg-surface-elevated px-1 py-0.5 text-xs">/price</code>,{' '}
            <code className="rounded bg-surface-elevated px-1 py-0.5 text-xs">/analyze</code>,{' '}
            <code className="rounded bg-surface-elevated px-1 py-0.5 text-xs">/ask</code>, and more.
          </p>
          <a
            href={`https://t.me/HamaFXBot`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-brand hover:text-brand/80 font-semibold transition-colors"
          >
            <ExternalLink className="size-3" />
            Open HamaFX Bot on Telegram
          </a>
          <Button
            type="button"
            variant="danger"
            onClick={unlink}
            disabled={unlinking}
            className="min-h-[44px]"
          >
            {unlinking ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Unlink className="size-4" />
            )}
            {unlinking ? 'Unlinking…' : 'Unlink Telegram'}
          </Button>
        </div>
      ) : (
        /* Not linked state */
        <div className="space-y-3">
          <p className="text-sm text-fg-subtle">
            Link your Telegram to control HamaFX from your phone with bot commands.
          </p>

          <a
            href={`https://t.me/HamaFXBot`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-brand hover:text-brand/80 font-semibold transition-colors"
          >
            <ExternalLink className="size-3" />
            Open HamaFX Bot on Telegram
          </a>

          {!linkCode ? (
            <Button
              type="button"
              onClick={generateCode}
              disabled={generating}
              className="min-h-[44px]"
            >
              {generating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Link2 className="size-4" />
              )}
              {generating ? 'Generating…' : 'Link Telegram'}
            </Button>
          ) : (
              <div className="space-y-3">
                {/* Link code display */}
                <div className="rounded-lg border border-border bg-surface-elevated p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-fg-subtle">Your link code</span>
                    <span className="text-xs text-fg-subtle">
                      Expires {new Date(linkCode.expiresAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-background px-3 py-2 text-lg font-mono font-bold tracking-widest">
                      {linkCode.code}
                    </code>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="w-10 px-0"
                      onClick={copyCode}
                      aria-label="Copy code"
                    >
                      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-fg-subtle">
                    Send{' '}
                    <code className="font-mono">/link {linkCode.code}</code>{' '}
                    to the HamaFX bot on Telegram.
                  </p>
                  <a
                    href={`https://t.me/HamaFXBot`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-brand hover:text-brand/80 font-semibold transition-colors"
                  >
                    <ExternalLink className="size-3" />
                    Open HamaFX Bot on Telegram
                  </a>
                </div>

                {polling && (
                  <div className="flex items-center gap-2 text-xs text-fg-subtle animate-pulse">
                    <Loader2 className="size-3 animate-spin" />
                    Waiting for Telegram confirmation...
                  </div>
                )}

                <Button
                  type="button"
                  variant="ghost"
                  onClick={generateCode}
                  disabled={generating}
                  className="min-h-[44px]"
                >
                  <RefreshCw className="size-4" />
                  Regenerate code
                </Button>
              </div>
          )}
        </div>
      )}
    </div>
  );
}
