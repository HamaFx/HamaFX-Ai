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

// Bespoke renderer for the `run_system_action` tool part.
// Renders an interactive terminal-style DevOps console showing live stdout logs.

import { Terminal, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import type { ToolPartProps } from './registry';

export function RunSystemActionPart({
  output,
  state,
  errorMessage,
}: ToolPartProps<'run_system_action'>) {
  if (state === 'error') {
    return <ErrorCard {...(errorMessage ? { message: errorMessage } : {})} />;
  }
  if (state === 'loading' || !output) {
    return <SkeletonCard />;
  }

  const { action, status, consoleLogs, executionTimeMs, message } = output;

  const isSuccess = status === 'success';

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-xl border p-4 shadow-lg backdrop-blur">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-divider/40 pb-2">
        <div className="flex items-center gap-2">
          <Terminal className="size-4 text-fg-subtle" />
          <div className="flex flex-col">
            <span className="text-fg-subtle text-[9px] uppercase font-bold tracking-wider">
              DevOps Action Console
            </span>
            <h3 className="text-fg text-xs font-bold mt-0.5">
              Task: {action.toUpperCase()}
            </h3>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9px] font-bold ${
          isSuccess ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear'
        }`}>
          {isSuccess ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}
          {isSuccess ? 'COMPLETED' : 'FAILED'}
        </span>
      </header>

      {/* Terminal View */}
      <div className="relative">
        <div className="absolute top-2 right-2 flex items-center gap-1.5 text-[8px] font-mono text-fg-subtle bg-bg-elev-2/80 px-2 py-0.5 rounded border border-divider/20">
          <div className={`size-1.5 rounded-full ${isSuccess ? 'bg-bull animate-pulse' : 'bg-bear'}`} />
          <span>{executionTimeMs}ms</span>
        </div>
        <pre className="bg-black/90 text-green-400 font-mono text-[9px] p-3 rounded-lg overflow-y-auto max-h-48 border border-divider/25 leading-normal select-all">
          <code>
            {consoleLogs.map((line, idx) => {
              let textClass = 'text-green-400';
              if (line.startsWith('[error]')) textClass = 'text-bear font-semibold';
              if (line.startsWith('[resonance-sync]')) textClass = 'text-sky-300';
              if (line.startsWith('[cot-sync]') || line.startsWith('[cache]')) textClass = 'text-amber-300';
              
              return (
                <div key={idx} className={`${textClass} py-0.5 break-all whitespace-pre-wrap`}>
                  {line}
                </div>
              );
            })}
          </code>
        </pre>
      </div>

      {/* Action Summary Message */}
      <div className={`rounded-lg p-2.5 text-[11px] leading-relaxed border ${
        isSuccess ? 'bg-bull/5 border-bull/20 text-fg' : 'bg-bear/5 border-bear/20 text-bear'
      }`}>
        {message}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="border-border bg-bg-elev-1 rounded-xl border p-4 shadow-md" aria-busy="true" aria-label="Executing Task">
      <div className="flex items-center justify-between border-b border-divider/40 pb-2">
        <div className="flex items-center gap-2 w-2/3">
          <Terminal className="size-4 text-fg-subtle animate-pulse" />
          <div className="flex flex-col gap-1 w-full">
            <div className="bg-bg-elev-2 h-2 w-1/4 animate-pulse rounded" />
            <div className="bg-bg-elev-2 h-3.5 w-1/2 animate-pulse rounded mt-0.5" />
          </div>
        </div>
        <div className="bg-bg-elev-2 h-5 w-24 animate-pulse rounded-full" />
      </div>
      <div className="relative mt-3">
        <div className="bg-black/90 h-28 w-full rounded-lg border border-divider/25 flex flex-col justify-center items-center gap-2">
          <Loader2 className="size-5 text-green-400 animate-spin" />
          <span className="text-[9px] font-mono text-green-400 animate-pulse">
            [devops] executing target sync scripts...
          </span>
        </div>
      </div>
    </div>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <div role="alert" className="border-bear/30 bg-bg-elev-1 text-bear rounded-xl border p-4 text-sm font-semibold">
      DevOps execution pipeline failed {message ? ` · ${message}` : ''}
    </div>
  );
}
