import { XauusdResearchReportSchema, type XauusdResearchReport } from './report-types';
import { verifyXauusdReport } from './report-verifier';
import type { XauusdResearchPacket } from './research-types';

const TIMEFRAME_CONFLICT_FINDING =
  'The report did not disclose a conflict between timeframe trend signals.';

/**
 * Add only a deterministic disclosure when the verifier has already proved
 * that timeframe signals conflict. No prices, levels, or trading conclusions
 * are generated here.
 */
export function patchTimeframeConflictDisclosure(
  candidate: unknown,
  packet: XauusdResearchPacket,
  findings: readonly string[],
): XauusdResearchReport | null {
  if (findings.length !== 1 || findings[0] !== TIMEFRAME_CONFLICT_FINDING) return null;

  const parsed = XauusdResearchReportSchema.safeParse(candidate);
  if (!parsed.success) return null;

  const patched = {
    ...parsed.data,
    contradictions: [
      ...parsed.data.contradictions,
      'Timeframe trend signals are mixed; higher and lower timeframes do not fully agree.',
    ],
  };
  const verification = verifyXauusdReport(patched, packet);
  return verification.ok ? verification.report : null;
}
