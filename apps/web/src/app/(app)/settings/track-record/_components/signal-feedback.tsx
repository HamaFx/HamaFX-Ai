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

// 2.5 — Decision-signal feedback UI (thumbs up / down) on the track-record page.
// Calls /api/decision-signals/[id]/feedback with { feedback: 'useful' | 'not_useful' }.

import { useState } from 'react';
import {IconThumbUp, IconThumbDown} from '@tabler/icons-react';
import { toast } from 'sonner';

import { fetchCsrf } from '@/lib/csrf';
import { cn } from '@/lib/cn';

interface SignalFeedbackProps {
  signalId: string;
  initialFeedback?: 'useful' | 'not_useful' | null;
}

export function SignalFeedback({ signalId, initialFeedback = null }: SignalFeedbackProps) {
  const [feedback, setFeedback] = useState<'useful' | 'not_useful' | null>(initialFeedback);
  const [saving, setSaving] = useState(false);

  async function submit(value: 'useful' | 'not_useful') {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetchCsrf(`/api/decision-signals/${signalId}/feedback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ feedback: value }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setFeedback(value);
    } catch (err) {
      toast.error('Feedback failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-1" aria-label="Signal feedback">
      <button
        type="button"
        onClick={() => void submit('useful')}
        disabled={saving}
        aria-label="This signal was useful"
        aria-pressed={feedback === 'useful'}
        className={cn(
          'inline-flex size-8 items-center justify-center rounded-sm transition-colors',
          feedback === 'useful'
            ? 'bg-bull/10 text-bull'
            : 'text-fg-muted hover:text-fg hover:bg-bg-elev-2',
          saving && 'opacity-60',
        )}
      >
        <IconThumbUp className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => void submit('not_useful')}
        disabled={saving}
        aria-label="This signal was not useful"
        aria-pressed={feedback === 'not_useful'}
        className={cn(
          'inline-flex size-8 items-center justify-center rounded-sm transition-colors',
          feedback === 'not_useful'
            ? 'bg-bear/10 text-bear'
            : 'text-fg-muted hover:text-fg hover:bg-bg-elev-2',
          saving && 'opacity-60',
        )}
      >
        <IconThumbDown className="size-4" />
      </button>
    </div>
  );
}
