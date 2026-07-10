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

import {IconTerminal, IconCircleCheck, IconAlertTriangle, IconLoader2} from '@tabler/icons-react';
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
    <div className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-sm border p-4 shadow-lg ">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-divider pb-2">
        <div className="flex items-center gap-2">
          <IconTerminal className="size-4 text-fg-subtle" />
          <div className="flex flex-col">
            <span className="text-fg-subtle text-xs uppercase font-bold tracking-wider">
              DevOps Action Console
            </span>
            <h3 className="text-fg text-xs font-bold mt-0.5">
              Task: {action.toUpperCase()}
            </h3>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-sm px-2.5 py-0.5 text-xs font-bold ${
          isSuccess ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
        }`}>
          {isSuccess ? <IconCircleCheck className="size-3" /> : <IconAlertTriangle className="size-3" />}
          {isSuccess ? 'COMPLETED' : 'FAILED'}
        </span>
      </header>

      {/* IconTerminal View */}
      <div className="relative">
        <div className="absolute top-2 right-2 flex items-center gap-1.5 text-xs font-mono text-fg-subtle bg-bg-elev-2/80 px-2 py-0.5 rounded-sm border border-divider/50">
          <div className={`size-1.5 rounded-sm ${isSuccess ? 'bg-success animate-pulse' : 'bg-danger'}`} />
          <span>{executionTimeMs}ms</span>
        </div>
        <pre className="bg-bg-elev-2 text-success font-mono text-xs p-3 rounded-sm overflow-y-auto max-h-48 border border-border/25 leading-normal select-all">
          <code>
            {consoleLogs.map((line, idx) => {
              let textClass = 'text-success';
              if (line.startsWith('[error]')) textClass = 'text-danger font-semibold';
              if (line.startsWith('[resonance-sync]')) textClass = 'text-info';
              if (line.startsWith('[cot-sync]') || line.startsWith('[cache]')) textClass = 'text-warn';
              
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
      <div className={`rounded-sm p-2.5 text-body-sm leading-[1.4] border ${
        isSuccess ? 'bg-success/5 border-success/20 text-fg' : 'bg-danger/5 border-danger/20 text-danger'
      }`}>
        {message}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="border-border bg-bg-elev-1 rounded-sm border p-4 shadow-md" aria-busy="true" aria-label="Executing Task">
      <div className="flex items-center justify-between border-b border-divider pb-2">
        <div className="flex items-center gap-2 w-2/3">
          <IconTerminal className="size-4 text-fg-subtle animate-pulse" />
          <div className="flex flex-col gap-1 w-full">
            <div className="bg-bg-elev-2 h-2 w-1/4 animate-pulse rounded-sm" />
            <div className="bg-bg-elev-2 h-3.5 w-1/2 animate-pulse rounded-sm mt-0.5" />
          </div>
        </div>
        <div className="bg-bg-elev-2 h-5 w-24 animate-pulse rounded-sm" />
      </div>
      <div className="relative mt-3">
        <div className="bg-bg-elev-2 h-28 w-full rounded-sm border border-border/25 flex flex-col justify-center items-center gap-2">
          <IconLoader2 className="size-5 text-success animate-spin" />
          <span className="text-xs font-mono text-success animate-pulse">
            [devops] executing target sync scripts...
          </span>
        </div>
      </div>
    </div>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <div role="alert" className="border-danger/30 bg-bg-elev-1 text-danger rounded-sm border p-4 text-sm font-semibold">
      DevOps execution pipeline failed {message ? ` · ${message}` : ''}
    </div>
  );
}
