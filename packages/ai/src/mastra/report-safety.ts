import type { XauusdResearchReport } from './report-types';
import type { XauusdResearchPacket } from './research-types';

function latestNumeric(
  values: readonly (number | Record<string, number | null> | null)[],
): number | null {
  for (let index = values.length - 1; index >= 0; index--) {
    const value = values[index];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function hasTimeframeTrendConflict(packet: XauusdResearchPacket): boolean {
  const directions = new Set<number>();
  for (const evidence of packet.indicators) {
    const fast = evidence.data.results.find(
      (result) => result.kind === 'ema' && result.params.period === 20,
    );
    const slow = evidence.data.results.find(
      (result) => result.kind === 'ema' && result.params.period === 50,
    );
    const fastValue = fast ? latestNumeric(fast.values) : null;
    const slowValue = slow ? latestNumeric(slow.values) : null;
    if (fastValue !== null && slowValue !== null && fastValue !== slowValue) {
      directions.add(fastValue > slowValue ? 1 : -1);
    }
  }
  return directions.size > 1;
}

export function verifyReportSafety(
  report: XauusdResearchReport,
  packet: XauusdResearchPacket,
  findings: string[],
): void {
  if (packet.status === 'blocked') {
    findings.push('The research packet is blocked because required market data is missing.');
  }
  if (packet.dataQuality !== 'complete' && report.dataQuality === 'complete') {
    findings.push('The report claims complete data quality despite degraded or partial evidence.');
  }
  if (packet.missingData.length > 0 && report.missingData.length === 0) {
    findings.push('The report omitted known missing-data warnings from the research packet.');
  }
  if (packet.dataQuality !== 'complete' && report.confidence > 0.75) {
    findings.push('Confidence is too high for partial or degraded evidence.');
  }
  if (report.scenarios.some((scenario) => scenario.invalidation.trim().length === 0)) {
    findings.push('Every scenario must include an invalidation condition.');
  }
  if (report.scenarios.some((scenario) => scenario.risks.length === 0)) {
    findings.push('Every scenario must include at least one risk.');
  }
  if (
    hasTimeframeTrendConflict(packet) &&
    !report.contradictions.some((text) => /timeframe|conflict|mixed|diverg/i.test(text))
  ) {
    findings.push('The report did not disclose a conflict between timeframe trend signals.');
  }
}
