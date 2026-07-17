/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any, prefer-const */
import { logErrorContext } from '@hamafx/shared/logger';
import { getDb, schema } from '@hamafx/db';
import {
  ConveneCommitteeInputSchema,
  type CommitteeVerdict,
  type ConveneCommitteeOutput,
  type Symbol,
} from '@hamafx/shared';
import { tool, generateText, stepCountIs } from 'ai';
import type { z } from 'zod';
import type { ResolveModelEnv } from '../model';

import { getToolContext, type ToolContext } from '../tool-context';
import { resolveChatModel, getVertexGoogleSearchTool } from '../model';

import { analyzeFundamentalTool } from './analyze-fundamental';
import { analyzeTechnicalTool } from './analyze-technical';
import { getJournalStatsTool } from './get-journal-stats';
import { computeRiskTool } from './compute-risk';

const InputSchema = ConveneCommitteeInputSchema;

declare module '@hamafx/shared' {
  interface ToolIOMap {
    convene_committee: { input: z.infer<typeof InputSchema> };
  }
}

export const conveneCommitteeTool = tool({
  description:
    "Convene a Multi-Agent Trading Committee (Economist, Technician, Risk Manager) to evaluate a trade setup. Use whenever the user asks 'Should I take this trade?' or provides a setup with an entry and stop loss.",
  inputSchema: InputSchema,
  execute: async (input): Promise<ConveneCommitteeOutput> => {
    const ctx = getToolContext();
    const { symbol, side, entry, stop, target } = input;

    // 1. Pre-fetch context data in parallel.
    // Guard each tool's execute function — a missing tool registration
    // should throw a clear error, not a cryptic "undefined is not a function".
    const afExec = analyzeFundamentalTool.execute;
    const atExec = analyzeTechnicalTool.execute;
    const jsExec = getJournalStatsTool.execute;
    const crExec = computeRiskTool.execute;
    if (!afExec) throw new Error('analyze_fundamental tool is not registered — cannot convene committee');
    if (!atExec) throw new Error('analyze_technical tool is not registered — cannot convene committee');
    if (!jsExec) throw new Error('get_journal_stats tool is not registered — cannot convene committee');
    // Internal tool execution options used when the committee calls sub-tools directly.
    // We intentionally pass an empty messages array (never[] — assignable to any T[])
    // and a minimal toolCallId because these are internal calls, not user-facing tool
    // invocations. An empty array is the correct shape: no user messages to report.
    const internalExecOpts = { toolCallId: 'internal', messages: [] };
    const [fundamentalData, technicalData, journalData, riskData] = await Promise.all([
      afExec({ symbol, horizonHours: 48 }, internalExecOpts),
      atExec({ symbol, timeframes: ['1d', '4h', '1h', '15m'] }, internalExecOpts),
      jsExec({ symbol }, internalExecOpts),
      stop && crExec ? crExec({ symbol, side, entry, stop, target: target ?? undefined, accountUsd: 1000, riskPct: 1 }, internalExecOpts) : Promise.resolve(null),
      // ↑ crExec is intentionally lenient: risk computation is conditional on `stop`.
      // When stop is not provided, we pass null risk data and the Risk Manager
      // persona handles the missing information gracefully.
    ]);

    // 2. Run the 3 Personas in parallel
    const [economist, technician, riskManager] = await Promise.all([
      runEconomist(input, fundamentalData, ctx),
      runTechnician(input, technicalData, ctx),
      runRiskManager(input, journalData, riskData, ctx),
    ]);

    // 3. Run the Moderator
    const { grade, goNoGo, consensus } = await runModerator(input, economist, technician, riskManager, ctx);

    return {
      symbol,
      side,
      entry,
      stop,
      target,
      verdicts: [economist, technician, riskManager],
      grade,
      goNoGo,
      consensus,
    };
  },
});

// ---------------------------------------------------------------------------
// Persona Runners
// ---------------------------------------------------------------------------

async function runEconomist(input: any, data: any, ctx: ToolContext): Promise<CommitteeVerdict> {
  const prompt = `You are The Economist on a trading committee. Evaluate this trade:
Symbol: ${input.symbol}
Side: ${input.side}
Entry: ${input.entry}

Recent Fundamental Data:
${JSON.stringify(data, null, 2)}

Use the googleSearch tool to find any breaking news or macroeconomic drivers from the last 24 hours that might impact this trade.

Output ONLY a JSON object:
{
  "verdict": "bullish" | "bearish" | "neutral",
  "confidence": <number 1-10>,
  "keyPoints": ["<string>", ...],
  "risk": "<string>",
  "recommendation": "<string>"
}
No markdown fences, no preamble.`;

  try {
    // Only pass tools if the vertex env is available.
    const vertexEnv: Pick<ResolveModelEnv, 'GOOGLE_VERTEX_PROJECT' | 'GOOGLE_VERTEX_LOCATION' | 'GOOGLE_APPLICATION_CREDENTIALS_JSON' | 'GOOGLE_APPLICATION_CREDENTIALS'> = ctx.env;
    const tools = ctx.env.GOOGLE_VERTEX_PROJECT ? { googleSearch: getVertexGoogleSearchTool(vertexEnv) } : undefined;
    const { text, steps } = await generateText({
      model: resolveChatModel(ctx.userSettings, ctx.env).model,
      system: "You are an expert forex macroeconomic analyst. Always output raw JSON.",
      prompt,
      ...(tools ? { tools, stopWhen: stepCountIs(3) } : {}),
    });

    const parsed = parseJson<Omit<CommitteeVerdict, 'persona' | 'sources'>>(text);
    if (!parsed) throw new Error('Parse failed');

    // Extract citations from the tool calls if available
    let sources: string[] = [];
    for (const step of steps) {
      if (step.toolResults) {
        for (const res of step.toolResults) {
          if (res.toolName === 'googleSearch') {
             // We just add a generic source tag since raw parsing of grounding results is complex.
             // The frontend will render them if present.
             sources.push('Google Search Grounding');
          }
        }
      }
    }

    return {
      persona: 'economist',
      verdict: parsed.verdict ?? 'neutral',
      confidence: parsed.confidence ?? 5,
      keyPoints: parsed.keyPoints ?? ['No key points provided.'],
      risk: parsed.risk ?? 'Unknown macro risk.',
      recommendation: parsed.recommendation ?? 'No recommendation.',
      sources: sources.length > 0 ? sources : undefined,
    };
  } catch (err) {
    logErrorContext(err, 'committee/economist_failed', {}, 'ai');
    return fallbackVerdict('economist');
  }
}

async function runTechnician(input: any, data: any, ctx: ToolContext): Promise<CommitteeVerdict> {
  const prompt = `You are The Technician on a trading committee. Evaluate this trade:
Symbol: ${input.symbol}
Side: ${input.side}
Entry: ${input.entry}

Multi-Timeframe Technical Data:
${JSON.stringify(data, null, 2)}

Evaluate the trend alignment, momentum, and structure.
Output ONLY a JSON object:
{
  "verdict": "bullish" | "bearish" | "neutral",
  "confidence": <number 1-10>,
  "keyPoints": ["<string>", ...],
  "risk": "<string>",
  "recommendation": "<string>"
}
No markdown fences, no preamble.`;

  try {
    const { text } = await generateText({
      model: resolveChatModel(ctx.userSettings, ctx.env).model,
      system: "You are an expert forex technical analyst. Always output raw JSON.",
      prompt,
    });
    const parsed = parseJson<Omit<CommitteeVerdict, 'persona'>>(text);
    if (!parsed) throw new Error('Parse failed');
    return { persona: 'technician', ...parsed } as CommitteeVerdict;
  } catch (err) {
    logErrorContext(err, 'committee/technician_failed', {}, 'ai');
    return fallbackVerdict('technician');
  }
}

async function runRiskManager(input: any, journalData: any, riskData: any, ctx: ToolContext): Promise<CommitteeVerdict> {
  const prompt = `You are The Risk Manager on a trading committee. Evaluate this trade:
Symbol: ${input.symbol}
Side: ${input.side}
Entry: ${input.entry}
Stop: ${input.stop || 'None'}
Target: ${input.target || 'None'}

User's Journal Stats for ${input.symbol}:
${JSON.stringify(journalData.bySymbol || [], null, 2)}

Position Sizing & Risk Profile:
${JSON.stringify(riskData || 'No stop loss provided, extreme risk.', null, 2)}

Evaluate the R:R ratio, stop loss distance (ATR), and the user's historical win rate on this pair.
Output ONLY a JSON object:
{
  "verdict": "bullish" | "bearish" | "neutral",
  "confidence": <number 1-10>,
  "keyPoints": ["<string>", ...],
  "risk": "<string>",
  "recommendation": "<string>"
}
No markdown fences, no preamble.`;

  try {
    const { text } = await generateText({
      model: resolveChatModel(ctx.userSettings, ctx.env).model,
      system: "You are an expert risk manager. Always output raw JSON.",
      prompt,
    });
    const parsed = parseJson<Omit<CommitteeVerdict, 'persona'>>(text);
    if (!parsed) throw new Error('Parse failed');
    return { persona: 'risk_manager', ...parsed } as CommitteeVerdict;
  } catch (err) {
    logErrorContext(err, 'committee/risk_manager_failed', {}, 'ai');
    return fallbackVerdict('risk_manager');
  }
}

async function runModerator(input: any, e: CommitteeVerdict, t: CommitteeVerdict, r: CommitteeVerdict, ctx: ToolContext) {
  const prompt = `You are the Committee Moderator. You have received three reports for a ${input.side} trade on ${input.symbol} at ${input.entry}.

Economist: ${e.verdict} (${e.confidence}/10) - ${e.recommendation}
Technician: ${t.verdict} (${t.confidence}/10) - ${t.recommendation}
Risk Manager: ${r.verdict} (${r.confidence}/10) - ${r.recommendation}

Synthesize these into a final consensus.
Output ONLY a JSON object:
{
  "grade": "A" | "B" | "C" | "D" | "F",
  "goNoGo": "go" | "caution" | "no-go",
  "consensus": "<2-3 sentence summary>"
}
No markdown fences, no preamble.`;

  try {
    const { text } = await generateText({
      model: resolveChatModel(ctx.userSettings, ctx.env).model,
      system: "You are the head trader. Always output raw JSON.",
      prompt,
    });
    const parsed = parseJson<any>(text);
    if (!parsed) throw new Error('Parse failed');
    return {
      grade: parsed.grade ?? 'C',
      goNoGo: parsed.goNoGo ?? 'caution',
      consensus: parsed.consensus ?? 'The committee was unable to reach a firm consensus. Proceed with caution.',
    };
  } catch (err) {
    logErrorContext(err, 'committee/moderator_failed', {}, 'ai');
    return { grade: 'C', goNoGo: 'caution', consensus: 'Moderator analysis failed. Proceed with caution.' };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJson<T>(text: string): T | null {
  try {
    const cleaned = text.trim().replace(/^```json\s*/, '').replace(/```$/, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function fallbackVerdict(persona: CommitteeVerdict['persona']): CommitteeVerdict {
  return {
    persona,
    verdict: 'neutral',
    confidence: 1,
    keyPoints: ['Analysis failed or timed out.'],
    risk: 'Unknown',
    recommendation: 'Proceed with caution.',
  };
}
