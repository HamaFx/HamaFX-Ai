// SPDX-License-Identifier: Apache-2.0

'use client';

import { Suspense, useState, type ComponentType } from 'react';
import dynamic from 'next/dynamic';
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
import { SkeletonCard } from '@/components/ui/skeleton';

// ---- Lazy-loaded admin sub-components ----
// Each tab's component is only loaded when the user navigates to it.
// The `loading:` fallback shows a skeleton while the chunk downloads.

function TabFallback() {
  return <SkeletonCard className="h-64" lines={8} />;
}

const AdminSystemHealth = dynamic(
  () => import('./_components/admin-system-health').then((m) => m.AdminSystemHealth),
  { loading: TabFallback },
) as ComponentType;

const AdminOnboardingControl = dynamic(
  () => import('./_components/admin-onboarding-control').then((m) => m.AdminOnboardingControl),
  { loading: TabFallback },
) as ComponentType;

const AdminCronTable = dynamic(
  () => import('./_components/admin-cron-table').then((m) => m.AdminCronTable),
  { loading: TabFallback },
) as ComponentType;

const AdminToolTelemetryTable = dynamic(
  () => import('./_components/admin-tool-telemetry-table').then((m) => m.AdminToolTelemetryTable),
  { loading: TabFallback },
) as ComponentType;

const AdminDiagnosticTraces = dynamic(
  () => import('./_components/admin-diagnostic-traces').then((m) => m.AdminDiagnosticTraces),
  { loading: TabFallback },
) as ComponentType;

const AdminUserTable = dynamic(
  () => import('./_components/admin-user-table').then((m) => m.AdminUserTable),
  { loading: TabFallback },
) as ComponentType;

const AdminFeatureFlags = dynamic(
  () => import('./_components/admin-feature-flags').then((m) => m.AdminFeatureFlags),
  { loading: TabFallback },
) as ComponentType;

const AdminLogViewer = dynamic(
  () => import('./_components/admin-log-viewer').then((m) => m.AdminLogViewer),
  { loading: TabFallback },
) as ComponentType;

const TABS = [
  { id: 'health', label: 'Health', icon: IconHeartbeat, Component: AdminSystemHealth },
  { id: 'onboarding', label: 'Onboarding', icon: IconRefresh, Component: AdminOnboardingControl },
  { id: 'cron', label: 'Cron', icon: IconHistory, Component: AdminCronTable },
  { id: 'telemetry', label: 'Telemetry', icon: IconTool, Component: AdminToolTelemetryTable },
  { id: 'traces', label: 'Traces', icon: IconStethoscope, Component: AdminDiagnosticTraces },
  { id: 'users', label: 'Users', icon: IconUsers, Component: AdminUserTable },
  { id: 'features', label: 'Features', icon: IconFlag, Component: AdminFeatureFlags },
  { id: 'logs', label: 'Logs', icon: IconTerminal, Component: AdminLogViewer },
] as const;

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<string>('health');

  const tab = TABS.find((t) => t.id === activeTab) ?? TABS[0];
  const ActiveComponent = tab.Component;

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
        <Suspense fallback={<TabFallback />}>
          <ActiveComponent />
        </Suspense>
      </section>
    </div>
  );
}
