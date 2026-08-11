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

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { TextPart } from '@/components/chat/parts/text';
import { PasswordField } from '@/app/(auth)/_components/password-field';

afterEach(cleanup);

const root = resolve(process.cwd(), '../..');
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), 'utf8');

describe('Phase 7 — chat message reading', () => {
  it('preserves line breaks while streaming (no layout jump on finish)', () => {
    render(
      <TextPart
        role="assistant"
        isStreaming
        text={'First paragraph\n\nSecond paragraph'}
      />,
    );
    const el = screen.getByText(/First paragraph/);
    expect(el.className).toContain('whitespace-pre-line');
  });

  it('does not attach a live region to the visible streaming text', () => {
    const { container } = render(
      <TextPart role="assistant" isStreaming text="streaming…" />,
    );
    // The debounced sr-only StreamingLiveRegion owns announcements; a live
    // region here would re-announce the entire history on re-render.
    expect(container.querySelector('[aria-live]')).toBeNull();
  });

  it('marks the streaming caret as decorative', () => {
    const { container } = render(
      <TextPart role="assistant" isStreaming text="hello" />,
    );
    const caret = container.querySelector('.animate-pulse');
    expect(caret).not.toBeNull();
    expect(caret?.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders raw text (no markdown processing) while streaming', () => {
    render(
      <TextPart role="assistant" isStreaming text="**bold** not parsed yet" />,
    );
    // The literal asterisks stay visible until the finished markdown render.
    expect(screen.getByText('**bold** not parsed yet')).toBeTruthy();
    expect(screen.queryByRole('strong')).toBeNull();
  });
});

describe('Phase 9 — auth components', () => {
  it('keeps the password visibility toggle keyboard-reachable', () => {
    render(<PasswordField value="" onChange={() => {}} />);
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle.getAttribute('tabindex')).not.toBe('-1');
  });

  it('toggles the password type and announces state via aria-pressed', () => {
    const { container } = render(<PasswordField value="secret" onChange={() => {}} />);
    const passwordInput = container.querySelector('#password') as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(passwordInput.type).toBe('text');
    expect(screen.getByRole('button', { name: 'Hide password' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('Phase 7–9 source contracts', () => {
  const messageSource = read('apps/web/src/components/chat/message.tsx');
  const entryListSource = read('apps/web/src/app/(app)/journal/_components/entry-list.tsx');
  const entryFormSource = read('apps/web/src/app/(app)/journal/_components/entry-form.tsx');
  const journalViewSource = read('apps/web/src/app/(app)/journal/_components/journal-view.tsx');
  const alertListSource = read('apps/web/src/app/(app)/alerts/_components/alert-list.tsx');
  const navDrawerSource = read('apps/web/src/components/layout/nav-drawer.tsx');
  const navTriggerSource = read('apps/web/src/components/layout/nav-trigger.tsx');
  const loginSource = read('apps/web/src/app/(auth)/login/page.tsx');
  const registerSource = read('apps/web/src/app/(auth)/register/page.tsx');

  it('message edit mode has an accessible label and keyboard save/cancel', () => {
    expect(messageSource).toContain('aria-label="Edit message"');
    expect(messageSource).toMatch(/e\.key === 'Escape'/);
    expect(messageSource).toMatch(/e\.metaKey \|\| e\.ctrlKey/);
  });

  it('journal search and filter controls expose state to assistive tech', () => {
    expect(entryListSource).toContain('aria-label="Search trades"');
    expect(entryListSource).toContain('aria-expanded={showFilters}');
    expect(entryListSource).toContain('aria-pressed={tab ===');
    expect(entryListSource).toContain('aria-pressed={symbolFilter === sym}');
  });

  it('journal notes use a multiline textarea with a live counter', () => {
    expect(entryFormSource).toContain('<textarea');
    expect(entryFormSource).toContain('rows={4}');
    expect(entryFormSource).toContain('/ 5,000');
  });

  it('journal header actions and loading state are announced', () => {
    expect(journalViewSource).toContain('aria-label="Import trades"');
    expect(journalViewSource).toContain('aria-label="Refresh logs"');
    expect(journalViewSource).toContain('role="status"');
  });

  it('alerts list announces loading and empty states', () => {
    expect(alertListSource).toContain('Loading alerts…');
    expect(alertListSource).toContain('ariaLabel="Filter alerts"');
  });

  it('nav drawer content carries the id referenced by the trigger', () => {
    expect(navDrawerSource).toContain('id="sidebar-nav"');
    expect(navTriggerSource).toContain('aria-controls="sidebar-nav"');
    expect(navDrawerSource).toMatch(/focus-visible:ring-2 focus-visible:ring-brand/);
  });

  it('auth forms link inputs to their error messages', () => {
    expect(loginSource).toContain("aria-describedby={state?.error ? 'form-error' : undefined}");
    expect(registerSource).toContain('aria-describedby={confirmTouched && !passwordsMatch ?');
  });
});
