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

import React, { createContext, useContext, useCallback, useMemo } from 'react';
import { useLocalStorage } from '@/hooks/use-local-storage';

interface BookmarksContextValue {
  bookmarks: string[];
  isBookmarked: (id: string) => boolean;
  toggleBookmark: (id: string) => void;
}

const BookmarksContext = createContext<BookmarksContextValue | null>(null);

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

  const value = useMemo(
    () => ({
      bookmarks: bookmarkIds,
      isBookmarked,
      toggleBookmark,
    }),
    [bookmarkIds, isBookmarked, toggleBookmark],
  );

  return <BookmarksContext.Provider value={value}>{children}</BookmarksContext.Provider>;
}

export function useBookmarksContext() {
  const context = useContext(BookmarksContext);
  if (!context) {
    throw new Error('useBookmarksContext must be used within a BookmarksProvider');
  }
  return context;
}
