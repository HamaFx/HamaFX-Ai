/**
 * Copyright 2026 Kestrel
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

import { afterEach, describe, expect, it, vi } from 'vitest';

import { telemetryConfig } from '../src/telemetry';
import { withDiagnostics } from '../src/diagnostics/run-context';

describe('telemetryConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not enable vendor telemetry when Langfuse is incomplete', () => {
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'public');
    vi.stubEnv('LANGFUSE_SECRET_KEY', '');
    vi.stubEnv('LANGFUSE_BASE_URL', 'https://cloud.langfuse.com');

    expect(telemetryConfig()).toEqual({});
  });

  it('adds stable operation and diagnostic correlation metadata', async () => {
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'public');
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'secret');
    vi.stubEnv('LANGFUSE_BASE_URL', 'https://cloud.langfuse.com');
    vi.stubEnv('LANGFUSE_RECORD_IO', '0');

    await withDiagnostics(
      'user-1',
      'thread-1',
      async () => {
        const config = telemetryConfig({
          functionId: 'agent.technical',
          metadata: { attempt: 2 },
        });
        if (!('experimental_telemetry' in config)) throw new Error('telemetry was not enabled');
        const settings = config.experimental_telemetry;

        expect(settings.isEnabled).toBe(true);
        expect(settings.functionId).toBe('agent.technical');
        expect(settings.recordInputs).toBe(false);
        expect(settings.recordOutputs).toBe(false);
        expect(settings.metadata).toMatchObject({
          service: 'kestrel-ai',
          traceId: expect.any(String),
          threadId: 'thread-1',
          userId: 'user-1',
          attempt: 2,
        });
      },
      { requestId: 'request-1', runId: 'run-1' },
    );
  });

  it('only captures prompt and output payloads after explicit opt-in', () => {
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'public');
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'secret');
    vi.stubEnv('LANGFUSE_BASE_URL', 'https://cloud.langfuse.com');
    vi.stubEnv('LANGFUSE_RECORD_IO', 'true');

    const config = telemetryConfig();
    if (!('experimental_telemetry' in config)) throw new Error('telemetry was not enabled');
    const settings = config.experimental_telemetry;
    expect(settings.recordInputs).toBe(true);
    expect(settings.recordOutputs).toBe(true);
  });
});
