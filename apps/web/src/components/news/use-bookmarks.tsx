'use client';

// localStorage-backed article bookmarks. Personal app, no server-side
// bookmark store (yet) — keeping the saved set in localStorage means the
// user gets persistence without us shipping a new DB table just for this.
//
// Storage key: hamafx:news:bookmarks → JSON array of article ids.
// Cross-tab sync via the `storage` event so toggling on one tab updates
// the badge on another.

import { useCallback, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'hamafx:news:bookmarks';

function read(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.filter((v) => typeof v === 'string'));
  } catch {
    /* ignore */
  }
  return new Set();
}

function write(set: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* quota exceeded — drop quietly */
  }
}

export function useBookmarks() {
  const [ids, setIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setIds(read());
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setIds(read());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const has = useCallback((id: string) => ids.has(id), [ids]);

  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      write(next);
      return next;
    });
  }, []);

  const list = useMemo(() => [...ids], [ids]);

  return { has, toggle, list, count: ids.size };
}
