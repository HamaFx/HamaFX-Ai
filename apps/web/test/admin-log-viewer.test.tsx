// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { AdminLogViewer } from '@/app/(app)/admin/_components/admin-log-viewer';

class MockEventSource {
  static instances: MockEventSource[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();

  constructor(public readonly url: string) {
    MockEventSource.instances.push(this);
  }
}

const originalEventSource = globalThis.EventSource;
const originalFetch = globalThis.fetch;

describe('AdminLogViewer', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.stubGlobal('EventSource', originalEventSource);
    vi.stubGlobal('fetch', originalFetch);
  });

  it('probes before opening SSE and returns to idle on disconnect', async () => {
    render(<AdminLogViewer />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
      await Promise.resolve();
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/admin/logs/stream?probe=1',
      expect.objectContaining({ method: 'GET', signal: expect.any(AbortSignal) }),
    );
    expect(MockEventSource.instances).toHaveLength(1);

    act(() => {
      MockEventSource.instances[0]!.onopen?.();
    });
    expect(screen.getByText('Connected')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(MockEventSource.instances[0]!.close).toHaveBeenCalledOnce();
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('does not open SSE after disconnecting during the probe', async () => {
    let resolveProbe!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise((resolve) => {
      resolveProbe = resolve;
    })));

    render(<AdminLogViewer />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

    await act(async () => {
      resolveProbe(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      await Promise.resolve();
    });

    expect(MockEventSource.instances).toHaveLength(0);
  });

  it('does not update status after disconnecting during a disabled probe', async () => {
    let resolveProbe!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise((resolve) => {
      resolveProbe = resolve;
    })));

    render(<AdminLogViewer />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

    await act(async () => {
      resolveProbe(new Response(JSON.stringify({ error: { message: 'disabled' } }), { status: 503 }));
      await Promise.resolve();
    });

    expect(screen.getByText('Disconnected')).toBeInTheDocument();
    expect(screen.queryByText('disabled')).not.toBeInTheDocument();
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it('ignores SSE messages after disconnect', async () => {
    render(<AdminLogViewer />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
      await Promise.resolve();
    });

    const source = MockEventSource.instances[0]!;
    act(() => source.onopen?.());
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

    act(() => source.onmessage?.({ data: 'late log line' } as MessageEvent));
    expect(screen.queryByText('late log line')).not.toBeInTheDocument();
  });
});
