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
import { StaleIndicator } from '@/components/ui/stale-indicator';

afterEach(cleanup);

describe('StaleIndicator', () => {
  it('renders nothing when isFetching is false', () => {
    const { container } = render(<StaleIndicator isFetching={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders default label when isFetching is true', () => {
    render(<StaleIndicator isFetching={true} />);
    expect(screen.getByText('updating')).toBeTruthy();
  });

  it('renders custom label when provided', () => {
    render(<StaleIndicator isFetching={true} label="refreshing" />);
    expect(screen.getByText('refreshing')).toBeTruthy();
  });

  it('renders with role="alert" and aria-live="assertive"', () => {
    render(<StaleIndicator isFetching={true} />);
    const el = screen.getByRole('alert');
    expect(el).toBeTruthy();
    expect(el.getAttribute('aria-live')).toBe('assertive');
  });

  it('renders an animated spinner icon', () => {
    const { container } = render(<StaleIndicator isFetching={true} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg!.classList.contains('animate-spin')).toBe(true);
  });

  it('applies additional className', () => {
    render(<StaleIndicator isFetching={true} className="extra-class" />);
    const el = screen.getByRole('alert');
    expect(el.classList.contains('extra-class')).toBe(true);
  });
});
