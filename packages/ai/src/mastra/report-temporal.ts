import type { XauusdResearchReport } from './report-types';
import type { XauusdResearchPacket } from './research-types';

export function verifyTemporalDisclosure(
  report: XauusdResearchReport,
  packet: XauusdResearchPacket,
  findings: string[],
): void {
  const reportTime = Date.parse(report.asOf);
  const packetTime = Date.parse(packet.generatedAt);
  if (reportTime > packetTime + 5_000) {
    findings.push('The report timestamp is later than the research packet by more than five seconds.');
  }

  const hasStaleEvidence = packet.warnings.some((warning) => /\bstale\b/i.test(warning));
  if (hasStaleEvidence) {
    const disclosure = [...report.missingData, ...report.contradictions]
      .some((text) => /\bstale\b|outdated|freshness/i.test(text));
    if (!disclosure) findings.push('The report did not disclose stale or outdated evidence.');
  }
}
