// SPDX-License-Identifier: Apache-2.0

'use client';

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  type ComponentType,
  type KeyboardEvent,
} from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  IconRefresh,
  IconHistory,
  IconTool,
  IconStethoscope,
  IconUsers,
  IconFlag,
  IconTerminal,
  IconHeartbeat,
  IconChartDots,
  IconExternalLink,
  IconSettingsBolt,
} from '@tabler/icons-react';

import { cn } from '@/lib/cn';
import { SkeletonCard } from '@/components/ui/skeleton';

// ---- Lazy-loaded admin sub-components ----
// Each tab's component is only loaded when the user navigates to it.
// The `loading:` fallback shows a skeleton while the chunk downloads.

function TabFallback() {
  return (
    <div className="border-border overflow-hidden rounded-sm border">
      {/* Table header skeleton */}
      <div className="bg-bg-elev-2 flex gap-4 px-4 py-3">
        <SkeletonCard lines={1} className="flex-1 border-0 bg-transparent p-0" />
        <SkeletonCard lines={1} className="w-20 border-0 bg-transparent p-0" />
        <SkeletonCard lines={1} className="w-24 border-0 bg-transparent p-0" />
        <SkeletonCard lines={1} className="w-16 border-0 bg-transparent p-0" />
      </div>
      {/* Table row skeletons */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="border-border flex gap-4 border-t px-4 py-3">
          <SkeletonCard lines={1} className="flex-1 border-0 bg-transparent p-0" />
          <SkeletonCard lines={1} className="w-20 border-0 bg-transparent p-0" />
          <SkeletonCard lines={1} className="w-24 border-0 bg-transparent p-0" />
          <SkeletonCard lines={1} className="w-16 border-0 bg-transparent p-0" />
        </div>
      ))}
    </div>
  );
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

const AdminDevTools = dynamic(
  () => import('./_components/admin-dev-tools').then((m) => m.AdminDevTools),
  { loading: TabFallback },
) as ComponentType;

const AdminAuditTable = dynamic(
  () => import('./_components/admin-audit-table').then((m) => m.AdminAuditTable),
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
  { id: 'audit', label: 'Audit', icon: IconHistory, Component: AdminAuditTable },
  { id: 'devtools', label: 'Dev Tools', icon: IconSettingsBolt, Component: AdminDevTools },
] as const;

type TabId = (typeof TABS)[number]['id'];

const TAB_IDS: readonly string[] = TABS.map((t) => t.id);
const DEFAULT_TAB: TabId = 'health';
const TAB_PARAM = 'tab';

function isValidTab(id: string | null): id is TabId {
  return !!id && TAB_IDS.includes(id);
}

export default function AdminPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get(TAB_PARAM);
  const activeTab: TabId = isValidTab(rawTab) ? rawTab : DEFAULT_TAB;

  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({} as Record<TabId, HTMLButtonElement | null>);

  // If the URL contains an unknown tab, rewrite it to the default.
  useEffect(() => {
    if (rawTab !== null && !isValidTab(rawTab)) {
      router.replace('/admin', { scroll: false });
    }
  }, [rawTab, router]);

  const updateUrl = useCallback(
    (tabId: TabId) => {
      const params = new URLSearchParams(window.location.search);
      if (tabId === DEFAULT_TAB) {
        params.delete(TAB_PARAM);
      } else {
        params.set(TAB_PARAM, tabId);
      }
      const qs = params.toString();
      router.replace(`/admin${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router],
  );

  const activateTab = useCallback(
    (tabId: TabId) => {
      if (tabId === activeTab) return;
      updateUrl(tabId);
    },
    [activeTab, updateUrl],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const currentIndex = TABS.findIndex((t) => t.id === activeTab);
      let nextIndex = currentIndex;

      switch (event.key) {
        case 'ArrowRight':
          nextIndex = (currentIndex + 1) % TABS.length;
          break;
        case 'ArrowLeft':
          nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
          break;
        case 'Home':
          nextIndex = 0;
          break;
        case 'End':
          nextIndex = TABS.length - 1;
          break;
        case 'ArrowDown':
          event.preventDefault();
          document.getElementById(`${activeTab}-panel`)?.focus();
          return;
        default:
          return;
      }

      event.preventDefault();
      const nextTab = TABS[nextIndex];
      if (!nextTab) return;
      updateUrl(nextTab.id);
      tabRefs.current[nextTab.id]?.focus();
    },
    [activeTab, updateUrl],
  );

  const tab = TABS.find((t) => t.id === activeTab) ?? TABS[0];
  const ActiveComponent = tab.Component;

  return (
    <div className="flex flex-col gap-6">
      <div
        aria-label="Admin sections"
        className="border-border flex items-center justify-between border-b"
        role="tablist"
      >
        <div className="flex flex-wrap gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`${tab.id}-tab`}
                role="tab"
                aria-selected={active}
                {...(active ? { 'aria-controls': `${tab.id}-panel` } : {})}
                tabIndex={active ? 0 : -1}
                ref={(el) => {
                  tabRefs.current[tab.id] = el;
                }}
                type="button"
                onClick={() => activateTab(tab.id)}
                onKeyDown={handleKeyDown}
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
            );
          })}
        </div>

        <a
          href="/api/admin/architecture-explorer"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors',
            'border-b-2 border-transparent text-fg-muted hover:text-fg hover:border-brand',
          )}
          title="Open interactive architecture explorer in a new tab"
        >
          <IconChartDots className="size-4" aria-hidden="true" />
          Architecture Explorer
          <IconExternalLink className="size-3 text-fg-muted" aria-hidden="true" />
        </a>
      </div>

      <section
        id={`${activeTab}-panel`}
        role="tabpanel"
        aria-labelledby={`${activeTab}-tab`}
        tabIndex={0}
        className="min-h-[300px] outline-none focus-visible:ring-2 focus-visible:ring-brand/50 rounded-sm"
      >
        <Suspense fallback={<TabFallback />}>
          <ActiveComponent />
        </Suspense>
      </section>
    </div>
  );
}
