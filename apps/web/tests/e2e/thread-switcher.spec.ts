/**
 * Copyright 2026 Kestrel
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

// ---------------------------------------------------------------------------
// E2E: Thread switcher (Phase 6)
//
// Verifies the conversation switcher drawer: opens from the conversation
// menu, lists threads, filters by search, and exposes bulk-select mode
// with proper checkbox semantics. Threads are created through the real
// API (which auto-titles them), so search assertions target the "no
// matches" and "all rows" ends rather than specific titles.
// ---------------------------------------------------------------------------

import { test, expect } from './fixtures';

async function createThread(page: import('@playwright/test').Page) {
  // The request proxy enforces a CSRF double-submit cookie on state-changing
  // requests. `page.request` shares the browser cookie jar, so read the
  // minted cookie back and echo it as the required header.
  const cookies = await page.context().cookies();
  const csrf = cookies.find((c) => c.name === 'hfx_csrf' || c.name === '__Host-hfx_csrf')?.value;
  const res = await page.request.post('/api/chat/threads', {
    data: {},
    ...(csrf ? { headers: { 'x-csrf-token': csrf } } : {}),
  });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { thread?: { id: string } };
  return body.thread?.id;
}

/**
 * The shared vaul Drawer exposes the dialog name through DrawerTitle's
 * auto-wired aria-labelledby; fall back to the visible title if a given
 * browser/vaul build doesn't expose it as an accessible name.
 */
function conversationsDrawer(page: import('@playwright/test').Page) {
  return page
    .getByRole('dialog', { name: /conversations/i })
    .or(page.getByText('Conversations').first());
}

/**
 * Open the conversation switcher. The menu button is server-rendered, so a
 * click can land before React hydrates and attaches the handler — retry
 * until the "Switch conversation" menu item actually appears.
 */
async function openConversationSwitcher(page: import('@playwright/test').Page) {
  const menu = page.getByRole('button', { name: /conversation menu/i });
  const switchItem = page.getByText('Switch conversation');
  for (let attempt = 0; attempt < 3; attempt++) {
    await menu.click();
    try {
      await switchItem.click({ timeout: 5_000 });
      return;
    } catch {
      // Menu did not open (hydration race) — click again.
    }
  }
  throw new Error('Conversation menu did not open after 3 attempts');
}

test.describe('Thread switcher', () => {
  test('opens from the conversation menu', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/chat');

    await openConversationSwitcher(page);

    await expect(conversationsDrawer(page).first()).toBeVisible();
    // The list shows many threads titled "New conversation"; target the
    // dedicated new-conversation action button instead of the shared text.
    await expect(page.getByRole('button', { name: 'New conversation', exact: true })).toBeVisible();
  });

  test('search filters the thread list', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/chat');

    // Ensure 2+ threads exist so the search box renders.
    await createThread(page);
    await createThread(page);
    await page.reload();

    await openConversationSwitcher(page);

    const search = page.getByRole('searchbox', { name: /search conversations/i });
    await expect(search).toBeVisible();

    // A nonsense query must produce the no-matches state.
    await search.fill('zzzz-no-such-thread');
    await expect(page.getByText('No matches')).toBeVisible();

    // Clearing restores the rows (the New conversation entry is always present).
    await search.fill('');
    await expect(page.getByText('No matches')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'New conversation', exact: true })).toBeVisible();
  });

  test('bulk-select mode exposes checkbox semantics and counts selections', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/chat');

    await createThread(page);
    await createThread(page);
    await page.reload();

    await openConversationSwitcher(page);

    // Enter select mode
    await page.getByRole('button', { name: /^select$/i }).click();

    // Conversation rows become checkboxes (aria-checked semantics)
    const checkboxes = page.locator('[role="checkbox"]');
    await expect(checkboxes.first()).toBeAttached();
    await expect(page.getByText('0 selected')).toBeVisible();

    // Select one row
    await checkboxes.first().click();
    await expect(page.getByText('1 selected')).toBeVisible();

    // The bulk delete button becomes enabled
    const deleteBtn = page.getByRole('button', { name: /delete 1 selected/i });
    await expect(deleteBtn).toBeEnabled();

    // Cancel exits select mode. The select-mode toggle also re-labels
    // itself "Cancel" when active, so scope to the bulk-actions toolbar.
    await page.getByLabel('Bulk actions').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('[role="checkbox"]')).toHaveCount(0);
  });
});
