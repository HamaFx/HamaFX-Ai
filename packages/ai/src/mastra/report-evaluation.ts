import { metrics } from '@kestrel/shared';

import { verifyXauusdReport } from './report-verifier';
import type { XauusdResearchPacket } from './research-types';

export interface XauusdReportEvaluationCase {
  id: string;
  packet: XauusdResearchPacket;
  candidate: unknown;
  expectedValid: boolean;
}

export interface XauusdReportEvaluation {
  id: string;
  expectedValid: boolean;
  actualValid: boolean;
  passed: boolean;
  findings: string[];
}

export interface XauusdReportEvaluationSummary {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
}

/** Run deterministic report-contract cases without calling a model or provider. */
export function evaluateXauusdReportCase(
  testCase: XauusdReportEvaluationCase,
): XauusdReportEvaluation {
  const verification = verifyXauusdReport(testCase.candidate, testCase.packet);
  const actualValid = verification.ok;
  const passed = actualValid === testCase.expectedValid;

  metrics.increment('eval_case_total', {
    tags: {
      suite: 'mastra_xauusd_report',
      result: passed ? 'ok' : 'fail',
    },
  });

  return {
    id: testCase.id,
    expectedValid: testCase.expectedValid,
    actualValid,
    passed,
    findings: verification.findings,
  };
}

export function summarizeXauusdReportEvaluations(
  evaluations: readonly XauusdReportEvaluation[],
): XauusdReportEvaluationSummary {
  const passed = evaluations.filter((evaluation) => evaluation.passed).length;
  return {
    total: evaluations.length,
    passed,
    failed: evaluations.length - passed,
    passRate: evaluations.length === 0 ? 0 : passed / evaluations.length,
  };
}
