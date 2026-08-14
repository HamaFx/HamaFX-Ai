#!/usr/bin/env node
/**
 * Publish the checked-in acceptance cases as a Langfuse dataset.
 *
 * This is opt-in and only sends prompts, expected tool/mode metadata, and
 * case IDs. It never sends user conversations, credentials, or model output.
 * The runner remains usable without Langfuse credentials.
 *
 * Usage:
 *   LANGFUSE_PUBLIC_KEY=... LANGFUSE_SECRET_KEY=... \
 *   LANGFUSE_BASE_URL=https://cloud.langfuse.com \
 *   pnpm eval:publish
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const datasetName = process.env.LANGFUSE_EVAL_DATASET ?? 'kestrel-agent-regression';
const baseUrl = (process.env.LANGFUSE_BASE_URL ?? '').replace(/\/$/, '');
const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
const secretKey = process.env.LANGFUSE_SECRET_KEY;

if (!baseUrl || !publicKey || !secretKey) {
  console.error('[eval:publish] LANGFUSE_BASE_URL, LANGFUSE_PUBLIC_KEY, and LANGFUSE_SECRET_KEY are required');
  process.exit(1);
}

const cases = JSON.parse(await readFile(resolve(root, 'packages/ai/src/eval/cases.json'), 'utf8'));
const auth = Buffer.from(`${publicKey}:${secretKey}`).toString('base64');

async function post(path, body) {
  const response = await fetch(`${baseUrl}/api/public${path}`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${auth}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (response.status === 409) return;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Langfuse ${path} returned HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
}

async function ensureDataset() {
  const response = await fetch(`${baseUrl}/api/public/v2/datasets`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${auth}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name: datasetName,
      description: 'Kestrel agent mode, specialist, tool, citation, sentiment, and fallback regression cases',
      metadata: { source: 'packages/ai/src/eval/cases.json', version: '2026-08' },
    }),
  });
  if (response.status === 409) return;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Langfuse dataset creation returned HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
}

await ensureDataset();

for (const item of cases) {
  await post('/dataset-items', {
    datasetName,
    id: item.id,
    input: { prompt: item.prompt, analysisMode: item.analysisMode ?? 'single' },
    expectedOutput: {
      expectedTools: item.expectedTools ?? [],
      expectedAgents: item.expectedAgents ?? [],
      expectedAgentStatuses: item.expectedAgentStatuses ?? {},
      mustContainSubstrings: item.mustContainSubstrings ?? [],
    },
    metadata: { source: 'packages/ai/src/eval/cases.json', version: '2026-08' },
  });
}

console.log(`[eval:publish] published ${cases.length} cases to dataset ${datasetName}`);
