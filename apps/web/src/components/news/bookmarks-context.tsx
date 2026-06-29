'use client';

import React, { createContext, useContext, useCallback, useMemo } from 'react';
import { useLocalStorage } from '@/hooks/use-local-storage';

interface BookmarksState {
  bookmarks: string[];
  isBookmarked: (id: string) => boolean;
}

interface BookmarksActions {
  toggleBookmark: (id: string) => void;
}

const StateContext = createContext<BookmarksState | null>(null);
const ActionsContext = createContext<BookmarksActions | null>(null);

const STORAGE_KEY = 'hamafx:news:bookmarks';

export function BookmarksProvider({ children }: { children: React.ReactNode }) {
  const [bookmarkIds, setBookmarkIds] = useLocalStorage<string[]>(STORAGE_KEY, []);

  const bookmarkSet = useMemo(() => new Set(bookmarkIds), [bookmarkIds]);

  const isBookmarked = useCallback((id: string) => bookmarkSet.has(id), [bookmarkSet]);

  const toggleBookmark = useCallback((id: string) => {
    setBookmarkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return [...next];
    });
  }, [setBookmarkIds]);

  const state = useMemo(
    () => ({ bookmarks: bookmarkIds, isBookmarked }),
    [bookmarkIds, isBookmarked],
  );

  const actions = useMemo(
    () => ({ toggleBookmark }),
    [toggleBookmark],
  );

  return (
    <StateContext.Provider value={state}>
      <ActionsContext.Provider value={actions}>
        {children}
      </ActionsContext.Provider>
    </StateContext.Provider>
  );
}

function useBookmarksState(): BookmarksState {
  const context = useContext(StateContext);
  if (!context) {
    throw new Error('useBookmarksState must be used within a BookmarksProvider');
  }
  return context;
}

function useBookmarksActions(): BookmarksActions {
  const context = useContext(ActionsContext);
  if (!context) {
    throw new Error('useBookmarksActions must be used within a BookmarksProvider');
  }
  return context;
}

export function useBookmarksContext(): BookmarksState & BookmarksActions {
  return { ...useBookmarksState(), ...useBookmarksActions() };
}
