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

import React from 'react';
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PartSkeletonCard, PartErrorCard } from '@/components/chat/parts/_shared';

afterEach(cleanup);

describe('PartSkeletonCard', () => {
  it('renders with default label', () => {
    render(<PartSkeletonCard />);
    const el = screen.getByLabelText('Loading');
    expect(el).toBeTruthy();
  });

  it('renders with custom label', () => {
    render(<PartSkeletonCard label="Fetching candles" />);
    const el = screen.getByLabelText('Fetching candles');
    expect(el).toBeTruthy();
  });

  it('renders with aria-busy="true"', () => {
    render(<PartSkeletonCard />);
    const el = screen.getByLabelText('Loading');
    expect(el.getAttribute('aria-busy')).toBe('true');
  });

  it('renders 3 skeleton rows by default', () => {
    const { container } = render(<PartSkeletonCard />);
    // Skeleton components use the 'shimmer' CSS class (defined in globals.css)
    const skeletons = container.querySelectorAll('.shimmer');
    // 1 header skeleton + 3 row skeletons = 4 total
    expect(skeletons.length).toBe(4);
  });

  it('renders custom number of rows', () => {
    const { container } = render(<PartSkeletonCard rows={5} />);
    const skeletons = container.querySelectorAll('.shimmer');
    // 1 header skeleton + 5 row skeletons = 6 total
    expect(skeletons.length).toBe(6);
  });

  it('renders 1 row when rows=1', () => {
    const { container } = render(<PartSkeletonCard rows={1} />);
    const skeletons = container.querySelectorAll('.shimmer');
    expect(skeletons.length).toBe(2); // 1 header + 1 row
  });

  it('applies additional className', () => {
    render(<PartSkeletonCard className="my-custom-class" />);
    const el = screen.getByLabelText('Loading');
    expect(el.classList.contains('my-custom-class')).toBe(true);
  });
});

describe('PartErrorCard', () => {
  it('renders with default label', () => {
    render(<PartErrorCard />);
    expect(screen.getByText(/Tool failed/)).toBeTruthy();
  });

  it('renders with custom label', () => {
    render(<PartErrorCard label="Provider error" />);
    expect(screen.getByText(/Provider error/)).toBeTruthy();
  });

  it('renders error message when provided', () => {
    render(<PartErrorCard message="API rate limit exceeded" />);
    expect(screen.getByText(/API rate limit exceeded/)).toBeTruthy();
  });

  it('renders with role="alert"', () => {
    render(<PartErrorCard message="Error!" />);
    const el = screen.getByRole('alert');
    expect(el).toBeTruthy();
  });

  it('renders label and message together', () => {
    render(<PartErrorCard label="Cache miss" message="Redis timeout" />);
    expect(screen.getByText(/Cache miss/)).toBeTruthy();
    expect(screen.getByText(/Redis timeout/)).toBeTruthy();
  });

  it('does not render bullet when message is omitted', () => {
    render(<PartErrorCard />);
    // Should show "Tool failed" without any bullet separator content
    expect(screen.getByText(/Tool failed/)).toBeTruthy();
    // No bullet separator should appear
    expect(screen.queryByText(/·/)).toBeNull();
  });
});
