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

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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
});
