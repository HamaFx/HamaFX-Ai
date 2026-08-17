/**
 * Copyright 2026 Kestrel
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

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { readFile as readFileAsync } from 'node:fs/promises';

import { runEvals } from '../src/eval/runner';

// Deterministic offline eval — Phase 0.7.
//
// The live eval harness posts to /api/chat. Here we mock those endpoints
// with recorded model+tool responses so the harness can assert on tool
// selection, tool arguments, and numeric outputs without live API keys.

const threadId = '00000000-0000-0000-0000-000000000001';

function makeStream(parts: string[]) {
  return parts.map((p) => `data: ${p}\n\n`).join('');
}

const handlers = [
  http.post('http://localhost:9999/api/chat/threads', () => {
    return HttpResponse.json({ thread: { id: threadId } });
  }),

  http.post('http://localhost:9999/api/chat', () => {
    // A recorded response where the assistant calls compute_risk with
    // specific arguments and then emits text mentioning XAUUSD.
    const stream = makeStream([
      JSON.stringify({ type: 'start-step' }),
      JSON.stringify({
        type: 'tool-input-start',
        toolCallId: 'call-1',
        toolName: 'compute_risk',
        providerExecuted: true,
      }),
      JSON.stringify({
        type: 'tool-input-available',
        toolCallId: 'call-1',
        toolName: 'compute_risk',
        input: {
          symbol: 'XAUUSD',
          side: 'long',
          entry: 2400,
          stop: 2390,
          target: 2420,
          accountUsd: 10000,
          riskPct: 1,
        },
        providerExecuted: true,
      }),
      JSON.stringify({
        type: 'tool-output-available',
        toolCallId: 'call-1',
        output: {
          symbol: 'XAUUSD',
          side: 'long',
          riskUsd: 100,
          rewardUsd: 200,
          rrRatio: 2,
          pipsToStop: 100,
          pipsToTarget: 200,
          distanceUnit: 'pips',
          quantityUnit: 'ounces',
          pipValueUsdPerLot: 10,
          positionSizeLots: 0.1,
          positionSizeUnits: 10000,
          invalidDirection: false,
          summary: 'Long XAUUSD: 0.1 lot, $100 at risk, RR 2.0',
        },
      }),
      JSON.stringify({ type: 'text-start', id: 't0' }),
      JSON.stringify({ type: 'text-delta', id: 't0', delta: 'XAUUSD looks like a 2R setup.' }),
      JSON.stringify({ type: 'text-end', id: 't0' }),
      JSON.stringify({ type: 'finish-step' }),
      JSON.stringify({ type: 'finish', finishReason: 'stop' }),
    ]);
    return new HttpResponse(stream, {
      headers: { 'content-type': 'text/event-stream' },
    });
  }),
];

const server = setupServer(...handlers);

describe('eval offline — Phase 0.7', () => {
  let tmpDir: string;
  let promptsPath: string;

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'error' });
    tmpDir = await mkdtemp(join(tmpdir(), 'hfx-eval-'));
    promptsPath = join(tmpDir, 'cases.json');
    await writeFile(
      promptsPath,
      JSON.stringify([
        {
          id: 'offline-p1',
          prompt: 'Size a 1% risk long on XAUUSD from 2400 stop 2390 target 2420 with $10k account.',
          expectedTools: ['compute_risk'],
          forbiddenTools: ['verify_call'],
          mustContainSubstrings: ['XAUUSD'],
          expectedToolOutputs: [
            { tool: 'compute_risk', path: 'rrRatio', value: 2, tolerance: 0.01 },
          ],
          quality: { requireNumericToolSupport: true },
        },
      ]),
    );
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(async () => {
    server.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('passes when the recorded tool call and arguments match expectations', async () => {
    const { results } = await runEvals({
      baseUrl: 'http://localhost:9999',
      cookie: 'authjs.session-token=test',
      outDir: tmpDir,
      promptsPath,
      timeoutMs: 5000,
      onProgress: () => {},
    });

    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r).toBeDefined();
    if (!r) return;

    expect(r.ok).toBe(true);
    expect(r.assertions).toHaveLength(0);
    expect(r.toolCalls).toHaveLength(1);
    expect(r.toolCalls[0]?.name).toBe('compute_risk');
    expect(r.toolCalls[0]?.args).toMatchObject({
      symbol: 'XAUUSD',
      side: 'long',
      entry: 2400,
      stop: 2390,
      target: 2420,
      accountUsd: 10000,
      riskPct: 1,
    });
  });

  it('writes a machine-readable JSON report alongside the Markdown', async () => {
    const { jsonPath } = await runEvals({
      baseUrl: 'http://localhost:9999',
      cookie: 'authjs.session-token=test',
      outDir: tmpDir,
      promptsPath,
      timeoutMs: 5000,
      onProgress: () => {},
    });

    expect(jsonPath.endsWith('.json')).toBe(true);
    const raw = await readFileAsync(jsonPath, 'utf-8');
    const parsed = JSON.parse(raw) as {
      schemaVersion: string;
      results: Array<{ id: string; ok: boolean }>;
    };
    expect(parsed.schemaVersion).toBe('kestrel.eval-report.v1');
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0]).toMatchObject({ id: 'offline-p1', ok: true });
  });

  it('fails when a structured numeric output misses the expected value', async () => {
    const numericPromptPath = join(tmpDir, 'numeric-mismatch.json');
    await writeFile(numericPromptPath, JSON.stringify([
      {
        id: 'offline-numeric-mismatch',
        prompt: 'Check the risk ratio.',
        expectedToolOutputs: [
          { tool: 'compute_risk', path: 'rrRatio', value: 3, tolerance: 0.01 },
        ],
      },
    ]));

    const { results } = await runEvals({
      baseUrl: 'http://localhost:9999',
      cookie: 'authjs.session-token=test',
      outDir: tmpDir,
      promptsPath: numericPromptPath,
      timeoutMs: 5000,
      onProgress: () => {},
    });

    expect(results[0]?.assertions).toEqual([
      expect.objectContaining({ kind: 'numeric_mismatch' }),
    ]);
  });

  it('fails grounding and safety quality gates for unsupported claims', async () => {
    const qualityPromptPath = join(tmpDir, 'quality-failure.json');
    await writeFile(qualityPromptPath, JSON.stringify([
      {
        id: 'offline-quality-failure',
        prompt: 'Give an ungrounded answer.',
        quality: {
          requireNumericToolSupport: true,
          requireEventToolSupport: true,
          forbiddenOutputSubstrings: ['guaranteed profit'],
          requiredOutputSubstrings: ['not financial advice'],
        },
      },
    ]));
    server.use(
      http.post('http://localhost:9999/api/chat', () => {
        const stream = makeStream([
          JSON.stringify({ type: 'text-start', id: 't0' }),
          JSON.stringify({ type: 'text-delta', id: 't0', delta: 'XAUUSD is at 2400.25. FOMC: guaranteed profit.' }),
          JSON.stringify({ type: 'text-end', id: 't0' }),
          JSON.stringify({ type: 'finish', finishReason: 'stop' }),
        ]);
        return new HttpResponse(stream, { headers: { 'content-type': 'text/event-stream' } });
      }),
    );

    const { results } = await runEvals({
      baseUrl: 'http://localhost:9999',
      cookie: 'authjs.session-token=test',
      outDir: tmpDir,
      promptsPath: qualityPromptPath,
      timeoutMs: 5000,
      onProgress: () => {},
    });

    const kinds = results[0]?.assertions?.map((assertion) => assertion.kind) ?? [];
    expect(kinds).toEqual(expect.arrayContaining([
      'unsupported_numeric_claim',
      'unsupported_event_claim',
      'unsafe_output',
      'missing_safety_text',
    ]));
  });

  it('scores streamed multi-agent cost and latency metadata', async () => {
    const qualityPromptPath = join(tmpDir, 'quality-pass.json');
    await writeFile(qualityPromptPath, JSON.stringify([
      {
        id: 'offline-quality-pass',
        prompt: 'Run a fast grounded committee read.',
        quality: { maxTtftMs: 1000, maxTotalMs: 1000, maxCostUsd: 0.05 },
      },
    ]));
    server.use(
      http.post('http://localhost:9999/api/chat', () => {
        const stream = makeStream([
          JSON.stringify({ type: 'data-multi-agent-meta', id: 'm0', data: { totalCostUsd: 0.012, totalLatencyMs: 12, ttfbMs: 4 }, transient: true }),
          JSON.stringify({ type: 'text-start', id: 't0' }),
          JSON.stringify({ type: 'text-delta', id: 't0', delta: 'Grounded response.' }),
          JSON.stringify({ type: 'text-end', id: 't0' }),
          JSON.stringify({ type: 'finish', finishReason: 'stop' }),
        ]);
        return new HttpResponse(stream, { headers: { 'content-type': 'text/event-stream' } });
      }),
    );

    const { results } = await runEvals({
      baseUrl: 'http://localhost:9999',
      cookie: 'authjs.session-token=test',
      outDir: tmpDir,
      promptsPath: qualityPromptPath,
      timeoutMs: 5000,
      onProgress: () => {},
    });

    expect(results[0]?.metadata).toMatchObject({ totalCostUsd: 0.012, totalLatencyMs: 12, ttfbMs: 4 });
    expect(results[0]?.assertions).toEqual([]);
  });

  it('fails when a forbidden tool appears in the recorded trace', async () => {
    server.use(
      http.post('http://localhost:9999/api/chat', () => {
        const stream = makeStream([
          JSON.stringify({ type: 'start-step' }),
          JSON.stringify({
            type: 'tool-input-start',
            toolCallId: 'call-1',
            toolName: 'verify_call',
            providerExecuted: true,
          }),
          JSON.stringify({
            type: 'tool-input-available',
            toolCallId: 'call-1',
            toolName: 'verify_call',
            input: { symbol: 'XAUUSD', side: 'long', entry: 2400, stop: 2390, target: 2420 },
            providerExecuted: true,
          }),
          JSON.stringify({
            type: 'tool-output-available',
            toolCallId: 'call-1',
            output: { verified: true },
          }),
          JSON.stringify({ type: 'text-start', id: 't0' }),
          JSON.stringify({ type: 'text-delta', id: 't0', delta: 'XAUUSD looks fine.' }),
          JSON.stringify({ type: 'text-end', id: 't0' }),
          JSON.stringify({ type: 'finish-step' }),
          JSON.stringify({ type: 'finish', finishReason: 'stop' }),
        ]);
        return new HttpResponse(stream, {
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    const { results } = await runEvals({
      baseUrl: 'http://localhost:9999',
      cookie: 'authjs.session-token=test',
      outDir: tmpDir,
      promptsPath,
      timeoutMs: 5000,
      onProgress: () => {},
    });

    const r = results[0];
    expect(r).toBeDefined();
    if (!r) return;

    expect(r.ok).toBe(true);
    expect(r.assertions?.some((a) => a.kind === 'forbidden_tool' && a.detail === 'verify_call')).toBe(true);
  });

  it('fails when an expected tool is missing from the recorded trace', async () => {
    server.use(
      http.post('http://localhost:9999/api/chat', () => {
        const stream = makeStream([
          JSON.stringify({ type: 'start-step' }),
          JSON.stringify({ type: 'text-start', id: 't0' }),
          JSON.stringify({ type: 'text-delta', id: 't0', delta: 'XAUUSD looks fine.' }),
          JSON.stringify({ type: 'text-end', id: 't0' }),
          JSON.stringify({ type: 'finish-step' }),
          JSON.stringify({ type: 'finish', finishReason: 'stop' }),
        ]);
        return new HttpResponse(stream, {
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    const { results } = await runEvals({
      baseUrl: 'http://localhost:9999',
      cookie: 'authjs.session-token=test',
      outDir: tmpDir,
      promptsPath,
      timeoutMs: 5000,
      onProgress: () => {},
    });

    const r = results[0];
    expect(r).toBeDefined();
    if (!r) return;

    expect(r.ok).toBe(true);
    expect(r.assertions?.some((a) => a.kind === 'missing_tool' && a.detail === 'compute_risk')).toBe(true);
  });

  it('scores Full-mode agent lifecycle coverage from streamed progress', async () => {
    const fullPromptPath = join(tmpDir, 'full-mode.json');
    await writeFile(fullPromptPath, JSON.stringify([
      {
        id: 'offline-full',
        prompt: 'Run Full mode on XAUUSD.',
        analysisMode: 'full',
        expectedAgents: ['technical', 'fundamental', 'risk', 'sentiment', 'decision'],
        expectedAgentStatuses: {
          technical: 'done', fundamental: 'done', risk: 'done', sentiment: 'error', decision: 'error',
        },
        expectedTerminalStatus: 'failed',
        mustContainSubstrings: [],
      },
    ]));
    server.use(
      http.post('http://localhost:9999/api/chat', () => {
        const agents = [
          { agentName: 'technical', status: 'done' },
          { agentName: 'fundamental', status: 'done' },
          { agentName: 'risk', status: 'done' },
          { agentName: 'sentiment', status: 'error', error: 'unavailable' },
          { agentName: 'decision', status: 'error', error: 'Full analysis stopped.' },
        ];
        const stream = makeStream([
          JSON.stringify({ type: 'data-agent-progress', data: { mode: 'full', status: 'failed', error: 'No partial answer was returned.', agents } }),
          JSON.stringify({ type: 'error', errorText: 'Full analysis could not be completed. No partial answer was returned.' }),
        ]);
        return new HttpResponse(stream, { headers: { 'content-type': 'text/event-stream' } });
      }),
    );

    const { results, score } = await runEvals({
      baseUrl: 'http://localhost:9999',
      cookie: 'authjs.session-token=test',
      outDir: tmpDir,
      promptsPath: fullPromptPath,
      timeoutMs: 5000,
      onProgress: () => {},
    });

    expect(results[0]?.agentProgress[0]?.agents).toHaveLength(5);
    expect(results[0]?.terminalStatus).toBe('failed');
    expect(results[0]?.assertions).toEqual([]);
    expect(score.overallPassRate).toBe(1);
    expect(score.agentCoverageRate).toBe(1);
  });
});
