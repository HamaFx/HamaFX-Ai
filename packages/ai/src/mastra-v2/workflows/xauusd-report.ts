// SPDX-License-Identifier: Apache-2.0

/**
 * XAUUSD verified-report workflow (Phase 2).
 *
 * Graph:
 *
 *   collect-packet (deterministic, fail closed on blocked)
 *     → generate (structured output, no tools — deterministic packet only)
 *     → repair (bounded dowhile: re-generate with verifier findings, then
 *               re-verify; each attempt is an observable workflow step)
 *     → finalize (ready, deterministic disclosure patch, or terminal error)
 *
 * Every repair attempt and verification result is a workflow step, so the
 * repair loop is observable as run snapshots (Studio) instead of an opaque
 * in-process loop. The workflow is a per-request factory: the BYOK agent,
 * memory, provider id, and abort signal are closed over at build time.
 */

import { metrics } from '@kestrel/shared';
import type { Mastra } from '@mastra/core';
import type { Agent } from '@mastra/core/agent';
import type { AgentMemoryOption } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';
import { Workflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';

import { generateXauusdReport, repairPrompt, verificationFindings } from '../../mastra/report-generation';
import { patchTimeframeConflictDisclosure } from '../../mastra/report-repair';
import { blockedXauusdResearchText } from '../../mastra/report-text';
import { XauusdResearchReportSchema, type XauusdResearchReport } from '../../mastra/report-types';
import { requireVerifiedXauusdReport, XauusdReportVerificationError } from '../../mastra/report-verifier';
import { collectXauusdResearchPacket } from '../../mastra/research-packet';
import { XauusdResearchPacketSchema, type XauusdResearchPacket } from '../../mastra/research-types';
import type { MastraGenerationResultLike } from '../../mastra/stats';
import { getMastraGenerationStats, type MastraGenerationStats } from '../../mastra/telemetry';
import { XauusdRequestContextSchema, type XauusdRequestContext } from '../../mastra/types';
import type { xauusdMastraTools } from '../../mastra/tools';

const StatsSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  toolCalls: z.number(),
  steps: z.number(),
});

const zeroStats = (): MastraGenerationStats => ({
  inputTokens: 0,
  outputTokens: 0,
  toolCalls: 0,
  steps: 0,
});

export const XauusdReportWorkflowInputSchema = z.object({
  prompt: z.string().min(1),
});

const CollectPacketOutputSchema = z.object({
  packet: XauusdResearchPacketSchema,
  prompt: z.string().min(1),
});

const GenerationStepOutputSchema = z.object({
  verified: z.boolean(),
  report: XauusdResearchReportSchema.nullable(),
  result: z.unknown(),
  findings: z.array(z.string()),
  attempt: z.number().int().positive(),
  stats: StatsSchema,
});

export const XauusdReportWorkflowOutputSchema = z.object({
  status: z.enum(['ready', 'blocked']),
  blockedText: z.string().optional(),
  report: XauusdResearchReportSchema.nullable().optional(),
  result: z.unknown().optional(),
  packet: XauusdResearchPacketSchema,
  attempts: z.number().int().nonnegative().optional(),
  stats: StatsSchema,
});

export interface XauusdReportWorkflowDeps {
  /** The XAUUSD research agent (BYOK model + memory already bound). */
  agent: Agent<string, typeof xauusdMastraTools, undefined, XauusdRequestContext>;
  callOptions: AgentMemoryOption;
  providerId: string;
  signal?: AbortSignal;
  /** Shared Mastra instance for run-snapshot persistence (optional; in-memory when absent). */
  mastra?: Mastra;
}

const REPORT_REPAIR_LIMIT = 2; // generations beyond the initial attempt

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return (
    signal?.aborted === true ||
    (error instanceof Error && error.name === 'AbortError') ||
    (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError')
  );
}

/** Rebuild the per-run request context with the trusted packet present. */
function contextWithPacket(
  base: RequestContext<XauusdRequestContext>,
  packet: XauusdResearchPacket,
): RequestContext<XauusdRequestContext> {
  const entries: Array<
    | ['userId', string]
    | ['runId', string]
    | ['threadId', string]
    | ['researchPacket', XauusdResearchPacket]
  > = [
    ['userId', base.get('userId') as string],
    ['runId', base.get('runId') as string],
    ['researchPacket', packet],
  ];
  const threadId = base.get('threadId');
  if (threadId) entries.push(['threadId', threadId as string]);
  return new RequestContext<XauusdRequestContext>(entries);
}

/**
 * Run one generation attempt and classify the outcome: verified report,
 * repair-needed (verifier or structured-output findings), or throw for
 * hard provider errors (which the caller surfaces as a failed run).
 */
async function generateAndVerify(
  deps: XauusdReportWorkflowDeps,
  prompt: string,
  requestContext: RequestContext<XauusdRequestContext>,
  packet: XauusdResearchPacket,
  signal: AbortSignal | undefined,
): Promise<{
  verified: boolean;
  report: XauusdResearchReport | null;
  result: unknown;
  findings: string[];
  stats: MastraGenerationStats;
}> {
  try {
    const result = await generateXauusdReport(
      deps.agent,
      prompt,
      contextWithPacket(requestContext, packet),
      deps.providerId,
      signal,
      deps.callOptions,
    );
    const stats = getMastraGenerationStats(result as MastraGenerationResultLike);
    try {
      const report = requireVerifiedXauusdReport((result as { object?: unknown }).object, packet);
      return { verified: true, report, result, findings: [], stats };
    } catch (error) {
      if (isAbort(error, signal)) throw error;
      const findings = verificationFindings(error);
      if (!findings) throw error;
      return { verified: false, report: null, result, findings: findings.slice(), stats };
    }
  } catch (error) {
    // Structured-output validation can reject the object before the verifier
    // runs (e.g. a missing second scenario), surfacing as a throw from the
    // generate call itself. Treat those issues as repair findings so the loop
    // can retry instead of failing closed on a single malformed object.
    if (isAbort(error, signal)) throw error;
    const findings = verificationFindings(error);
    if (!findings) throw error;
    return { verified: false, report: null, result: null, findings: findings.slice(), stats: zeroStats() };
  }
}

/**
 * Build a per-request XAUUSD verified-report workflow. The generate step
 * carries no retries (matching the pre-workflow behavior: provider errors
 * surface immediately); the repair loop is the bounded, observable retry
 * for verification/structured-output failures.
 */
export function createXauusdReportWorkflow(
  deps: XauusdReportWorkflowDeps,
): Workflow<any, any, string, unknown, unknown, unknown> {
  const collectPacketStep = createStep({
    id: 'collect-packet',
    inputSchema: XauusdReportWorkflowInputSchema,
    outputSchema: CollectPacketOutputSchema,
    execute: async ({ inputData, abortSignal, bail }) => {
      const signal = deps.signal ?? abortSignal;
      const packet = await collectXauusdResearchPacket(signal);
      if (packet.status === 'blocked') {
        return bail({
          status: 'blocked' as const,
          blockedText: blockedXauusdResearchText(packet),
          packet,
          attempts: 0,
          stats: zeroStats(),
        });
      }
      return { packet, prompt: inputData.prompt };
    },
  });

  const generateStep = createStep({
    id: 'generate',
    inputSchema: CollectPacketOutputSchema,
    outputSchema: GenerationStepOutputSchema,
    execute: async ({ inputData, requestContext, abortSignal }) => {
      const signal = deps.signal ?? abortSignal;
      const { verified, report, result, findings, stats } = await generateAndVerify(
        deps,
        inputData.prompt,
        requestContext as RequestContext<XauusdRequestContext>,
        inputData.packet,
        signal,
      );
      if (!verified) {
        // A repair attempt is scheduled (the dowhile always runs once).
        metrics.increment('mastra_report_repair_total', { tags: { result: 'requested' } });
      }
      return { verified, report, result, findings, attempt: 1, stats };
    },
  });

  const repairStep = createStep({
    id: 'repair',
    inputSchema: GenerationStepOutputSchema,
    outputSchema: GenerationStepOutputSchema,
    execute: async ({ inputData, requestContext, abortSignal, getStepResult, getInitData }) => {
      // The dowhile always executes once; pass through when already verified.
      if (inputData.verified) return inputData;
      const signal = deps.signal ?? abortSignal;
      const packet = (getStepResult('collect-packet') as { packet: XauusdResearchPacket }).packet;
      const prompt = repairPrompt((getInitData() as { prompt: string }).prompt, inputData.findings);
      const { verified, report, result, findings, stats } = await generateAndVerify(
        deps,
        prompt,
        requestContext as RequestContext<XauusdRequestContext>,
        packet,
        signal,
      );
      const nextStats: MastraGenerationStats = {
        inputTokens: inputData.stats.inputTokens + stats.inputTokens,
        outputTokens: inputData.stats.outputTokens + stats.outputTokens,
        toolCalls: inputData.stats.toolCalls + stats.toolCalls,
        steps: inputData.stats.steps + stats.steps,
      };
      if (verified) {
        metrics.increment('mastra_report_repair_total', { tags: { result: 'passed' } });
      } else if (inputData.attempt < REPORT_REPAIR_LIMIT) {
        // Another repair is still scheduled (the loop condition allows it).
        metrics.increment('mastra_report_repair_total', { tags: { result: 'requested' } });
      }
      return { verified, report, result, findings, attempt: inputData.attempt + 1, stats: nextStats };
    },
  });

  const finalizeStep = createStep({
    id: 'finalize',
    inputSchema: GenerationStepOutputSchema,
    outputSchema: XauusdReportWorkflowOutputSchema,
    execute: async ({ inputData, getStepResult }) => {
      const packet = (getStepResult('collect-packet') as { packet: XauusdResearchPacket }).packet;
      if (inputData.verified && inputData.report) {
        return {
          status: 'ready' as const,
          report: inputData.report,
          result: inputData.result,
          packet,
          attempts: inputData.attempt,
          stats: inputData.stats,
        };
      }
      // Repair budget exhausted: try the deterministic disclosure patch before
      // failing closed (same recovery as the pre-workflow repair loop).
      const candidate = (inputData.result as { object?: unknown } | null | undefined)?.object;
      const patched = patchTimeframeConflictDisclosure(candidate, packet, inputData.findings);
      if (patched) {
        metrics.increment('mastra_report_repair_total', { tags: { result: 'patched' } });
        return {
          status: 'ready' as const,
          report: patched,
          result: inputData.result,
          packet,
          attempts: inputData.attempt,
          stats: inputData.stats,
        };
      }
      metrics.increment('mastra_report_repair_total', { tags: { result: 'failed' } });
      throw new XauusdReportVerificationError(inputData.findings);
    },
  });

  const workflow = (
    new Workflow({
      id: 'xauusd-research',
      inputSchema: XauusdReportWorkflowInputSchema,
      outputSchema: XauusdReportWorkflowOutputSchema,
      requestContextSchema: XauusdRequestContextSchema,
      ...(deps.mastra ? { mastra: deps.mastra } : {}),
    })
      .then(collectPacketStep)
      .then(generateStep)
      .dowhile(repairStep, async ({ getStepResult, iterationCount }) => {
        const repair = getStepResult('repair') as { verified?: boolean };
        return repair?.verified !== true && iterationCount < REPORT_REPAIR_LIMIT;
      })
      .then(finalizeStep)
      .commit()
  ) as unknown as Workflow<any, any, string, unknown, unknown, unknown>;

  return workflow;
}
