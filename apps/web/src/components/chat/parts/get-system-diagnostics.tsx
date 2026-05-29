'use client';

// Bespoke renderer for the `get_system_diagnostics` tool part.
// Renders an elegant diagnostic dashboard displaying copilot operational stats.

import { Activity, CheckCircle, Database, Cpu, Wallet, AlertTriangle } from 'lucide-react';
import type { ToolPartProps } from './registry';

export function GetSystemDiagnosticsPart({
  output,
  state,
  errorMessage,
}: ToolPartProps<'get_system_diagnostics'>) {
  if (state === 'error') {
    return <ErrorCard {...(errorMessage ? { message: errorMessage } : {})} />;
  }
  if (state === 'loading' || !output) {
    return <SkeletonCard />;
  }

  const { status, database, worker, budget, envCheck, narrative, asOf } = output;

  // Status mapping
  let statusColor = 'text-fg';
  let statusBg = 'bg-bg-elev-3';
  let StatusIcon = Activity;

  if (status === 'healthy') {
    statusColor = 'text-bull';
    statusBg = 'bg-bull/10';
    StatusIcon = CheckCircle;
  } else if (status === 'degraded') {
    statusColor = 'text-amber-500';
    statusBg = 'bg-amber-500/10';
    StatusIcon = AlertTriangle;
  } else if (status === 'unhealthy') {
    statusColor = 'text-bear';
    statusBg = 'bg-bear/10';
    StatusIcon = AlertTriangle;
  }

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-4 rounded-xl border p-4 shadow-md backdrop-blur">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-divider/40 pb-2">
        <div className="flex flex-col">
          <span className="text-fg-subtle text-[10px] uppercase font-bold tracking-wider">
            Copilot Diagnostic Node
          </span>
          <h3 className="text-fg text-sm font-bold mt-0.5">
            System Telemetry & Health
          </h3>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9px] font-bold ${statusBg} ${statusColor}`}>
          <StatusIcon className="size-3" />
          {status.toUpperCase()}
        </span>
      </header>

      {/* Latency & Spend Highlights */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-bg-elev-2/50 rounded-lg p-2 border border-divider/25 flex flex-col items-center justify-center">
          <Database className="size-4 text-fg-subtle mb-1" />
          <span className="text-fg-subtle text-[8px] uppercase font-medium">DB Latency</span>
          <span className="text-fg text-xs font-extrabold mt-0.5 tabular-nums">
            {database.latencyMs >= 0 ? `${database.latencyMs}ms` : 'offline'}
          </span>
        </div>
        <div className="bg-bg-elev-2/50 rounded-lg p-2 border border-divider/25 flex flex-col items-center justify-center">
          <Wallet className="size-4 text-fg-subtle mb-1" />
          <span className="text-fg-subtle text-[8px] uppercase font-medium">AI Spend Today</span>
          <span className="text-fg text-xs font-extrabold mt-0.5 tabular-nums">
            ${budget.spentUsd.toFixed(2)}
          </span>
        </div>
        <div className="bg-bg-elev-2/50 rounded-lg p-2 border border-divider/25 flex flex-col items-center justify-center">
          <Cpu className="size-4 text-fg-subtle mb-1" />
          <span className="text-fg-subtle text-[8px] uppercase font-medium">Vector Memory</span>
          <span className="text-fg text-xs font-extrabold mt-0.5 tabular-nums">
            {database.memoryEmbeddingsCount} nodes
          </span>
        </div>
      </div>

      {/* Database Record Volumes */}
      <div className="flex flex-col gap-2">
        <h4 className="text-fg-subtle text-[9px] font-bold uppercase tracking-wider">Database Segment Volumes</h4>
        <div className="grid grid-cols-2 gap-2 border-t border-divider/20 pt-2 text-[10px]">
          <div className="flex justify-between py-0.5">
            <span className="text-fg-muted">Journal Entries:</span>
            <span className="text-fg font-medium tabular-nums">{database.journalEntriesCount}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-fg-muted">Market Closes:</span>
            <span className="text-fg font-medium tabular-nums">{database.snapshotsCount}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-fg-muted">Briefings Archive:</span>
            <span className="text-fg font-medium tabular-nums">{database.briefingsCount}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-fg-muted">Intermarket Resonance:</span>
            <span className="text-fg font-medium tabular-nums">{database.resonanceCount}</span>
          </div>
        </div>
      </div>

      {/* Environment Config Checks */}
      <div className="flex flex-col gap-2">
        <h4 className="text-fg-subtle text-[9px] font-bold uppercase tracking-wider">Environment Integrations</h4>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-divider/20 pt-2 text-[9px]">
          {Object.entries(envCheck).map(([key, configured]) => (
            <div key={key} className="flex items-center justify-between py-0.5">
              <span className="text-fg-muted font-mono">{key}</span>
              <span className={`px-1.5 py-0.5 rounded font-bold ${configured ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear'}`}>
                {configured ? 'OK' : 'MISSING'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Background Jobs Sync Log */}
      <div className="flex flex-col gap-2">
        <h4 className="text-fg-subtle text-[9px] font-bold uppercase tracking-wider">Background Sync Status</h4>
        <div className="flex flex-col gap-1 border-t border-divider/20 pt-2 text-[10px]">
          <div className="flex justify-between py-0.5">
            <span className="text-fg-muted">FRED Opportunity Cost Sync:</span>
            <span className="text-fg font-semibold tabular-nums">
              {worker.resonanceSyncLastRun ? `Active (${worker.resonanceSyncLastRun})` : 'Pending execution'}
            </span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-fg-muted">COT Report Sync:</span>
            <span className="text-fg font-semibold tabular-nums">
              {worker.cotSyncLastRun ? `Active (${worker.cotSyncLastRun})` : 'Pending execution'}
            </span>
          </div>
        </div>
      </div>

      <p className="text-fg-muted text-[11px] leading-normal border-t border-divider/20 pt-2.5">
        {narrative}
      </p>
      <footer className="text-fg-subtle text-[8px] text-right mt-[-4px]">
        Diagnostic probe run at: {new Date(asOf).toLocaleTimeString()}
      </footer>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="border-border bg-bg-elev-1 rounded-xl border p-4 shadow-md" aria-busy="true" aria-label="Querying Diagnostics">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1 w-2/3">
          <div className="bg-bg-elev-2 h-3 w-1/3 animate-pulse rounded" />
          <div className="bg-bg-elev-2 h-4 w-2/3 animate-pulse rounded mt-1" />
        </div>
        <div className="bg-bg-elev-2 h-5 w-20 animate-pulse rounded-full" />
      </div>
      <div className="grid grid-cols-3 gap-3 mt-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-bg-elev-2 h-12 animate-pulse rounded-lg" />
        ))}
      </div>
      <div className="bg-bg-elev-2 h-16 w-full animate-pulse rounded-lg mt-4" />
    </div>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <div role="alert" className="border-bear/30 bg-bg-elev-1 text-bear rounded-xl border p-4 text-sm font-semibold">
      Operational diagnostics probe failed {message ? ` · ${message}` : ''}
    </div>
  );
}
