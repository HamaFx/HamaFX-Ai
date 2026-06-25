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

/**
 * Banner shown at the top of /settings/api-keys when the user lands
 * there from /chat with no AI provider configured.
 *
 * Phase A — UX_UPGRADE_PLAN.md item 4.
 *
 * Behaviour:
 *   - Explains why they're here ("No AI provider is configured").
 *   - If a `prompt` is passed, surfaces it as the original "Ask AI"
 *     intent so the user understands what was about to happen.
 *   - Dismissable; the dismissed flag is stored in localStorage so
 *     the banner does not reappear on subsequent visits to
 *     /settings/api-keys (regardless of `from=chat`).
 */

import { Info, X } from 'lucide-react';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'hfx_banner_dismissed:api-keys-from-chat';

export interface ApiKeysLandingBannerProps {
  /** Optional preserved prompt from the originating /chat deep link. */
  prompt?: string;
}

export function ApiKeysLandingBanner({ prompt }: ApiKeysLandingBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === '1') {
        setDismissed(true);
      }
    } catch {
      console.warn('[settings] localStorage unavailable in private mode');
    }
  }, []);

  if (!hydrated || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      console.warn('[settings] failed to persist banner dismiss');
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-info/30 bg-info/10 text-fg flex items-start gap-3 rounded-lg border p-4"
    >
      <Info className="text-info mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="flex-1 leading-relaxed">
        <p className="text-sm font-medium">No AI provider is configured</p>
        <p className="text-fg-muted mt-1 text-xs">
          Add a key below to start chatting. Free-tier providers (Google,
          Groq) work without spending.
        </p>
        {prompt ? (
          <p className="text-fg-subtle mt-2 text-xs">
            <span className="text-fg-subtle uppercase tracking-wide">
              Pending prompt:
            </span>{' '}
            <span className="text-fg-muted italic">&ldquo;{prompt}&rdquo;</span>
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss banner"
        className="text-fg-subtle hover:text-fg -mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-info/15"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
