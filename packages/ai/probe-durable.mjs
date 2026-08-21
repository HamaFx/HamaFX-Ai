// Probe: enqueue (persistWorkflowSnapshot pending) → claim (updateWorkflowState running)
// → worker executes workflow with same runId → poll (getWorkflowRunById).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Mastra } from '@mastra/core';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { LibSQLStore } from '@mastra/libsql';

const dir = mkdtempSync(join(tmpdir(), 'kestrel-durable-'));
const url = `file:${join(dir, 'probe.db')}`;
const storage = new LibSQLStore({ id: 'probe', url });
const mastra = new Mastra({ storage, workers: false, logger: false });
await storage.init?.();

const stepA = createStep({
  id: 'a',
  inputSchema: { value: 1 },
  outputSchema: { doubled: 1 },
  execute: async ({ getStepPayload }) => {
    const p = getStepPayload();
    return { doubled: (p?.value ?? 0) * 2 };
  },
});

const wf = createWorkflow({ id: 'full-analysis', inputSchema: { value: 1 }, outputSchema: { doubled: 1 } })
  .then(stepA)
  .commit();

const workflowsStore = await storage.getStore('workflows');
console.log('store kind:', workflowsStore?.constructor?.name);

const runId = 'probe-run-1';
// Web-side enqueue: write pending snapshot with payload in context.input
const payload = { value: 21, userId: 'u1', threadId: 't1' };
await workflowsStore.persistWorkflowSnapshot({
  workflowName: 'full-analysis',
  runId,
  resourceId: 'u1',
  snapshot: {
    runId,
    status: 'pending',
    value: {},
    context: { input: payload },
    serializedStepGraph: [],
    activePaths: [],
    activeStepsPath: {},
    suspendedPaths: {},
    resumeLabels: {},
    waitingPaths: {},
    timestamp: Date.now(),
  },
});

// Poll shape before claim
let listed = await workflowsStore.listWorkflowRuns({ workflowName: 'full-analysis' });
console.log('list after enqueue:', listed.total, listed.runs[0]?.snapshot?.status ?? typeof listed.runs[0]?.snapshot === 'string' ? 'string-snap' : 'obj-snap');
const before = await workflowsStore.getWorkflowRunById({ runId, workflowName: 'full-analysis' });
const snapBefore = typeof before.snapshot === 'string' ? JSON.parse(before.snapshot) : before.snapshot;
console.log('status before claim:', snapBefore.status, '| payload.input.value:', snapBefore.context?.input?.value, '| resourceId:', before.resourceId);

// Claim: pending → running (via updateWorkflowState merge)
await workflowsStore.updateWorkflowState({ workflowName: 'full-analysis', runId, opts: { status: 'running' } });
const after = await workflowsStore.getWorkflowRunById({ runId, workflowName: 'full-analysis' });
const snapAfter = typeof after.snapshot === 'string' ? JSON.parse(after.snapshot) : after.snapshot;
console.log('status after claim:', snapAfter.status, '| payload preserved:', snapAfter.context?.input?.value, '| updatedAt:', after.updatedAt instanceof Date ? 'Date' : typeof after.updatedAt);

// Filtered list: pending should now be empty
const pendingList = await workflowsStore.listWorkflowRuns({ workflowName: 'full-analysis', status: 'pending' });
console.log('pending after claim:', pendingList.total);
const runningList = await workflowsStore.listWorkflowRuns({ workflowName: 'full-analysis', status: 'running' });
console.log('running after claim:', runningList.total);

// Worker-side execute: createRun({ runId }) adopts existing snapshot, then start with inputData
const wfRun = await wf.createRun({ runId, resourceId: 'u1' });
console.log('createRun adopted status:', wfRun.workflowRunStatus);
const result = await wfRun.start({ inputData: { value: 21 } });
console.log('run result:', result.status, JSON.stringify(result.steps?.a?.output ?? result.steps?.a));

const final = await workflowsStore.getWorkflowRunById({ runId, workflowName: 'full-analysis' });
const snapFinal = typeof final.snapshot === 'string' ? JSON.parse(final.snapshot) : final.snapshot;
console.log('final status:', snapFinal.status, '| result:', JSON.stringify(snapFinal.result), '| input preserved:', snapFinal.context?.input?.value);

// Purge/retention
await workflowsStore.deleteWorkflowRunById({ runId, workflowName: 'full-analysis' });
const gone = await workflowsStore.getWorkflowRunById({ runId, workflowName: 'full-analysis' });
console.log('after delete, run exists:', gone !== null);

// prune() path
const runId2 = 'probe-run-2';
await workflowsStore.persistWorkflowSnapshot({
  workflowName: 'full-analysis',
  runId: runId2,
  snapshot: {
    runId: runId2, status: 'success', value: {}, context: { input: { value: 1 } },
    serializedStepGraph: [], activePaths: [], activeStepsPath: {}, suspendedPaths: {}, resumeLabels: {}, waitingPaths: {}, timestamp: Date.now(),
  },
});
const pruneRes = await storage.prune();
console.log('prune result keys:', pruneRes.map((r) => r.domain).join(','));
const pruned = await workflowsStore.getWorkflowRunById({ runId: runId2, workflowName: 'full-analysis' });
console.log('after prune, old run exists:', pruned !== null);

rmSync(dir, { recursive: true, force: true });
console.log('PROBE OK');
