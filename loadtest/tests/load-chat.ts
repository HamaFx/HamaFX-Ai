// Chat streaming load test — guarded by K6_ENABLE_CHAT=true.
// Models low-concurrency LLM streaming with generous latency thresholds.
// Requires seeded users with threadIds (Strategy B only).
import { sleep } from 'k6';
import { env } from '../config/environments.ts';
import { CHAT, CHAT_TAGGED } from '../config/thresholds.ts';
import { bootstrapAuth, applyAuth, pickUser } from '../lib/auth.ts';
import { chatTurn } from '../scenarios/chat.ts';
import { handleSummary } from '../lib/summary.ts';

// Guard: refuse to run unless explicitly enabled.
if (__ENV['K6_ENABLE_CHAT'] !== 'true') {
  throw new Error(
    'chat load test requires K6_ENABLE_CHAT=true. ' +
      'This test makes real LLM calls that cost money.',
  );
}

const VUS = parseInt(__ENV['K6_CHAT_VUS'] ?? '3', 10);
const ITERATIONS = parseInt(__ENV['K6_CHAT_ITERS'] ?? '5', 10);

export const options = {
  scenarios: {
    chat: {
      name: 'load-chat',
      executor: 'per-vu-iterations',
      vus: VUS,
      iterations: ITERATIONS,
      maxDuration: '5m',
    },
  },
  thresholds: {
    http_req_failed: CHAT.httpReqFailed,
    checks: CHAT.checks,
    rate_limited: CHAT.rateLimited,
    ...CHAT_TAGGED,
  },
};

export function setup() {
  return bootstrapAuth();
}

export default function (
  ctxs: ReturnType<typeof bootstrapAuth>,
) {
  const ctx = pickUser(ctxs);
  applyAuth(ctx);
  chatTurn(ctx);
  sleep(2);
}

export { handleSummary };
