// Per-iteration VU function: POST /api/chat with a simple prompt.
// Guarded by K6_ENABLE_CHAT=true to prevent accidental LLM cost.
import { sleep } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { postJson } from '../lib/http.js';
import { record429 } from '../lib/checks.js';
import { chatStreamBytes } from '../lib/metrics.js';
import type { SessionCtx } from '../config/environments.js';

export function chatTurn(ctx: SessionCtx): void {
  // Guard: skip if no threadId is available for this user
  if (!ctx.threadId) {
    return;
  }

  const messageId = uuidv4();

  const body = {
    threadId: ctx.threadId,
    messages: [
      {
        id: messageId,
        role: 'user',
        content: 'What is XAUUSD doing today? Give a brief summary.',
        parts: [],
      },
    ],
  };

  const res = postJson('/api/chat', 'chat', body);

  // Record stream bytes for bandwidth profiling
  const bodyStr = res.body as string;
  if (typeof bodyStr === 'string') {
    chatStreamBytes.add(bodyStr.length);
  }

  // Record 429s explicitly for chat (the limiter is 30/min/user)
  record429(res);

  // Think-time between chat turns — this user won't post again for a while
  sleep(5 + Math.random() * 10);
}
