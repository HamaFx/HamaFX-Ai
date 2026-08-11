// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

const mockPush = vi.hoisted(() => vi.fn());
const mockApiFetch = vi.hoisted(() => vi.fn());
let traceParam: string | null = 'trace-1';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: (key: string) => (key === 'trace' ? traceParam : key === 'tab' ? 'traces' : null) }),
}));

vi.mock('@/lib/api-client', () => ({ apiFetch: mockApiFetch }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AdminDiagnosticTraces } from '@/app/(app)/admin/_components/admin-diagnostic-traces';

function summary(id: string) {
  return {
    id,
    threadId: `thread-${id}`,
    userId: 'user-1',
    startedAt: new Date().toISOString(),
    stepCount: 1,
    errorCount: 0,
  };
}

describe('AdminDiagnosticTraces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    traceParam = 'trace-1';
    mockApiFetch.mockImplementation((input: string) => {
      if (input.includes('/traces?')) return Promise.resolve({ traces: [summary('trace-1')] });
      return new Promise(() => undefined);
    });
  });

  afterEach(() => cleanup());

  it('does not render a late detail response after the trace is closed', async () => {
    let resolveDetail!: (value: unknown) => void;
    mockApiFetch.mockImplementation((input: string) => {
      if (input.includes('/traces?')) return Promise.resolve({ traces: [summary('trace-1')] });
      return new Promise((resolve) => {
        resolveDetail = resolve;
      });
    });

    const { rerender } = render(<AdminDiagnosticTraces />);
    await act(async () => {
      await Promise.resolve();
    });

    traceParam = null;
    rerender(<AdminDiagnosticTraces />);
    await act(async () => {
      resolveDetail({
        trace: {
          ...summary('late-trace'),
          status: 'completed',
          durationMs: 10,
          summary: null,
          steps: [],
          errors: [],
        },
      });
      await Promise.resolve();
    });

    expect(screen.queryByText('late-trace')).not.toBeInTheDocument();
  });
});
