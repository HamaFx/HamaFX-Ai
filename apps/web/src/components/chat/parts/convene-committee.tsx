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

import type { ConveneCommitteeOutput, CommitteeVerdict } from '@hamafx/shared';
import { IconAlertTriangle,  IconBriefcase,  IconCircleCheck,  IconChevronDown,  IconLink as LinkIcon,  IconTrendingUp,  IconUsers,  IconCircleX } from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';

import type { ToolPartProps } from './registry';

const PERSONA_LABELS: Record<
  CommitteeVerdict['persona'],
  { label: string; Icon: Icon }
> = {
  economist: { label: 'Economist', Icon: IconBriefcase },
  technician: { label: 'Technician', Icon: IconTrendingUp },
  risk_manager: { label: 'Risk Manager', Icon: IconAlertTriangle },
};

function GradeBadge({
  grade,
  goNoGo,
}: {
  grade: ConveneCommitteeOutput['grade'];
  goNoGo: ConveneCommitteeOutput['goNoGo'];
}) {
  let bgTone = 'bg-bg-elev-2 text-fg-muted';
  let icon = null;

  if (goNoGo === 'go') {
    bgTone = 'bg-bull/10 text-bull';
    icon = <IconCircleCheck className="mr-1 size-3" />;
  } else if (goNoGo === 'caution') {
    bgTone = 'bg-warn/10 text-warn';
    icon = <IconAlertTriangle className="mr-1 size-3" />;
  } else {
    bgTone = 'bg-bear/10 text-bear';
    icon = <IconCircleX className="mr-1 size-3" />;
  }

  return (
    <div
      className={`flex items-center rounded-sm px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${bgTone}`}
    >
      {icon}
      Grade {grade}
    </div>
  );
}

export function ConveneCommitteePart({
  output,
  state,
  errorMessage,
}: ToolPartProps<'convene_committee'>) {
  if (state === 'error') {
    return <ErrorCard {...(errorMessage ? { message: errorMessage } : {})} />;
  }
  if (state === 'loading' || !output) {
    return <SkeletonCard />;
  }

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-sm border p-3">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconUsers className="text-fg size-4" />
            <h3 className="text-fg text-sm font-semibold">
              Committee Review · {output.symbol} {output.side.toUpperCase()}
            </h3>
          </div>
          <GradeBadge grade={output.grade} goNoGo={output.goNoGo} />
        </div>
        <div className="text-fg-subtle flex items-center gap-4 text-xs tabular-nums">
          <span>
            Entry: <strong className="text-fg">{output.entry}</strong>
          </span>
          {output.stop !== undefined && (
            <span>
              Stop: <strong className="text-fg">{output.stop}</strong>
            </span>
          )}
          {output.target !== undefined && (
            <span>
              Target: <strong className="text-fg">{output.target}</strong>
            </span>
          )}
        </div>
      </header>

      <div className="flex flex-col gap-2">
        {output.verdicts.map((v) => (
          <VerdictCard key={v.persona} verdict={v} />
        ))}
      </div>

      <div className="border-border bg-bg-elev-2 rounded-sm border p-3 text-sm">
        <div className="text-fg-muted mb-1 text-xs font-semibold uppercase tracking-wider">
          Consensus
        </div>
        <p className="text-fg text-sm leading-[1.4]">{output.consensus}</p>
      </div>
    </div>
  );
}

function VerdictCard({ verdict }: { verdict: CommitteeVerdict }) {
  const meta = PERSONA_LABELS[verdict.persona];
  const Icon = meta.Icon;

  const tone =
    verdict.verdict === 'bullish'
      ? 'text-bull'
      : verdict.verdict === 'bearish'
        ? 'text-bear'
        : 'text-fg-muted';

  return (
    <details className="border-border bg-bg-elev-2 group rounded-sm border [&_summary::-webkit-details-marker]:hidden">
      <summary className="focus-visible:ring-fg flex cursor-pointer items-center justify-between rounded-sm p-2.5 outline-none focus-visible:ring-2 focus-visible:ring-inset">
        <div className="flex items-center gap-2">
          <Icon className="text-fg-subtle size-4" />
          <span className="text-fg text-xs font-semibold">{meta.label}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-body-sm font-medium uppercase ${tone}`}>
            {verdict.verdict}
          </span>
          <span className="bg-bg-elev-1 border-border text-fg-subtle rounded-sm border px-1.5 py-0.5 text-caption tabular-nums">
            Conf: {verdict.confidence}/10
          </span>
          <IconChevronDown className="text-fg-subtle size-3.5 transition-transform group-open:rotate-180" />
        </div>
      </summary>

      <div className="px-2.5 pb-2.5 pt-0 text-xs">
        <div className="border-border mt-1 space-y-2 border-t pt-2">
          {verdict.keyPoints.length > 0 && (
            <div>
              <span className="text-fg-muted font-semibold">Key Points:</span>
              <ul className="text-fg mt-1 list-disc space-y-0.5 pl-4">
                {verdict.keyPoints.map((kp, i) => (
                  <li key={i}>{kp}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <div>
              <span className="text-fg-muted font-semibold">Risk:</span>{' '}
              <span className="text-fg">{verdict.risk}</span>
            </div>
            <div>
              <span className="text-fg-muted font-semibold">Rec:</span>{' '}
              <span className="text-fg">{verdict.recommendation}</span>
            </div>
          </div>

          {verdict.persona === 'economist' &&
            verdict.sources &&
            verdict.sources.length > 0 && (
              <div className="pt-1">
                <span className="text-fg-muted flex items-center gap-1 font-semibold">
                  <LinkIcon className="size-3" /> Sources:
                </span>
                <ul className="mt-1 flex flex-wrap gap-2">
                  {verdict.sources.map((src, i) => {
                    let host = src;
                    let isUrl = false;
                    let href = src;
                    try {
                      if (/^(?:https?:\/\/)?(?:[\w-]+\.)+[\w-]+(?:\/[\w- ./?%&=]*)?$/i.test(src)) {
                        isUrl = true;
                        if (!/^https?:\/\//i.test(src)) {
                          href = 'https://' + src;
                        }
                        host = new URL(href).hostname.replace('www.', '');
                      }
                    } catch {
                      isUrl = false;
                    }
                    return (
                      <li key={i}>
                        {isUrl ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-fg inline-block max-w-[200px] align-bottom text-body-sm hover:underline truncate"
                          >
                            {host}
                          </a>
                        ) : (
                          <span className="text-fg-subtle text-body-sm">{src}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
        </div>
      </div>
    </details>
  );
}

function SkeletonCard() {
  return (
    <div
      className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-sm border p-3"
      aria-busy="true"
      aria-label="Convening committee"
    >
      <div className="flex items-center justify-between">
        <div className="bg-bg-elev-2 h-5 w-1/3 animate-pulse rounded-sm" />
        <div className="bg-bg-elev-2 h-5 w-16 animate-pulse rounded-sm" />
      </div>
      <div className="flex gap-2">
        <div className="bg-bg-elev-2 h-4 w-20 animate-pulse rounded-sm" />
        <div className="bg-bg-elev-2 h-4 w-20 animate-pulse rounded-sm" />
      </div>
      <div className="flex flex-col gap-2">
        <div className="bg-bg-elev-2 h-10 animate-pulse rounded-sm" />
        <div className="bg-bg-elev-2 h-10 animate-pulse rounded-sm" />
        <div className="bg-bg-elev-2 h-10 animate-pulse rounded-sm" />
      </div>
      <div className="bg-bg-elev-2 h-16 animate-pulse rounded-sm" />
    </div>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-danger/30 bg-bg-elev-1 text-danger rounded-sm border p-3 text-sm"
    >
      Committee convening failed{message ? ` · ${message}` : ''}
    </div>
  );
}
