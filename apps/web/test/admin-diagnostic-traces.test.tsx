// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

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

describe('AdminDiagnosticTraces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    traceParam = 'trace-1';
    mockApiFetch.mockImplementation((input: string) => {
      if (input.includes('/explorer')) {
        return Promise.resolve({
          events: [],
          stats: { total: 0, bySource: {}, failures: 0 },
        });
      }
      return new Promise(() => undefined);
    });
  });

  afterEach(() => cleanup());

  it('renders correlated timeline events and submits a run-id search', async () => {
    traceParam = null;
    mockApiFetch.mockImplementation((input: string) => {
      if (input.includes('/explorer')) {
        return Promise.resolve({
          events: [{
            id: 'tool:1',
            source: 'tool',
            timestamp: new Date().toISOString(),
            name: 'tool:get_candles',
            status: 'completed',
            traceId: 'trace-1',
            runId: 'run-1',
            jobId: 'job-1',
            threadId: 'thread-1',
            messageId: 'message-1',
            userId: 'user-1',
            durationMs: 42,
            error: null,
            metadata: null,
          }],
          stats: { total: 1, bySource: { tool: 1 }, failures: 0 },
        });
      }
      return Promise.reject(new Error('unexpected detail request'));
    });

    render(<AdminDiagnosticTraces />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('tool:get_candles')).toBeInTheDocument();
    expect(screen.getByText('Events')).toBeInTheDocument();
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('Run ID'), { target: { value: 'run-1' } });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    expect(mockPush).toHaveBeenCalledWith('/admin?tab=traces&runId=run-1');
  });

  it('does not render a late detail response after the trace is closed', async () => {
    let resolveDetail!: (value: unknown) => void;
    mockApiFetch.mockImplementation((input: string) => {
      if (input.includes('/explorer')) {
        return Promise.resolve({
          events: [
            {
              id: 'trace:trace-1',
              source: 'trace',
              timestamp: new Date().toISOString(),
              name: 'diagnostic.trace',
              status: 'completed',
              traceId: 'trace-1',
              runId: null,
              jobId: null,
              threadId: 'thread-1',
              messageId: null,
              userId: 'user-1',
              durationMs: 10,
              error: null,
              metadata: null,
            },
          ],
          stats: { total: 1, bySource: { trace: 1 }, failures: 0 },
        });
      }
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
          id: 'late-trace',
          threadId: 'thread-late',
          userId: 'user-1',
          startedAt: new Date().toISOString(),
          stepCount: 0,
          errorCount: 0,
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
