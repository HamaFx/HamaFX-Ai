// Phase 7a: every request gets a stable id, set by middleware and echoed
// on every response. Logs use it as a correlation key so a UI bug report
// (`X-Request-Id: <uuid>`) maps to a single Vercel log line.
//
// We accept an inbound `x-request-id` header (so an upstream proxy / curl
// run can carry its own id) and generate a fresh one when missing.

const HEADER_NAME = 'x-request-id';

const VALID = /^[A-Za-z0-9-]{6,128}$/;

export function readOrCreateRequestId(req: Request): string {
  const incoming = req.headers.get(HEADER_NAME);
  if (incoming && VALID.test(incoming)) return incoming;
  return crypto.randomUUID();
}

export const REQUEST_ID_HEADER = HEADER_NAME;
