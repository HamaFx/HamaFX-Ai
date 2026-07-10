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

// Phase 7c — link to the schema-driven /settings/agent catalogue page.
// Server component; renders the per-tool roll-up count alongside a
// Right-arrow link so the settings list reads consistently.

import { buildToolCatalogue } from '@hamafx/ai';
import {IconRobot, IconChevronRight} from '@tabler/icons-react';
import { Link } from 'next-view-transitions';

export async function AgentCard() {
  const entries = await buildToolCatalogue().catch(() => []);
  const totalInvocations = entries.reduce((s, e) => s + e.invocations24h, 0);
  const totalFailures = entries.reduce((s, e) => s + e.failures24h, 0);

  return (
    <Link
      href="/settings/agent"
      className="border-border bg-bg-elev-1 hover:bg-bg-elev-2 flex items-center gap-3 rounded-sm border p-3 transition-colors focus-visible:ring-fg focus:outline-none focus-visible:ring-2"
    >
      <span
        aria-hidden="true"
        className="text-fg-muted inline-flex size-9 shrink-0 items-center justify-center rounded-sm"
        style={{
          background: 'var(--color-bg-elev-3)',
          boxShadow: 'none',
        }}
      >
        <IconRobot className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-fg text-sm font-semibold leading-tight">Agent</span>
        <span className="text-fg-subtle text-xs leading-snug">
          {entries.length} tool{entries.length === 1 ? '' : 's'} ·{' '}
          {totalInvocations} invocation{totalInvocations === 1 ? '' : 's'} (24h)
          {totalFailures > 0 ? (
            <>
              {' '}
              · <span className="text-danger">{totalFailures} failure{totalFailures === 1 ? '' : 's'}</span>
            </>
          ) : null}
        </span>
      </div>
      <IconChevronRight className="text-fg-subtle size-4" />
    </Link>
  );
}
