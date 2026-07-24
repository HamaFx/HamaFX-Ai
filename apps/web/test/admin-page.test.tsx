// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const mockReplace = vi.fn();
let mockSearchParams = new Map<string, string>();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams.get(key) ?? null,
  }),
}));

vi.mock('next/dynamic', () => ({
  default: () => {
    function Placeholder() {
      return <div>Tab content</div>;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return Placeholder as any;
  },
}));

import AdminPage from '@/app/(app)/admin/page';

describe('AdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the default health tab when no tab param is provided', () => {
    render(<AdminPage />);

    const healthTab = screen.getByRole('tab', { name: /Health/i });
    expect(healthTab).toHaveAttribute('aria-selected', 'true');
  });

  it('selects the tab matching the URL param', () => {
    mockSearchParams.set('tab', 'users');
    render(<AdminPage />);

    const usersTab = screen.getByRole('tab', { name: /Users/i });
    expect(usersTab).toHaveAttribute('aria-selected', 'true');
  });

  it('rewrites an unknown tab param to the default', () => {
    mockSearchParams.set('tab', 'nope');
    render(<AdminPage />);

    expect(mockReplace).toHaveBeenCalledWith('/admin', { scroll: false });
  });

  it('supports arrow key navigation between tabs', () => {
    render(<AdminPage />);

    const healthTab = screen.getByRole('tab', { name: /Health/i });
    healthTab.focus();

    fireEvent.keyDown(healthTab, { key: 'ArrowRight' });
    expect(mockReplace).toHaveBeenCalledWith('/admin?tab=onboarding', { scroll: false });
  });

  it('moves focus to the tabpanel on ArrowDown', () => {
    render(<AdminPage />);

    const healthTab = screen.getByRole('tab', { name: /Health/i });
    healthTab.focus();

    fireEvent.keyDown(healthTab, { key: 'ArrowDown' });

    const panel = document.activeElement;
    expect(panel).toHaveAttribute('role', 'tabpanel');
  });
});
