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

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@hamafx/ai', () => ({
  emitPreEvent: vi.fn(),
  emitPostEvent: vi.fn(),
  findHighImpactEventsInWindow: vi.fn(),
}));

// One user — matches the per-user loop in the new multi-user source.
// These tests count emits per (event × user), not per event alone.
vi.mock('@hamafx/db', () => ({
  getDb: () => ({
    select: vi.fn(() => ({
      from: vi.fn(async () => [{ id: 'u1' }]),
    })),
  }),
  schema: { users: { id: 'id' } },
}));

import * as ai from '@hamafx/ai';

import { runBriefings } from '../src/jobs/briefings';
import { TenantRouter } from '../src/tenant-router';
import { createLogger } from '../src/log';

const log = createLogger({ service: 'test', forceJson: true });
const testRouter = new TenantRouter();

beforeEach(() => {
  vi.mocked(ai.emitPreEvent).mockReset();
  vi.mocked(ai.emitPostEvent).mockReset();
  vi.mocked(ai.findHighImpactEventsInWindow).mockReset();
});

describe('runBriefings', () => {
  it('emits pre + post for each candidate and reports counts', async () => {
    vi.mocked(ai.findHighImpactEventsInWindow)
      .mockResolvedValueOnce([{ id: 'e1' }, { id: 'e2' }])
      .mockResolvedValueOnce([{ id: 'e3' }]);
    vi.mocked(ai.emitPreEvent).mockResolvedValue({ emitted: true });
    vi.mocked(ai.emitPostEvent).mockResolvedValue({ emitted: true });

    const r = await runBriefings({ log, signal: new AbortController().signal, tenantRouter: testRouter });
    expect(r.processed).toBe(3);
    expect(r.note).toMatch(/pre=2\/2/);
    expect(r.note).toMatch(/post=1\/1/);
  });

  it('continues past per-event failures', async () => {
    vi.mocked(ai.findHighImpactEventsInWindow)
      .mockResolvedValueOnce([{ id: 'e1' }, { id: 'e2' }])
      .mockResolvedValueOnce([]);
    vi.mocked(ai.emitPreEvent)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ emitted: true });

    const r = await runBriefings({ log, signal: new AbortController().signal, tenantRouter: testRouter });
    // Both candidates were considered, even though one failed.
    expect(r.processed).toBe(2);
    expect(r.note).toMatch(/pre=1\/2/);
  });

  it('honours abort signal between candidates', async () => {
    const ac = new AbortController();
    vi.mocked(ai.findHighImpactEventsInWindow)
      .mockResolvedValueOnce([{ id: 'e1' }, { id: 'e2' }])
      .mockResolvedValueOnce([]);
    vi.mocked(ai.emitPreEvent).mockImplementationOnce(async () => {
      ac.abort();
      return { emitted: true };
    });

    await runBriefings({ log, signal: ac.signal, tenantRouter: testRouter });
    expect(ai.emitPreEvent).toHaveBeenCalledTimes(1);
  });
});
