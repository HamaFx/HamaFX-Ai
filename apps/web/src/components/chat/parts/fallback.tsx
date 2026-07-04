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
 * <FallbackPartView> — inline card for `data-fallback` parts.
 *
 * Phase B — UX_UPGRADE_PLAN.md item 15.
 *
 * The agent appends a `data-fallback` part to the assistant message
 * when the user's model override failed and we silently retried with
 * the default. The card makes that swap visible so the user knows to
 * fix their key (or pick a different provider).
 *
 * Tone is amber — distinct from the bear tone of citation warnings
 * (which mean "the AI may have hallucinated") and the brand tone of
 * success / informational chips.
 */

import { IconAlertTriangle } from '@tabler/icons-react';

export interface FallbackPartViewProps {
  part: {
    type: 'data-fallback';
    reason?: string;
    override?: string;
    message?: string;
  };
}

const REASON_LABEL: Record<string, string> = {
  auth: 'Override provider rejected the API key',
  'rate-limit': 'Override provider rate-limited the request',
  upstream: 'Override provider returned a server error',
  timeout: 'Override provider timed out',
  unknown: 'Override provider returned an error',
};

export function FallbackPartView({ part }: FallbackPartViewProps) {
  const reason = part.reason && REASON_LABEL[part.reason] ? part.reason : 'unknown';
  const message = part.message ?? REASON_LABEL[reason] ?? 'Override unavailable';
  const override = part.override?.trim();

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-warn/30 bg-warn/10 text-fg mt-2 flex items-start gap-2 rounded-sm border p-3 text-body-sm"
    >
      <IconAlertTriangle
        className="text-warn mt-0.5 size-4 shrink-0"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1 leading-snug">
        <p className="text-warn font-semibold">Override unavailable</p>
        <p className="text-fg-muted mt-0.5">
          {message}. Used the default domain model instead.
        </p>
        {override ? (
          <p className="text-fg-subtle mt-1 font-mono text-caption break-all">
            Override: <span className="text-fg-muted">{override}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
