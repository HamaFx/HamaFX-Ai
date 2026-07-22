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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { usePopupMenu } from '@/hooks/use-popup-menu';

function TestMenu({ focusFirstOnOpen = true }: { focusFirstOnOpen?: boolean }) {
  const { open, toggle, triggerProps, menuProps, menuRef, triggerRef } = usePopupMenu({
    focusFirstOnOpen,
  });

  return (
    <>
      <button type="button" ref={triggerRef} {...triggerProps} onClick={toggle}>
        Menu
      </button>
      {open ? (
        <div ref={menuRef} {...menuProps} data-testid="menu">
          <button type="button" role="menuitem">
            Item 1
          </button>
          <button type="button" role="menuitem">
            Item 2
          </button>
        </div>
      ) : null}
    </>
  );
}

afterEach(cleanup);

describe('usePopupMenu', () => {
  it('exposes correct ARIA attributes on the trigger when closed', () => {
    render(<TestMenu />);
    const trigger = screen.getByRole('button', { name: 'Menu' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-controls');
  });

  it('opens the menu and focuses the first item by default', () => {
    render(<TestMenu />);
    const trigger = screen.getByRole('button', { name: 'Menu' });
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('menu')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')[0]). toHaveFocus();
  });

  it('does not auto-focus the first item when focusFirstOnOpen is false', () => {
    render(<TestMenu focusFirstOnOpen={false} />);
    const trigger = screen.getByRole('button', { name: 'Menu' });
    trigger.focus();
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('menu')).toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('supports arrow-key roving focus inside the menu', () => {
    render(<TestMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));

    const items = screen.getAllByRole('menuitem');
    expect(items[0]).toHaveFocus();

    fireEvent.keyDown(items[0], { key: 'ArrowDown' });
    expect(items[1]).toHaveFocus();

    fireEvent.keyDown(items[1], { key: 'ArrowUp' });
    expect(items[0]).toHaveFocus();

    fireEvent.keyDown(items[0], { key: 'End' });
    expect(items[1]).toHaveFocus();

    fireEvent.keyDown(items[1], { key: 'Home' });
    expect(items[0]).toHaveFocus();
  });

  it('closes the menu and returns focus to the trigger on Escape', () => {
    render(<TestMenu />);
    const trigger = screen.getByRole('button', { name: 'Menu' });
    fireEvent.click(trigger);

    fireEvent.keyDown(screen.getAllByRole('menuitem')[0], { key: 'Escape' });
    expect(screen.queryByTestId('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes the menu when clicking outside', () => {
    const { container } = render(
      <div>
        <TestMenu />
        <button type="button">Outside</button>
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.queryByTestId('menu')).toBeInTheDocument();

    const outside = screen.getByRole('button', { name: 'Outside' });
    // pointerdown is the event the hook listens for.
    fireEvent.pointerDown(outside);
    expect(screen.queryByTestId('menu')).not.toBeInTheDocument();
  });
});
