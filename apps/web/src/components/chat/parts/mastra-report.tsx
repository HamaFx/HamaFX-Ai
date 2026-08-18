'use client';

import { IconAlertTriangle, IconCircleCheck, IconClock, IconDatabase } from '@tabler/icons-react';

import { MastraReportScenarios } from './mastra-report-scenarios';
import {
  MastraReportMetaSchema,
  type MastraReportMetaView,
  type MastraReportView,
} from './mastra-report-schema';

export function MastraReportPart({ data }: { data: unknown }) {
  const parsed = MastraReportMetaSchema.safeParse(data);
  if (!parsed.success) return null;
  return <MastraReportCard meta={parsed.data} />;
}

export function MastraReportCard({ meta }: { meta: MastraReportMetaView }) {
  const report = meta.report;
  const isBlocked = meta.researchStatus === 'blocked' || !report;
  const qualityWarning = meta.dataQuality !== 'complete';

  return (
    <section
      role="region"
      aria-label="Verified XAUUSD report"
      className="mt-3 flex flex-col gap-3 rounded-sm border border-border bg-bg-elev-1 p-3"
      data-testid="mastra-report-card"
      data-mastra-agent="mastra-xauusd"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconDatabase className="size-4 text-fg-muted" aria-hidden="true" />
          <span
            className="rounded-sm border border-bull/30 bg-bull/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-bull"
            data-testid="mastra-agent-badge"
          >
            Mastra
          </span>
          <h3 className="text-sm font-semibold text-fg">Verified XAUUSD report</h3>
        </div>
        <div className="flex items-center gap-2 text-caption text-fg-subtle">
          <span>{meta.providerId}</span>
          <span aria-hidden="true">·</span>
          <span>{formatModel(meta.modelId)}</span>
        </div>
      </header>

      {isBlocked || !report ? (
        <div role="alert" className="flex items-start gap-2 rounded-sm border border-warn/30 bg-warn/5 p-2 text-xs text-warn">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>Analysis stopped because required market evidence was unavailable. No report was generated.</span>
        </div>
      ) : (
        <ReportBody report={report} qualityWarning={qualityWarning} />
      )}

      <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 text-caption text-fg-subtle">
        <span className="inline-flex items-center gap-1">
          <IconClock className="size-3" aria-hidden="true" />
          Run data: {meta.packetId}
        </span>
        <span>Quality: {meta.dataQuality}</span>
        <span>Cost: ${meta.observedCost.toFixed(4)}</span>
      </footer>
    </section>
  );
}

function ReportBody({ report, qualityWarning }: { report: MastraReportView; qualityWarning: boolean }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-sm border border-border bg-bg-elev-2 px-2 py-1 text-xs font-semibold uppercase text-fg">
          {report.bias}
        </span>
        <span className="text-xs text-fg-muted">{Math.round(report.confidence * 100)}% confidence</span>
        <span className="text-xs text-fg-muted">Regime: {report.regime}</span>
        {qualityWarning ? (
          <span className="inline-flex items-center gap-1 rounded-sm border border-warn/30 bg-warn/5 px-2 py-1 text-caption font-semibold text-warn">
            <IconAlertTriangle className="size-3" aria-hidden="true" />
            {report.dataQuality} data
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-caption text-bull">
            <IconCircleCheck className="size-3" aria-hidden="true" />
            complete data
          </span>
        )}
      </div>

      <p className="text-sm leading-relaxed text-fg">{report.bottomLine}</p>

      <div className="grid gap-2 sm:grid-cols-2">
        <Summary label="Technical" text={report.technicalSummary} />
        <Summary label="Fundamental" text={report.fundamentalSummary} />
      </div>

      <MastraReportScenarios scenarios={report.scenarios} />

      {report.contradictions.length > 0 || report.missingData.length > 0 ? (
        <div className="rounded-sm border border-warn/30 bg-warn/5 p-3 text-xs text-fg-muted">
          <h4 className="font-semibold text-warn">Warnings and limitations</h4>
          {report.contradictions.length > 0 ? (
            <List label="Conflicting signals" items={report.contradictions} />
          ) : null}
          {report.missingData.length > 0 ? (
            <List label="Missing data" items={report.missingData} />
          ) : null}
        </div>
      ) : null}

      <details className="text-xs text-fg-muted">
        <summary className="flex cursor-pointer items-center gap-1 font-semibold hover:text-fg">
          Sources and timestamps
        </summary>
        <ul className="mt-2 space-y-1 pl-4">
          {report.sources.map((source) => (
            <li key={source.evidenceId}>
              <span className="font-mono text-fg-subtle">{source.evidenceId}</span>{' '}
              {source.source} · {formatTimestamp(source.dataAsOf)}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}

function Summary({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-sm border border-border bg-bg-elev-2 p-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{label}</h4>
      <p className="mt-1 text-xs leading-relaxed text-fg-muted">{text}</p>
    </div>
  );
}

function List({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mt-2">
      <span className="font-semibold text-fg-subtle">{label}</span>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function formatModel(model: string): string {
  const tail = model.includes('/') ? model.slice(model.lastIndexOf('/') + 1) : model;
  return tail.replace(/[-_]/g, ' ');
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
