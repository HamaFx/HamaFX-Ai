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

'use client';

import { useState } from 'react';
import {
  IconRefresh,
  IconHistory,
  IconTool,
  IconStethoscope,
  IconUsers,
  IconFlag,
  IconTerminal,
  IconHeartbeat,
} from '@tabler/icons-react';

import { cn } from '@/lib/cn';

import { AdminOnboardingControl } from './_components/admin-onboarding-control';
import { AdminCronTable } from './_components/admin-cron-table';
import { AdminToolTelemetryTable } from './_components/admin-tool-telemetry-table';
import { AdminDiagnosticTraces } from './_components/admin-diagnostic-traces';
import { AdminUserTable } from './_components/admin-user-table';
import { AdminFeatureFlags } from './_components/admin-feature-flags';
import { AdminLogViewer } from './_components/admin-log-viewer';
import { AdminSystemHealth } from './_components/admin-system-health';

const TABS = [
  { id: 'health', label: 'Health', icon: IconHeartbeat, component: AdminSystemHealth },
  { id: 'onboarding', label: 'Onboarding', icon: IconRefresh, component: AdminOnboardingControl },
  { id: 'cron', label: 'Cron', icon: IconHistory, component: AdminCronTable },
  { id: 'telemetry', label: 'Telemetry', icon: IconTool, component: AdminToolTelemetryTable },
  { id: 'traces', label: 'Traces', icon: IconStethoscope, component: AdminDiagnosticTraces },
  { id: 'users', label: 'Users', icon: IconUsers, component: AdminUserTable },
  { id: 'features', label: 'Features', icon: IconFlag, component: AdminFeatureFlags },
  { id: 'logs', label: 'Logs', icon: IconTerminal, component: AdminLogViewer },
] as const;

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<string>('health');

  const ActiveComponent = TABS.find((t) => t.id === activeTab)?.component ?? AdminOnboardingControl;

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Admin sections" className="border-border border-b">
        <ul className="flex flex-wrap gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <li key={tab.id}>
                <button
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-pressed={active}
                  className={cn(
                    'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors',
                    'border-b-2',
                    active
                      ? 'border-brand text-brand'
                      : 'border-transparent text-fg-muted hover:text-fg',
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {tab.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <section aria-live="polite" className="min-h-[300px]">
        <ActiveComponent />
      </section>
    </div>
  );
}
