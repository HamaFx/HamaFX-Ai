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

// Auto-scroll hook extracted from chat-screen.tsx (H2 audit fix).
//
// Handles:
//   - Initial scroll-to-bottom (instant, not smooth)
//   - Auto-scroll on new messages (only when user is near bottom, ≤240px)
//   - Scroll-to-bottom FAB visibility tracking
//   - Instant scroll during streaming, smooth after streaming stops

import { useEffect, useState, useCallback } from 'react';

interface UseAutoScrollOptions {
  /** External ref to the scroll container element. */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Value that triggers auto-scroll when it changes (e.g. messages array). */
  dependency: unknown;
  /** Unique key that resets scroll position (e.g. threadId). */
  resetKey: string;
  /** Whether content is currently streaming. */
  isStreaming: boolean;
  /** Distance from bottom threshold (px) for auto-scroll eligibility. */
  threshold?: number;
}

interface UseAutoScrollResult {
  showScrollFab: boolean;
  scrollToBottom: () => void;
}

export function useAutoScroll({
  scrollRef,
  dependency,
  resetKey,
  isStreaming,
  threshold = 240,
}: UseAutoScrollOptions): UseAutoScrollResult {
  const [showScrollFab, setShowScrollFab] = useState(false);

  // Track scroll position to show/hide the "Scroll to Bottom" FAB.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollFab(dist > threshold);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => el.removeEventListener('scroll', handleScroll);
  }, [scrollRef, threshold]);

  // Initial scroll-to-bottom on reset. Instant, not smooth.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [resetKey, scrollRef]);

  // Auto-scroll on new content.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < threshold) {
      requestAnimationFrame(() => {
        if (isStreaming) {
          el.scrollTop = el.scrollHeight;
        } else {
          el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        }
      });
    }
  }, [dependency, isStreaming, scrollRef, threshold]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [scrollRef]);

  return { showScrollFab, scrollToBottom };
}
