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
import { cleanup, render } from '@testing-library/react';
import { Sparkline } from '@/components/ui/sparkline';

afterEach(cleanup);

describe('Sparkline', () => {
  it('renders placeholder div when fewer than 2 values', () => {
    const { container } = render(<Sparkline values={[42]} />);
    // Should render a div (no SVG) when < 2 points
    const svg = container.querySelector('svg');
    expect(svg).toBeNull();
    const div = container.querySelector('div');
    expect(div).toBeTruthy();
    expect(div!.classList.contains('h-4')).toBe(true);
  });

  it('renders SVG when 2 or more values', () => {
    const { container } = render(<Sparkline values={[10, 20]} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute('viewBox')).toBe('0 0 100 100');
  });

  it('renders SVG with multiple data points', () => {
    const { container } = render(<Sparkline values={[10, 20, 30, 40, 50]} />);
    const path = container.querySelector('path');
    expect(path).toBeTruthy();
    // Path should contain M and L commands
    expect(path!.getAttribute('d')).toContain('M');
    expect(path!.getAttribute('d')).toContain('L');
  });

  it('includes aria-label with trend information', () => {
    const { container } = render(<Sparkline values={[10, 30]} />);
    const svg = container.querySelector('svg');
    const ariaLabel = svg!.getAttribute('aria-label');
    expect(ariaLabel).toContain('10');
    expect(ariaLabel).toContain('30');
  });

  it('uses custom label in aria-label when provided', () => {
    const { container } = render(<Sparkline values={[10, 30]} label="Revenue" />);
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('aria-label')).toContain('Revenue');
  });

  it('applies custom stroke color', () => {
    const { container } = render(<Sparkline values={[10, 20]} stroke="#ff0000" />);
    const path = container.querySelector('path');
    expect(path!.getAttribute('stroke')).toBe('#ff0000');
  });

  it('defaults stroke to currentColor', () => {
    const { container } = render(<Sparkline values={[10, 20]} />);
    const path = container.querySelector('path');
    expect(path!.getAttribute('stroke')).toBe('currentColor');
  });

  it('applies className to the SVG', () => {
    const { container } = render(
      <Sparkline values={[10, 20]} className="my-sparkline" />,
    );
    const svg = container.querySelector('svg');
    expect(svg!.classList.contains('my-sparkline')).toBe(true);
  });
});
