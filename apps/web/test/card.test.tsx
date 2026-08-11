// @vitest-environment jsdom

import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';

afterEach(cleanup);

describe('Card', () => {
  it('renders the shared terminal surface by default', () => {
    const { container } = render(<Card>Content</Card>);
    const card = container.firstElementChild;

    expect(card?.classList.contains('border')).toBe(true);
    expect(card?.classList.contains('bg-bg-elev-1')).toBe(true);
    expect(screen.getByText('Content')).toBeTruthy();
  });

  it('supports semantic elements', () => {
    const { container } = render(<Card as="section">Section content</Card>);
    expect(container.firstElementChild?.tagName).toBe('SECTION');
  });

  it('preserves custom classes and composes slots', () => {
    render(
      <Card className="custom-card">
        <CardHeader>Header</CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    );

    expect(screen.getByText('Header').closest('.custom-card')).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();
    expect(screen.getByText('Footer')).toBeTruthy();
  });
});
