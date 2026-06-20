'use client';

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

// Data & cache card — local-storage management. The personal app keeps
// bookmarks and prefs in localStorage; this card lets the user clear
// individual keys or wipe everything stored on this device.

import { Bookmark, MessageSquare, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-drawer';

import { clearChatHistoryAction } from '../actions';
import { SettingsRow } from './settings-row';

const KEY_BOOKMARKS = 'hamafx:news:bookmarks';
const KEY_PREFS = 'hamafx:prefs';

interface Counts {
  bookmarks: number;
  storage: number;
}

function readCounts(): Counts {
  if (typeof window === 'undefined') return { bookmarks: 0, storage: 0 };
  let bookmarks = 0;
  let storage = 0;
  try {
    const raw = window.localStorage.getItem(KEY_BOOKMARKS);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) bookmarks = parsed.length;
    }
  } catch {
    /* ignore */
  }
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith('hamafx:')) storage += 1;
  }
  return { bookmarks, storage };
}

  export function DataCard() {
  const [counts, setCounts] = useState<Counts>({ bookmarks: 0, storage: 0 });
  const [confirmEl, confirm] = useConfirm();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setCounts(readCounts());
    function onStorage(e: StorageEvent) {
      if (!e.key || e.key.startsWith('hamafx:')) setCounts(readCounts());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  async function clearChatHistory() {
    const ok = await confirm({
      title: 'Clear chat history?',
      description: 'This will permanently delete all conversations from the server. This action cannot be undone.',
      confirmLabel: 'Delete all',
      tone: 'danger',
    });
    if (!ok) return;

    startTransition(async () => {
      const result = await clearChatHistoryAction();
      if (result.ok) {
        toast.success('Chat history cleared');
      } else {
        toast.error('Failed to clear chat history', { description: result.error });
      }
    });
  }

  async function clearBookmarks() {
    const ok = await confirm({
      title: 'Clear saved articles?',
      description: `${counts.bookmarks} bookmark${counts.bookmarks === 1 ? '' : 's'} will be removed from this device.`,
      confirmLabel: 'Clear',
      tone: 'danger',
    });
    if (!ok) return;
    window.localStorage.removeItem(KEY_BOOKMARKS);
    setCounts(readCounts());
    toast.success('Bookmarks cleared');
  }

  async function resetPrefs() {
    const ok = await confirm({
      title: 'Reset preferences?',
      description: 'Default symbol, time format, and motion settings will go back to defaults.',
      confirmLabel: 'Reset',
      tone: 'danger',
    });
    if (!ok) return;
    window.localStorage.removeItem(KEY_PREFS);
    setCounts(readCounts());
    toast.success('Preferences reset', {
      description: 'Reload the page to apply.',
    });
  }

  async function clearAll() {
    const ok = await confirm({
      title: 'Clear all local data?',
      description:
        'Removes bookmarks, preferences, and any other locally cached state. Server-side data (alerts, journal) is untouched.',
      confirmLabel: 'Clear everything',
      tone: 'danger',
    });
    if (!ok) return;
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('hamafx:')) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
    setCounts(readCounts());
    toast.success('All local data cleared');
  }

  return (
    <section
      aria-labelledby="data-heading"
      className="border border-divider bg-bg-elev-1 rounded-lg flex flex-col gap-1 p-4"
    >
      <header className="flex items-center gap-3 pb-2">
        <h2 id="data-heading" className="text-fg text-base font-semibold tracking-tight">
          Data & cache
        </h2>
      </header>

      <SettingsRow
        icon={<MessageSquare className="size-4" />}
        label="Chat history"
        description="Permanently delete all server-side conversations"
        action={
          <Button
            type="button"
            size="sm"
            variant="danger"
            onClick={() => void clearChatHistory()}
            disabled={isPending}
          >
            <Trash2 className="size-3.5" />
            Delete all
          </Button>
        }
      />

      <RowDivider />

      <SettingsRow
        icon={<Bookmark className="size-4" />}
        label="Saved articles"
        description={`${counts.bookmarks} bookmark${counts.bookmarks === 1 ? '' : 's'} stored`}
        action={
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void clearBookmarks()}
            disabled={counts.bookmarks === 0}
          >
            <Trash2 className="size-3.5" />
            Clear
          </Button>
        }
      />

      <RowDivider />

      <SettingsRow
        icon={<RotateCcw className="size-4" />}
        label="Reset preferences"
        description="Clear local theme + default symbol overrides"
        action={
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void resetPrefs()}
          >
            Reset
          </Button>
        }
      />

      <RowDivider />

      <SettingsRow
        icon={<Trash2 className="size-4" />}
        label="Clear all local data"
        description={`${counts.storage} key${counts.storage === 1 ? '' : 's'} on this device`}
        action={
          <Button
            type="button"
            size="sm"
            variant="danger"
            onClick={() => void clearAll()}
            disabled={counts.storage === 0}
          >
            Clear all
          </Button>
        }
      />

      {confirmEl}
    </section>
  );
}

function RowDivider() {
  return <div className="border-divider/60 -mx-4 my-1 border-t" />;
}
