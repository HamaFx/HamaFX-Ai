import type { XauusdResearchReport } from './report-types';
import type { XauusdResearchPacket } from './research-types';

export function availableEvidenceIds(packet: XauusdResearchPacket): Set<string> {
  return new Set([
    ...(packet.price ? [packet.price.evidenceId] : []),
    ...packet.candles.map((evidence) => evidence.evidenceId),
    ...packet.indicators.map((evidence) => evidence.evidenceId),
  ]);
}

export function addUnsupportedIds(
  ids: readonly string[],
  available: ReadonlySet<string>,
  findings: string[],
  field: string,
): void {
  for (const id of ids) {
    if (!available.has(id)) findings.push(`${field} references unknown evidence ID: ${id}`);
  }
}

function numericEvidenceValues(packet: XauusdResearchPacket): Map<string, number[]> {
  const values = new Map<string, number[]>();
  if (packet.price) {
    values.set(packet.price.evidenceId, [
      packet.price.data.tick.bid,
      packet.price.data.tick.ask,
      packet.price.data.tick.mid,
    ]);
  }
  for (const evidence of packet.candles) {
    values.set(evidence.evidenceId, evidence.data.candles.flatMap((candle) => [
      candle.o,
      candle.h,
      candle.l,
      candle.c,
    ]));
  }
  for (const evidence of packet.indicators) {
    const indicatorValues: number[] = [];
    for (const result of evidence.data.results) {
      for (const value of result.values) {
        if (typeof value === 'number' && Number.isFinite(value)) indicatorValues.push(value);
        else if (value && typeof value === 'object') {
          for (const nested of Object.values(value)) {
            if (typeof nested === 'number' && Number.isFinite(nested)) indicatorValues.push(nested);
          }
        }
      }
    }
    values.set(evidence.evidenceId, indicatorValues);
  }
  return values;
}

export function verifyNumericClaims(
  report: XauusdResearchReport,
  packet: XauusdResearchPacket,
  findings: string[],
): void {
  const evidenceValues = numericEvidenceValues(packet);
  for (const [index, claim] of report.numericClaims.entries()) {
    const values = evidenceValues.get(claim.evidenceId);
    if (!values) continue;
    const supported = values.some((value) => Math.abs(value - claim.value) <= claim.tolerance);
    if (!supported) {
      findings.push(
        `report.numericClaims[${index}] is not supported by evidence ${claim.evidenceId}: ${claim.label}`,
      );
    }
  }
}
