import type { XauusdResearchReport } from './report-types';
import type { XauusdResearchPacket } from './research-types';

export function availableEvidenceIds(packet: XauusdResearchPacket): Set<string> {
  return new Set([
    ...(packet.price ? [packet.price.evidenceId] : []),
    ...packet.candles.map((evidence) => evidence.evidenceId),
    ...packet.indicators.map((evidence) => evidence.evidenceId),
    ...(packet.macro ? [packet.macro.evidenceId] : []),
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
    values.set(
      evidence.evidenceId,
      evidence.data.candles.flatMap((candle) => [candle.o, candle.h, candle.l, candle.c]),
    );
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
  if (packet.macro) {
    values.set(packet.macro.evidenceId, [
      ...packet.macro.data.dollarIndex.map((item) => item.value),
      ...packet.macro.data.realYields.map((item) => item.value),
      ...packet.macro.data.breakevenInflation.map((item) => item.value),
      ...packet.macro.data.events.flatMap((item) =>
        [item.actual, item.forecast, item.previous].filter(
          (value): value is number => value !== null,
        ),
      ),
    ]);
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
    if (isStructuralParameterClaim(claim)) continue;
    if (isScenarioProjectionClaim(claim)) continue;
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

const STRUCTURAL_PARAMETER_LABEL =
  /(\b(?:period|threshold|length|window|bars|lookback|periods|band|multiplier|offset)\b|\b(?:ema|sma|rsi|atr|macd|bollinger|bb|vwap|supertrend|stochastic)\b)/i;

/**
 * Indicator configuration is structural metadata, not a market fact. When a
 * model labels a small-integer claim with parameter wording (for example
 * "EMA Period 20", "RSI Threshold 70", or "MACD 12/26/9"), it is describing
 * how an indicator was calculated, not claiming that 20 or 70 is an observed
 * market value. Those claims must not fail against indicator readings.
 *
 * The guard is deliberately conservative: the value must be a small integer
 * and the label must contain explicit parameter wording, so an invented
 * price labelled "EMA Period" cannot bypass numeric grounding.
 */
function isStructuralParameterClaim(claim: { label: string; value: number }): boolean {
  return (
    Number.isInteger(claim.value) &&
    claim.value >= 1 &&
    claim.value <= 500 &&
    STRUCTURAL_PARAMETER_LABEL.test(claim.label)
  );
}

const SCENARIO_PROJECTION_LABEL =
  /\b(?:target|entry(?:\s+zone)?|invalidation|trigger|take.?profit|stop.?loss|\btp\b|\bsl\b)\b/i;

/**
 * Scenario targets, entry zones, invalidation levels, and triggers are
 * forward-looking projections, not observed market facts. They cite evidence
 * via the scenario's evidenceIds (validated separately), but their numeric
 * value is a proposal and must not be required to exactly match a candle or
 * price reading. This keeps strict grounding for factual claims while
 * allowing the model to propose scenarios using scenario language.
 */
function isScenarioProjectionClaim(claim: { label: string }): boolean {
  return SCENARIO_PROJECTION_LABEL.test(claim.label);
}

const STRUCTURAL_NUMERIC_PATTERN =
  /(?:\b\d+(?:\s*[- ]?(?:minute|hour|day|week|year)s?)\b|\b\d+(?:m|h|d|w|y)\b|\b(?:ema|rsi|atr|bollinger(?:\s+bands)?|bb|macd)\s*\d+(?:\s*\/\s*\d+)*\b|\b\d+(?:\s*\/\s*\d+)+\s*(?:ema|sma|ma|macd)\b)/gi;
const NARRATIVE_NUMBER_PATTERN = /[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g;

type NarrativeField = readonly [name: string, text: string];

function narrativeFields(report: XauusdResearchReport): NarrativeField[] {
  const fields: NarrativeField[] = [
    ['bottomLine', report.bottomLine],
    ['regime', report.regime],
    ['technicalSummary', report.technicalSummary],
    ['fundamentalSummary', report.fundamentalSummary],
    ...report.contradictions.map((text, index) => [`contradictions[${index}]`, text] as const),
    ...report.missingData.map((text, index) => [`missingData[${index}]`, text] as const),
  ];

  report.scenarios.forEach((scenario, index) => {
    // Scenario trigger, entryZone, targets, and invalidation are projections,
    // not factual claims: their numbers are exempt from narrative grounding
    // and are instead anchored by scenario.evidenceIds (validated separately).
    fields.push(
      [`scenarios[${index}].name`, scenario.name],
      ...scenario.risks.map(
        (text, riskIndex) => [`scenarios[${index}].risks[${riskIndex}]`, text] as const,
      ),
    );
  });

  return fields;
}

function structuralNumericRanges(text: string): Array<readonly [start: number, end: number]> {
  return [...text.matchAll(STRUCTURAL_NUMERIC_PATTERN)].map(
    (match) => [match.index ?? 0, (match.index ?? 0) + match[0].length] as const,
  );
}

function narrativeNumbers(text: string): number[] {
  const structuralRanges = structuralNumericRanges(text);
  return [...text.matchAll(NARRATIVE_NUMBER_PATTERN)]
    .filter((match) => {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      return !structuralRanges.some(
        ([rangeStart, rangeEnd]) => start >= rangeStart && end <= rangeEnd,
      );
    })
    .map((match) => Number(match[0].replaceAll(',', '')))
    .filter((value) => Number.isFinite(value));
}

/**
 * Narrative text may explain a verified number, but it cannot introduce a
 * second numeric channel. Timeframe and indicator-period notation is
 * structural context; every other numeric value must match a verified claim.
 *
 * Scenario trigger/entryZone/targets/invalidation fields are deliberately
 * excluded: those are forward-looking projections anchored by evidence IDs
 * rather than exact-value matches.
 */
export function verifyNarrativeNumericClaims(
  report: XauusdResearchReport,
  findings: string[],
): void {
  const claims = report.numericClaims.map((claim) => ({
    value: claim.value,
    tolerance: claim.tolerance,
  }));
  const reported = new Set<string>();

  for (const [field, text] of narrativeFields(report)) {
    for (const value of narrativeNumbers(text)) {
      const key = `${field}:${value}`;
      if (reported.has(key)) continue;
      reported.add(key);
      const supported = claims.some((claim) => Math.abs(claim.value - value) <= claim.tolerance);
      if (!supported) {
        findings.push(
          `${field} contains unsupported numeric value ${value}; add it to numericClaims with supporting evidence.`,
        );
      }
    }
  }
}
