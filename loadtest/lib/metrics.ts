// Custom k6 metrics used across all load tests.
import { Trend, Rate, Counter } from 'k6/metrics';

/** Share of all requests that returned HTTP 429 (rate-limited). */
export const rateLimited = new Rate('rate_limited');

/** Time-to-first-token for /api/chat SSE streams (ms). Only recorded
 *  when the test actually measures TTFB — currently a placeholder for
 *  the xk6-sse stretch goal. */
export const chatTtfb = new Trend('chat_ttfb', true);

/** Total stream bytes received from /api/chat responses. */
export const chatStreamBytes = new Counter('chat_stream_bytes');

/** Count of failed authentications (401/403). */
export const authFailures = new Counter('auth_failures');
