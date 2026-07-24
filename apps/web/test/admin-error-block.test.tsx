// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom

import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { AdminErrorBlock } from '@/app/(app)/admin/_components/admin-error-block';

describe('AdminErrorBlock', () => {
  afterEach(() => cleanup());

  it('renders the error message', () => {
    render(<AdminErrorBlock message="Something went wrong" onRetry={vi.fn()} />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders a Retry button', () => {
    render(<AdminErrorBlock message="Error" onRetry={vi.fn()} />);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('calls onRetry when the button is clicked', () => {
    const onRetry = vi.fn();
    render(<AdminErrorBlock message="Error" onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('applies danger color to the error text', () => {
    const { container } = render(<AdminErrorBlock message="Error" onRetry={vi.fn()} />);
    const messageEl = container.querySelector('.text-danger');
    expect(messageEl).toBeInTheDocument();
    expect(messageEl!.textContent).toBe('Error');
  });

  it('centers the content', () => {
    const { container } = render(<AdminErrorBlock message="Error" onRetry={vi.fn()} />);
    const wrapper = container.firstElementChild!;
    expect(wrapper.className).toContain('text-center');
    expect(wrapper.className).toContain('flex');
    expect(wrapper.className).toContain('flex-col');
  });
});
