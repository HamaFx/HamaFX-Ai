// @vitest-environment jsdom
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

// @vitest-environment jsdom

import React from 'react';
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EmptyState } from '@/components/ui/empty-state';

afterEach(cleanup);

describe('EmptyState', () => {
  const defaultIcon = <span data-testid="test-icon">🔍</span>;

  it('renders title and icon', () => {
    render(<EmptyState icon={defaultIcon} title="No data found" />);
    expect(screen.getByText('No data found')).toBeTruthy();
    expect(screen.getByTestId('test-icon')).toBeTruthy();
  });

  it('renders with role="status" and correct aria-label', () => {
    render(<EmptyState icon={defaultIcon} title="No results" />);
    const el = screen.getByRole('status');
    expect(el).toBeTruthy();
    expect(el.getAttribute('aria-label')).toBe('No results');
  });

  it('renders description when provided', () => {
    render(
      <EmptyState icon={defaultIcon} title="Empty" description="There is nothing here yet." />,
    );
    expect(screen.getByText('There is nothing here yet.')).toBeTruthy();
  });

  it('does not render description when omitted', () => {
    const { container } = render(<EmptyState icon={defaultIcon} title="Empty" />);
    // Should only be one paragraph (the title), no description paragraph
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBe(1);
  });

  it('renders action when provided', () => {
    render(
      <EmptyState
        icon={defaultIcon}
        title="Empty"
        action={<button>Create</button>}
      />,
    );
    expect(screen.getByText('Create')).toBeTruthy();
  });

  it('does not render action when omitted', () => {
    const { container } = render(<EmptyState icon={defaultIcon} title="Empty" />);
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(0);
  });

  it('has border by default (bare=false)', () => {
    const { container } = render(<EmptyState icon={defaultIcon} title="Empty" />);
    const div = container.querySelector('[role="status"]');
    expect(div!.classList.contains('border')).toBe(true);
  });

  it('removes border when bare=true', () => {
    const { container } = render(<EmptyState icon={defaultIcon} title="Empty" bare />);
    const div = container.querySelector('[role="status"]');
    expect(div!.classList.contains('border')).toBe(false);
  });

  it('applies brand icon container size for tone="brand"', () => {
    const { container } = render(
      <EmptyState icon={defaultIcon} title="Empty" tone="brand" />,
    );
    const iconSpan = container.querySelector('[aria-hidden="true"]');
    expect(iconSpan!.classList.contains('h-20')).toBe(true);
    expect(iconSpan!.classList.contains('w-20')).toBe(true);
  });

  it('applies muted icon container size for tone="muted" (default)', () => {
    const { container } = render(<EmptyState icon={defaultIcon} title="Empty" />);
    const iconSpan = container.querySelector('[aria-hidden="true"]');
    expect(iconSpan!.classList.contains('h-16')).toBe(true);
    expect(iconSpan!.classList.contains('w-16')).toBe(true);
  });

  it('applies additional className', () => {
    const { container } = render(
      <EmptyState icon={defaultIcon} title="Empty" className="my-custom-class" />,
    );
    const div = container.querySelector('[role="status"]');
    expect(div!.classList.contains('my-custom-class')).toBe(true);
  });
});
