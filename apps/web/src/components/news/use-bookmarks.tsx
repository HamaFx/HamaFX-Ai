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

// localStorage-backed article bookmarks. Personal app, no server-side
// bookmark store (yet) — keeping the saved set in localStorage means the
// user gets persistence without us shipping a new DB table just for this.
//
// Storage key: hamafx:news:bookmarks → JSON array of article ids.
// Cross-tab sync via the `storage` event so toggling on one tab updates
// the badge on another.

import { useBookmarksContext } from './bookmarks-context';

export function useBookmarks() {
  const { bookmarks, isBookmarked, toggleBookmark } = useBookmarksContext();

  return {
    has: isBookmarked,
    toggle: toggleBookmark,
    list: bookmarks,
    count: bookmarks.length,
  };
}
