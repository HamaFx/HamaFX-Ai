// Full-mode queue load test — explicitly opt-in because it invokes real LLMs.
// This measures the user-facing enqueue path and the worker polling bridge;
// it does not bypass the queue or mutate internal tables directly.
import { check, sleep } from 'k6';
import http from 'k6/http';
import { Counter, Rate, Trend } from 'k6/metrics';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

import { env } from '../config/environments.js';
import { bootstrapAuth, applyAuth, pickUser } from '../lib/auth.js';
import { handleSummary } from '../lib/summary.js';

const fullModeCompleted = new Rate('full_mode_completed');
const fullModeFailures = new Counter('full_mode_failures');
const fullModePolls = new Trend('full_mode_polls');

if (__ENV['K6_ENABLE_FULL_MODE'] !== 'true') {
  throw new Error(
    'Full-mode load requires K6_ENABLE_FULL_MODE=true. This test makes real LLM calls and costs money.',
  );
}

const VUS = parseInt(__ENV['K6_FULL_MODE_VUS'] ?? '2', 10);
const ITERATIONS = parseInt(__ENV['K6_FULL_MODE_ITERS'] ?? '2', 10);
const MAX_POLLS = parseInt(__ENV['K6_FULL_MODE_MAX_POLLS'] ?? '30', 10);

export const options = {
  scenarios: {
    fullMode: {
      executor: 'per-vu-iterations',
      vus: VUS,
      iterations: ITERATIONS,
      maxDuration: '10m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    checks: ['rate>0.95'],
    full_mode_completed: ['rate>0.95'],
    full_mode_failures: ['count<2'],
    full_mode_polls: ['p(95)<30'],
  },
};

export function setup() {
  return bootstrapAuth();
}

export default function (contexts: ReturnType<typeof bootstrapAuth>) {
  const ctx = pickUser(contexts);
  applyAuth(ctx);
  if (!ctx.threadId) {
    throw new Error('Full-mode load requires session auth with seeded thread IDs.');
  }

  const messageId = uuidv4();
  const response = http.post(
    `${env.baseUrl}/api/chat`,
    JSON.stringify({
      threadId: ctx.threadId,
      analysisMode: 'full',
      messages: [{
        id: messageId,
        role: 'user',
        parts: [{ type: 'text', text: 'Run a complete Full-mode XAUUSD analysis.' }],
      }],
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { group: 'full_mode_enqueue' },
    },
  );

  const accepted = check(response, {
    'full mode enqueue accepted': (res) => res.status >= 200 && res.status < 300,
  });
  if (!accepted) {
    fullModeFailures.add(1);
    fullModeCompleted.add(false);
    return;
  }

  let jobId = '';
  try {
    const body = JSON.parse(response.body as string) as { jobId?: unknown };
    if (typeof body.jobId === 'string') jobId = body.jobId;
  } catch {
    // Count malformed queue responses as a visible failure.
  }

  if (!jobId) {
    fullModeFailures.add(1);
    fullModeCompleted.add(false);
    return;
  }

  let completed = false;
  let polls = 0;
  for (; polls < MAX_POLLS; polls += 1) {
    sleep(2);
    const poll = http.get(`${env.baseUrl}/api/chat/analysis-jobs/${jobId}`, {
      tags: { group: 'full_mode_poll' },
    });
    if (poll.status < 200 || poll.status >= 300) continue;
    try {
      const body = JSON.parse(poll.body as string) as { status?: unknown };
      if (body.status === 'complete') {
        completed = true;
        break;
      }
      if (body.status === 'failed') break;
    } catch {
      // A malformed poll result remains retryable until MAX_POLLS.
    }
  }

  fullModePolls.add(polls + 1);
  fullModeCompleted.add(completed);
  if (!completed) fullModeFailures.add(1);
}

export { handleSummary };
