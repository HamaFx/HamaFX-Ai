'use client';

import type { MastraScenarioView } from './mastra-report-schema';

interface MastraReportScenariosProps {
  scenarios: MastraScenarioView[];
}

export function MastraReportScenarios({ scenarios }: MastraReportScenariosProps) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {scenarios.map((scenario) => {
        const tone = scenario.direction === 'bullish'
          ? 'border-bull/30 bg-bull/5'
          : scenario.direction === 'bearish'
            ? 'border-bear/30 bg-bear/5'
            : 'border-border bg-bg-elev-1';
        return (
          <section key={`${scenario.name}-${scenario.direction}`} className={`rounded-sm border p-3 ${tone}`}>
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-fg">{scenario.name}</h4>
              <span className="text-caption font-semibold uppercase tracking-wide text-fg-subtle">
                {scenario.direction}
              </span>
            </div>
            <dl className="mt-2 space-y-1.5 text-xs leading-relaxed">
              <div>
                <dt className="font-semibold text-fg-subtle">Trigger</dt>
                <dd className="text-fg-muted">{scenario.trigger}</dd>
              </div>
              <div>
                <dt className="font-semibold text-fg-subtle">Invalidation</dt>
                <dd className="text-fg-muted">{scenario.invalidation}</dd>
              </div>
            </dl>
            {scenario.targets.length > 0 ? (
              <p className="mt-2 text-xs text-fg-muted">
                <span className="font-semibold text-fg-subtle">Targets:</span>{' '}
                {scenario.targets.join(' · ')}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-fg-muted">
              <span className="font-semibold text-fg-subtle">Risks:</span>{' '}
              {scenario.risks.join(' · ')}
            </p>
          </section>
        );
      })}
    </div>
  );
}
