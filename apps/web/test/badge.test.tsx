// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Badge } from '@/components/ui/badge';

describe('Badge', () => {
  it('renders children as text content', () => {
    render(<Badge>admin</Badge>);
    expect(screen.getByText('admin')).toBeInTheDocument();
  });

  it('applies the uppercase text style', () => {
    const { container } = render(<Badge tone="brand">admin</Badge>);
    const span = container.firstElementChild!;
    expect(span.className).toContain('uppercase');
    expect(span.className).toContain('font-bold');
  });

  it('defaults to neutral tone', () => {
    const { container } = render(<Badge>default</Badge>);
    const span = container.firstElementChild!;
    expect(span.className).toContain('bg-bg-elev-2');
    expect(span.className).toContain('text-fg-muted');
  });

  it.each([
    ['success', 'bg-success/10', 'text-success'],
    ['danger', 'bg-danger/10', 'text-danger'],
    ['warn', 'bg-warn/10', 'text-warn'],
    ['brand', 'bg-brand/10', 'text-brand'],
    ['neutral', 'bg-bg-elev-2', 'text-fg-muted'],
  ] as const)('applies correct classes for tone "%s"', (tone, bgClass, textClass) => {
    const { container } = render(<Badge tone={tone}>label</Badge>);
    const span = container.firstElementChild!;
    expect(span.className).toContain(bgClass);
    expect(span.className).toContain(textClass);
  });

  it('merges custom className with tone classes', () => {
    const { container } = render(<Badge tone="danger" className="ml-2">custom</Badge>);
    const span = container.firstElementChild!;
    expect(span.className).toContain('ml-2');
    expect(span.className).toContain('bg-danger/10');
  });

  it('renders as a span by default', () => {
    const { container } = render(<Badge>span</Badge>);
    expect(container.firstElementChild?.tagName).toBe('SPAN');
  });

  it('has inline-flex display', () => {
    const { container } = render(<Badge>inline</Badge>);
    const span = container.firstElementChild!;
    expect(span.className).toContain('inline-flex');
  });
});
