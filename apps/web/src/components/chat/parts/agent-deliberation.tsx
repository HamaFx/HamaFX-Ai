// SPDX-License-Identifier: Apache-2.0

'use client';

// Phase 1.1 — Cinematic Multi-Agent Committee Theater.
//
// Institutional "war room" deliberation surface:
//
//   Zone 0 — Telemetry:      ASCII streaming status panel with live step progress.
//   Zone 1 — Agent ring:     Circular avatar nodes with radar pulse animations,
//                            active state indicators, and completed checkmarks.
//   Zone 2 — Fusion:         Converging connector lines feed a central fusion node
//                            that intensifies as agents finish.
//   Zone 3 — Verdict reveal: Once every agent has settled, a confidence meter +
//                            bias distribution + dissent indicator is revealed with spring physics.

import {
  IconAlertCircle,
  IconAlertTriangle,
  IconRobot,
  IconCpu,
  IconCircleCheck,
  IconNews,
  IconShield,
  IconTrendingUp,
  IconTerminal2,
} from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';
import { useMemo, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface AgentOpinion {
  agentName: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasoning: string;
}

interface AgentProgress {
  agentName: string;
  status: 'pending' | 'running' | 'done' | 'error';
  opinion?: AgentOpinion;
  error?: string;
}

interface AgentDeliberationProps {
  agents: AgentProgress[];
  mode: string;
  status?: 'complete' | 'failed' | 'retrying';
  error?: string;
}

const AGENT_META: Record<
  string,
  { icon: ReactNode; label: string; tokenClass: string; activeClass: string }
> = {
  technical: {
    icon: <IconTrendingUp className="size-4" />,
    label: 'Technical',
    tokenClass: 'text-bull',
    activeClass: 'border-bull/40 bg-bull/10 shadow-[0_0_12px_rgba(34,197,94,0.2)]',
  },
  fundamental: {
    icon: <IconNews className="size-4" />,
    label: 'Fundamental',
    tokenClass: 'text-info',
    activeClass: 'border-info/40 bg-info/10 shadow-[0_0_12px_rgba(56,189,248,0.2)]',
  },
  risk: {
    icon: <IconShield className="size-4" />,
    label: 'Risk',
    tokenClass: 'text-bear',
    activeClass: 'border-bear/40 bg-bear/10 shadow-[0_0_12px_rgba(244,63,94,0.2)]',
  },
  sentiment: {
    icon: <IconRobot className="size-4" />,
    label: 'Sentiment',
    tokenClass: 'text-warn',
    activeClass: 'border-warn/40 bg-warn/10 shadow-[0_0_12px_rgba(234,179,8,0.2)]',
  },
  decision: {
    icon: <IconCpu className="size-4" />,
    label: 'Decision',
    tokenClass: 'text-brand',
    activeClass: 'border-brand/40 bg-brand/10 shadow-[0_0_12px_rgba(245,110,15,0.25)]',
  },
};

const FALLBACK_META = {
  icon: <IconRobot className="size-4" />,
  label: 'Agent',
  tokenClass: 'text-fg-muted',
  activeClass: 'border-border bg-bg-elev-2',
} as const;

const BIAS_TOKEN: Record<AgentOpinion['bias'], string> = {
  bullish: 'text-bull',
  bearish: 'text-bear',
  neutral: 'text-fg-muted',
};

export function AgentDeliberation({ agents, mode, status, error }: AgentDeliberationProps) {
  const hasDone = agents.some((a) => a.status === 'done');
  const isFailed = status === 'failed';
  const isRetrying = status === 'retrying';
  const allDone = agents.length > 0 && agents.every((a) => a.status === 'done' || a.status === 'error');
  const doneCount = agents.filter((a) => a.status === 'done').length;
  const progressPct = agents.length > 0 ? Math.round((doneCount / agents.length) * 100) : 0;

  // Verdict math — only opinions that actually arrived count.
  const opinions = agents.filter((a) => a.opinion);
  const avgConfidence =
    opinions.length > 0
      ? Math.round((opinions.reduce((s, a) => s + (a.opinion?.confidence ?? 0), 0) / opinions.length) * 100)
      : 0;
  const biasCounts = {
    bullish: opinions.filter((a) => a.opinion?.bias === 'bullish').length,
    bearish: opinions.filter((a) => a.opinion?.bias === 'bearish').length,
    neutral: opinions.filter((a) => a.opinion?.bias === 'neutral').length,
  };
  const dissent = biasCounts.bullish > 0 && biasCounts.bearish > 0;
  const confidenceTone = avgConfidence > 75 ? 'bg-bull' : avgConfidence >= 50 ? 'bg-warn' : 'bg-bear';

  return (
    <div
      role="status"
      aria-live="polite"
      className="border border-border/80 bg-bg-elev-1 rounded-sm p-4 flex flex-col gap-4 shadow-sm"
    >
      {/* Header & Step Progress */}
      <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2 text-caption text-fg-subtle font-semibold uppercase tracking-wider">
          <IconCpu className="size-3.5" />
          <span>Multi-Agent {mode} mode</span>
        </div>

        {!allDone && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-fg-subtle tabular-nums">
              {doneCount}/{agents.length} Synced
            </span>
            <div className="w-16 h-1.5 rounded-full bg-bg-elev-3 overflow-hidden">
              <m.div
                className="h-full bg-gradient-to-r from-brand to-bull rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Zone 0 — ASCII terminal telemetry log */}
      {!allDone ? (
        <TelemetryLog agents={agents} />
      ) : null}

      {/* Zone 1 — Agent node avatars */}
      <div className="flex flex-wrap items-start justify-center gap-3">
        {agents.map((a) => {
          const meta = AGENT_META[a.agentName] ?? FALLBACK_META;
          return <AgentNode key={a.agentName} agent={a} meta={meta} />;
        })}
      </div>

      {/* Zone 2 — Connector lines + fusion node */}
      <AnimatePresence>
        {hasDone && !allDone ? (
          <m.div
            key="fusion"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col items-center"
          >
            <ConnectorLines agents={agents} />
            <m.div
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
              className={cn(
                'size-2.5 rounded-sm bg-brand shadow-[0_0_8px_rgba(245,110,15,0.4)]',
                doneCount >= 2 && 'size-3 bg-bull shadow-[0_0_10px_rgba(34,197,94,0.4)]',
              )}
            />
          </m.div>
        ) : null}
      </AnimatePresence>

      {/* "Deliberating…" while nothing is done yet */}
      {!hasDone ? (
        <div className="flex items-center justify-center gap-2 text-caption text-fg-subtle uppercase tracking-wider">
          <span className="motion-safe:animate-pulse">Deliberating…</span>
        </div>
      ) : null}

      {/* Zone 3 — Verdict reveal */}
      <AnimatePresence>
        {allDone && !isFailed && !isRetrying ? (
          <m.div
            key="verdict"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            aria-label={`Committee verdict: ${dissent ? 'mixed' : opinions[0]?.opinion?.bias ?? 'neutral'}, ${avgConfidence}% confidence`}
            className="border border-border bg-bg-elev-2 rounded-sm p-3.5 flex flex-col gap-3 shadow-xs"
          >
            {/* Confidence meter */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-fg">Committee confidence</span>
                <span className="text-sm font-bold text-fg tabular-nums">{avgConfidence}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-sm bg-bg-elev-3">
                <m.div
                  className={cn('h-full rounded-sm', confidenceTone)}
                  initial={{ width: 0 }}
                  animate={{ width: `${avgConfidence}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
              </div>
            </div>

            {/* Bias distribution + dissent */}
            <div className="flex items-center justify-between gap-3 pt-1">
              <BiasDistribution counts={biasCounts} total={opinions.length} />
              {dissent ? (
                <span className="inline-flex items-center gap-1 text-caption text-warn font-semibold bg-warn/10 border border-warn/30 px-2 py-0.5 rounded-xs">
                  <IconAlertTriangle className="size-3.5" />
                  Mixed signals
                </span>
              ) : null}
            </div>

            {/* Expandable opinions */}
            {opinions.length > 0 ? (
              <details className="group/details mt-1">
                <summary className="cursor-pointer list-none text-body-sm text-fg-muted hover:text-fg select-none">
                  View agent opinions
                </summary>
                <div className="mt-2 flex flex-col gap-2 border-t border-border/60 pt-2">
                  {opinions.map((a) => {
                    const meta = AGENT_META[a.agentName] ?? FALLBACK_META;
                    const op = a.opinion!;
                    return (
                      <div key={a.agentName} className="border-l-2 border-border/80 pl-3 py-1 bg-bg-elev-1/40 rounded-r-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-fg text-body-sm font-semibold">{meta.label}</span>
                          <span className={cn('text-caption font-mono font-bold uppercase', BIAS_TOKEN[op.bias])}>
                            {op.bias} · {Math.round(op.confidence * 100)}%
                          </span>
                        </div>
                        <p className="text-fg-muted text-xs mt-1 leading-[1.4]">{op.reasoning}</p>
                      </div>
                    );
                  })}
                </div>
              </details>
            ) : null}

            {/* Errors */}
            {agents
              .filter((a) => a.status === 'error' && a.error)
              .map((a) => {
                const meta = AGENT_META[a.agentName] ?? FALLBACK_META;
                return (
                  <div key={`error-${a.agentName}`} className="text-danger text-xs flex items-center gap-1.5 bg-danger/10 p-2 rounded-xs border border-danger/30">
                    <IconAlertCircle className="size-3.5 shrink-0" />
                    <span>{meta.label} agent failed: {a.error}</span>
                  </div>
                );
              })}
          </m.div>
        ) : null}
      </AnimatePresence>

      {isFailed || isRetrying ? (
        <div
          role="status"
          className={cn(
            'rounded-sm p-3 text-sm',
            isFailed ? 'border border-danger/30 bg-danger/10 text-danger' : 'border border-warn/30 bg-warn/10 text-warn',
          )}
        >
          <div className="font-semibold">
            {isRetrying ? 'Full analysis is being retried' : 'Full analysis was not completed'}
          </div>
          <p className="mt-1 text-xs leading-relaxed">
            {error ?? (isRetrying
              ? 'A temporary error occurred. Retrying the same Full-mode analysis.'
              : 'A required agent failed. No partial answer was returned.')}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function AgentNode({
  agent,
  meta,
}: {
  agent: AgentProgress;
  meta: { icon: ReactNode; label: string; tokenClass: string; activeClass: string };
}) {
  const status = agent.status;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative">
        {/* Glowing live radar pulse while running */}
        {status === 'running' && (
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-sm animate-ping opacity-30 bg-brand pointer-events-none"
          />
        )}
        <m.div
          aria-label={`${meta.label} agent: ${status}`}
          animate={status === 'running' ? { scale: [1, 1.04, 1] } : { scale: 1 }}
          transition={status === 'running' ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } : { type: 'spring', stiffness: 400, damping: 25 }}
          className={cn(
            'relative flex size-12 items-center justify-center rounded-sm transition-all border',
            status === 'pending' && 'bg-bg-elev-2 text-fg-subtle border-border/60',
            status === 'running' && cn('text-fg', meta.activeClass),
            status === 'done' && 'bg-bg-elev-2 text-fg border-border/80 shadow-2xs',
            status === 'error' && 'bg-danger/10 text-danger border-danger/40',
          )}
        >
          <span className={cn(status !== 'error' && status !== 'pending' && meta.tokenClass)}>
            {meta.icon}
          </span>

          {/* Status badge pill */}
          {status === 'done' ? (
            <span className={cn('absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-bg-elev-1 border border-border shadow-xs', meta.tokenClass)}>
              <IconCircleCheck className="size-3.5" />
            </span>
          ) : null}
          {status === 'error' ? (
            <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-bg-elev-1 border border-danger/40 text-danger shadow-xs">
              <IconAlertCircle className="size-3.5" />
            </span>
          ) : null}
        </m.div>
      </div>
      <span className="text-caption text-fg-subtle font-medium">{meta.label}</span>
    </div>
  );
}

function ConnectorLines({ agents }: { agents: AgentProgress[] }) {
  const n = agents.length;
  const cx = 50;
  const cy = 20;
  const lines = agents
    .map((a, i) => ({ a, x: n > 0 ? ((i + 0.5) / n) * 100 : 50 }))
    .filter((d) => d.a.status === 'done');

  return (
    <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="h-5 w-full" aria-hidden="true">
      {lines.map((d, i) => (
        <m.line
          key={i}
          x1={d.x}
          y1={0}
          x2={cx}
          y2={cy}
          stroke="var(--color-divider)"
          strokeWidth={0.6}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.4, delay: i * 0.08 }}
        />
      ))}
    </svg>
  );
}

function TelemetryLog({ agents }: { agents: AgentProgress[] }) {
  const lines = useMemo(() => {
    const result: Array<{ line: string; tone: string }> = [];

    result.push({ line: 'agent committee · session active', tone: 'text-fg-subtle' });
    result.push({ line: '', tone: '' });

    for (let i = 0; i < agents.length; i++) {
      const a = agents[i]!;
      const meta = AGENT_META[a.agentName] ?? FALLBACK_META;
      const isLast = i === agents.length - 1;
      const branch = isLast ? '└─' : '├─';

      let statusTag: string;
      let statusTone: string;
      switch (a.status) {
        case 'pending':
          statusTag = '[ PENDING ]';
          statusTone = 'text-fg-subtle/50';
          break;
        case 'running':
          statusTag = '[ RUNNING ]';
          statusTone = 'text-fg-subtle';
          break;
        case 'done':
          statusTag = '[ COMPLETED ]';
          statusTone = 'text-brand';
          break;
        case 'error':
          statusTag = '[ FAILED ]';
          statusTone = 'text-danger';
          break;
      }

      const label = meta.label.padEnd(13, ' ');
      result.push({
        line: `${branch} ${label} ${statusTag}`,
        tone: statusTone,
      });
    }

    const hasRunning = agents.some((a) => a.status === 'running');
    const doneCount = agents.filter((a) => a.status === 'done').length;
    if (hasRunning) {
      result.push({ line: ' │', tone: 'text-fg-subtle' });
      result.push({
        line: ` └─► fusion engine  [ RUNNING ]`,
        tone: 'text-fg-subtle',
      });
    } else if (doneCount > 0 && agents.some((a) => a.status !== 'done' && a.status !== 'error')) {
      result.push({ line: ' │', tone: 'text-fg-subtle' });
      result.push({
        line: ` └─► fusion engine  [ WAITING ]`,
        tone: 'text-fg-subtle/50',
      });
    }

    return result;
  }, [agents]);

  return (
    <div className="bg-bg-elev-1 border border-border rounded-sm overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <IconTerminal2 className="size-3 text-fg-subtle" />
        <span className="text-caption text-fg-subtle font-mono uppercase tracking-wider">
          System Telemetry
        </span>
      </div>
      <div className="px-3 py-2 font-mono text-xs leading-[1.6] select-none overflow-x-auto">
        {lines.map((l, i) => {
          if (!l.line) return <div key={i} className="h-1" />;
          return (
            <div key={i} className={l.tone || 'text-fg-subtle'}>
              {l.line}
            </div>
          );
        })}
        {agents.some((a) => a.status === 'running') ? (
          <span className="terminal-cursor text-fg-subtle">_</span>
        ) : null}
      </div>
    </div>
  );
}

function BiasDistribution({
  counts,
  total,
}: {
  counts: { bullish: number; bearish: number; neutral: number };
  total: number;
}) {
  const rows: Array<{ label: string; count: number; bar: string }> = [
    { label: 'Bull', count: counts.bullish, bar: 'bg-bull' },
    { label: 'Bear', count: counts.bearish, bar: 'bg-bear' },
    { label: 'Neutral', count: counts.neutral, bar: 'bg-fg-muted' },
  ];

  return (
    <div className="flex flex-col gap-1">
      {rows.map((r) => {
        const pct = total > 0 ? (r.count / total) * 100 : 0;
        return (
          <div key={r.label} className="flex items-center gap-2">
            <span className="w-12 text-caption text-fg-subtle uppercase tracking-wide">{r.label}</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-sm bg-bg-elev-3">
              <m.div
                className={cn('h-full rounded-sm', r.bar)}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>
            <span className="text-caption text-fg-muted tabular-nums">{r.count}</span>
          </div>
        );
      })}
    </div>
  );
}
