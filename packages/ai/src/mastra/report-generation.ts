import type { Agent } from '@mastra/core/agent';
import type { AgentMemoryOption } from '@mastra/core/agent';
import type { RequestContext } from '@mastra/core/request-context';

import { telemetryConfig } from '../telemetry';
import { guardXauusdFollowupText } from './followup-safety';
import { XauusdResearchReportSchema, type XauusdResearchReport } from './report-types';
import { XauusdReportVerificationError } from './report-verifier';
import type { XauusdResearchPacket } from './research-types';
import type { MastraGenerationResultLike } from './stats';
import type { xauusdMastraTools } from './tools';
import type { XauusdRequestContext } from './types';

export type XauusdReportGenerationResult = Awaited<ReturnType<typeof generateXauusdReport>>;

/** Generate a plain-text explanation of a previously verified report. */
export async function generateXauusdFollowup(
  agent: Agent<string, typeof xauusdMastraTools, undefined, XauusdRequestContext>,
  prompt: string,
  requestContext: RequestContext<XauusdRequestContext>,
  providerId: string,
  report: XauusdResearchReport,
  packet: XauusdResearchPacket,
  signal?: AbortSignal,
  memory?: AgentMemoryOption,
): Promise<MastraGenerationResultLike> {
  const result = await agent.generate(prompt, {
    requestContext,
    toolChoice: 'none',
    maxSteps: 1,
    ...(memory ? { memory } : {}),
    ...telemetryConfig({
      functionId: 'mastra.xauusd.followup',
      metadata: { provider: providerId },
    }),
    ...(signal ? { abortSignal: signal } : {}),
  });
  return {
    text: guardXauusdFollowupText(result.text, report, packet),
    ...(result.totalUsage ? { totalUsage: result.totalUsage } : {}),
    ...(result.usage ? { usage: result.usage } : {}),
    ...(result.toolCalls ? { toolCalls: result.toolCalls } : {}),
    ...(result.steps ? { steps: result.steps } : {}),
  };
}

export async function generateXauusdReport(
  agent: Agent<string, typeof xauusdMastraTools, undefined, XauusdRequestContext>,
  prompt: string,
  requestContext: RequestContext<XauusdRequestContext>,
  providerId: string,
  signal?: AbortSignal,
  memory?: AgentMemoryOption,
) {
  return agent.generate(prompt, {
    requestContext,
    // The packet has already been collected deterministically. Prevent the
    // synthesis step from fetching a different snapshot or inventing a path.
    toolChoice: 'none',
    maxSteps: 1,
    ...(memory ? { memory } : {}),
    structuredOutput: {
      schema: XauusdResearchReportSchema,
      jsonPromptInjection: 'auto',
      instructions: [
        'Return every required field in the schema; never omit fields with arrays.',
        'evidenceIds must be a non-empty array containing the cited evidence IDs.',
        'sources must be a non-empty array with evidenceId, source, and ISO dataAsOf for each source.',
        'Use the macro evidence for fundamentalSummary when it is present; if macro evidence is partial, explicitly name the missing categories.',
        'numericClaims must contain only concrete market values you state: current price, indicator reading, or an observed candle high/low/open/close. Do not place years, counts, offsets, percentages, or arbitrary numbers there. Each entry needs label, value, and evidenceId; omit tolerance because it is optional and defaults to a small rounding window.',
        'Scenario trigger, entryZone, targets, and invalidation are forward-looking projections, not observed facts. Put them only in the scenario fields, never in numericClaims, and anchor each scenario to the evidence it is derived from through scenario.evidenceIds.',
        'Include at least two scenarios, and every scenario must include trigger, invalidation, risks, and evidenceIds.',
        'List meaningful conflicts between timeframes or evidence in contradictions; do not leave contradictions empty when the packet shows conflicting signals.',
        'Return only the structured object; do not substitute prose for required arrays.',
      ].join('\n'),
    },
    ...telemetryConfig({
      functionId: 'mastra.xauusd.report',
      metadata: { provider: providerId },
    }),
    ...(signal ? { abortSignal: signal } : {}),
  });
}

export function repairPrompt(prompt: string, findings: readonly string[]): string {
  return [
    prompt,
    '',
    'The previous structured report failed deterministic verification.',
    'Return a corrected complete report using the same trusted packet.',
    'Do not remove evidence or lower disclosure quality to bypass verification.',
    `Verification findings to fix:\n${findings.map((finding) => `- ${finding}`).join('\n')}`,
  ].join('\n');
}

export function verificationFindings(error: unknown): readonly string[] | null {
  if (error instanceof XauusdReportVerificationError) return error.findings;
  if (typeof error === 'object' && error !== null && 'findings' in error) {
    const findings = (error as { findings?: unknown }).findings;
    if (Array.isArray(findings) && findings.every((finding) => typeof finding === 'string')) {
      return findings;
    }
  }

  // Mastra's structured-output handler rejects the object before our verifier
  // runs and wraps the ZodError as `cause` (with `issues`). Treat those issues
  // as repair findings so the repair loop can retry instead of failing closed
  // on a single malformed or underspecified structured output.
  const candidates = [
    typeof error === 'object' && error !== null
      ? (error as { issues?: unknown }).issues
      : undefined,
    typeof error === 'object' && error !== null && 'cause' in error
      ? ((error as { cause?: unknown }).cause as { issues?: unknown } | null | undefined)?.issues
      : undefined,
  ];
  for (const issues of candidates) {
    if (!Array.isArray(issues)) continue;
    const findings = issues
      .filter(
        (issue): issue is { path?: readonly (string | number)[]; message?: unknown } =>
          typeof issue === 'object' && issue !== null,
      )
      .map((issue) => {
        const path = issue.path?.join('.') || 'report';
        return `${path}: ${String(issue.message ?? 'invalid')}`;
      });
    if (findings.length > 0) return findings;
  }
  return null;
}


