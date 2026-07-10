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

'use client';

// Phase 1.1 — Cinematic Multi-Agent Committee Theater.
//
// Replaces the flat status pills with a "war room" deliberation surface:
//
//   Zone 1 — Agent ring:     circular avatar nodes that pulse while running,
//                            check off as they complete.
//   Zone 2 — Fusion:         converging connector lines feed a central fusion
//                            node that intensifies as agents finish.
//   Zone 3 — Verdict reveal: once every agent has settled (done/error), a
//                            confidence meter + bias distribution + dissent
//                            indicator is revealed with a spring entrance.
//
// The props interface is unchanged from the previous flat version so
// `chat-screen.tsx` needs no edits.

import { IconAlertCircle,  IconAlertTriangle,  IconRobot,  IconCpu,  IconCircleCheck,  IconNews,  IconShield,  IconTrendingUp } from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';
import type { ReactNode } from 'react';

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
}

const AGENT_META: Record<
  string,
  { icon: ReactNode; label: string; tokenClass: string; glowClass: string }
> = {
  technical: { icon: <IconTrendingUp className="size-4" />, label: 'Technical', tokenClass: 'text-bull', glowClass: 'shadow-none' },
  fundamental: { icon: <IconNews className="size-4" />, label: 'Fundamental', tokenClass: 'text-info', glowClass: 'shadow-none' },
  risk: { icon: <IconShield className="size-4" />, label: 'Risk', tokenClass: 'text-bear', glowClass: '' },
  sentiment: { icon: <IconRobot className="size-4" />, label: 'Sentiment', tokenClass: 'text-warn', glowClass: '' },
  decision: { icon: <IconCpu className="size-4" />, label: 'Decision', tokenClass: 'text-fg', glowClass: 'shadow-none' },
};

const FALLBACK_META = {
  icon: <IconRobot className="size-4" />,
  label: 'Agent',
  tokenClass: 'text-fg-muted',
  glowClass: '',
} as const;

const BIAS_TOKEN: Record<AgentOpinion['bias'], string> = {
  bullish: 'text-bull',
  bearish: 'text-bear',
  neutral: 'text-fg-muted',
};

export function AgentDeliberation({ agents, mode }: AgentDeliberationProps) {
  const hasDone = agents.some((a) => a.status === 'done');
  const allDone = agents.length > 0 && agents.every((a) => a.status === 'done' || a.status === 'error');
  const doneCount = agents.filter((a) => a.status === 'done').length;

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
      className="border border-border bg-bg-elev-1 rounded-sm p-4 flex flex-col gap-4"
    >
      {/* Header */}
      <div className="flex items-center gap-2 text-caption text-fg-subtle uppercase tracking-wider font-semibold">
        <IconCpu className="size-3.5" />
        <span>Multi-Agent {mode} mode</span>
      </div>

      {/* Zone 1 — Agent ring */}
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
              animate={{ scale: [1, 1.25, 1] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              className={cn('size-2 rounded-sm bg-fg shadow-none', doneCount >= 2 && 'size-2.5')}
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
        {allDone ? (
          <m.div
            key="verdict"
            initial={{ opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            aria-label={`Committee verdict: ${dissent ? 'mixed' : opinions[0]?.opinion?.bias ?? 'neutral'}, ${avgConfidence}% confidence`}
            className="border border-border bg-bg-elev-2 rounded-sm p-3 flex flex-col gap-3"
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
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>
            </div>

            {/* Bias distribution + dissent */}
            <div className="flex items-center gap-3">
              <BiasDistribution counts={biasCounts} total={opinions.length} />
              {dissent ? (
                <span className="ml-auto inline-flex items-center gap-1 text-caption text-warn font-semibold">
                  <IconAlertTriangle className="size-3.5" />
                  Mixed signals
                </span>
              ) : null}
            </div>

            {/* Expandable opinions */}
            {opinions.length > 0 ? (
              <details>
                <summary className="cursor-pointer list-none text-body-sm text-fg-muted hover:text-fg select-none">
                  View agent opinions
                </summary>
                <div className="mt-2 flex flex-col gap-2">
                  {opinions.map((a) => {
                    const meta = AGENT_META[a.agentName] ?? FALLBACK_META;
                    const op = a.opinion!;
                    return (
                      <div key={a.agentName} className="border-l-2 border-border pl-3 py-1.5">
                        <span className="text-fg text-body-sm font-semibold">{meta.label}</span>
                        <span className={cn('ml-2 text-caption font-bold uppercase', BIAS_TOKEN[op.bias])}>{op.bias}</span>
                        <span className="ml-1 text-fg-subtle text-caption tabular-nums">{Math.round(op.confidence * 100)}%</span>
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
                  <div key={`error-${a.agentName}`} className="text-danger text-xs flex items-center gap-1.5">
                    <IconAlertCircle className="size-3.5 shrink-0" />
                    <span>{meta.label} agent failed: {a.error}</span>
                  </div>
                );
              })}
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent avatar node
// ---------------------------------------------------------------------------

function AgentNode({
  agent,
  meta,
}: {
  agent: AgentProgress;
  meta: { icon: ReactNode; label: string; tokenClass: string; glowClass: string };
}) {
  const status = agent.status;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        {/* Rotating conic ring while running */}
        {status === 'running' ? (
          <span aria-hidden className="agent-ring-active absolute inset-0 rounded-sm" style={{ padding: 2 }} />
        ) : null}
        <m.div
          aria-label={`${meta.label} agent: ${status}`}
          animate={status === 'running' ? { scale: [1, 1.05, 1] } : { scale: 1 }}
          transition={status === 'running' ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' } : { type: 'spring', stiffness: 400, damping: 25 }}
          className={cn(
            'relative flex size-12 items-center justify-center rounded-sm',
            status === 'pending' && 'bg-bg-elev-2 text-fg-subtle',
            status === 'running' && 'bg-bg-elev-3 text-fg',
            status === 'done' && 'bg-bg-elev-2',
            status === 'error' && 'bg-danger/10 text-danger border border-danger/30',
          )}
        >
          <span className={cn(status !== 'error' && status !== 'pending' && meta.tokenClass)}>{meta.icon}</span>

          {/* Status badges */}
          {status === 'done' ? (
            <span className={cn('absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-sm bg-bg-elev-1', meta.tokenClass)}>
              <IconCircleCheck className="size-4" />
            </span>
          ) : null}
          {status === 'error' ? (
            <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-sm bg-bg-elev-1 text-danger">
              <IconAlertCircle className="size-4" />
            </span>
          ) : null}
        </m.div>
      </div>
      <span className="text-caption text-fg-subtle font-medium">{meta.label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connector lines — fan from each `done` agent column down to a central
// point. Position-independent: x is derived from the agent index, so it
// scales with however many agents are on screen.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Bias distribution — three mini bars (bullish / bearish / neutral).
// ---------------------------------------------------------------------------

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
