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
