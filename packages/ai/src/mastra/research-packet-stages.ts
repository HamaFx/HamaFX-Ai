import { completeStep, recordStep } from '../diagnostics';
import { logErrorContext } from '@kestrel/shared/logger';

export function startResearchStage(name: string, metadata: Record<string, unknown>): void {
  recordStep(`mastra_xauusd_research.${name}`, metadata);
}

export function completeResearchStage(
  name: string,
  status: 'completed' | 'failed',
  metadata: Record<string, unknown>,
): void {
  completeStep(`mastra_xauusd_research.${name}`, status, undefined, metadata);
}

export function recordResearchStageFailure(
  name: string,
  error: unknown,
  metadata: Record<string, unknown>,
): void {
  completeResearchStage(name, 'failed', metadata);
  logErrorContext(error, `mastra_xauusd_research.${name}`, metadata, 'ai');
}

export function warningForResearchFailure(scope: string): string {
  return `${scope} could not be collected; numeric claims for this scope are blocked.`;
}

export function uniqueResearchValues(values: readonly string[]): string[] {
  return [...new Set(values)];
}
