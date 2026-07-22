// SPDX-License-Identifier: Apache-2.0

import { redirect } from 'next/navigation';

import {
  getLatestBriefing,
  getPortfolioRiskReport,
  getPortfolioSettings,
  listAlerts,
  listEntries,
  listRecentArticles,
  listUpcomingEvents,
} from '@hamafx/ai';

import { auth } from '@/auth';
import { DashboardCanvas } from './_components/dashboard-canvas';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }
  const userId = session.user.id;

  // Phase 1.6 — server-side data fetch for the entire canvas.
  // All widget bodies are pure presentational components; the canvas
  // wires them to these props. Failures on a single source shouldn't
  // break the whole dashboard — each Promise settles independently.
  // Phase 5.6 — track per-source errors so widgets can surface them.
  const settled = await Promise.allSettled([
    listAlerts(userId, { limit: 20 }),
    listUpcomingEvents({ limit: 12 }),
    listEntries(userId, { limit: 50 }),
    listRecentArticles(30),
    getLatestBriefing(userId),
    getPortfolioRiskReport(userId),
    getPortfolioSettings(userId),
  ]);

  const [alertsR, eventsR, entriesR, newsR, briefingR, riskR, settingsR] = settled;

  // Narrow helpers — never throw on a single failed source.
  const unwrap = <T,>(r: PromiseSettledResult<T>, fallback: T): T =>
    r.status === 'fulfilled' ? r.value : fallback;

  const alerts = unwrap(alertsR, []);
  const events = unwrap(eventsR, []);
  const entries = unwrap(entriesR, []);
  const news = unwrap(newsR, []);
  const briefing = unwrap(briefingR, null);
  const portfolioRisk = unwrap(riskR, null);
  const portfolioSettings = unwrap(settingsR, null);

  // Compute margin usage for the leverage gauge
  const marginUsagePct =
    portfolioRisk?.totalExposurePct ?? 0;
  const marginDetail =
    portfolioSettings?.accountBalance != null
      ? `$${portfolioRisk?.totalExposureUsd?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? '0'} / $${portfolioSettings.accountBalance.toLocaleString()} account`
      : null;

  // Phase 5.6 — per-source error flags for widget error states.
  // Extract a useful error message from rejected promises (reason
  // may be an Error instance, a string, or an arbitrary value).
  const reasonMsg = (reason: unknown): string =>
    reason instanceof Error ? reason.message : String(reason);

  const fetchErrors = {
    alerts: alertsR.status === 'rejected' ? reasonMsg(alertsR.reason) : null,
    events: eventsR.status === 'rejected' ? reasonMsg(eventsR.reason) : null,
    entries: entriesR.status === 'rejected' ? reasonMsg(entriesR.reason) : null,
    news: newsR.status === 'rejected' ? reasonMsg(newsR.reason) : null,
    briefing: briefingR.status === 'rejected' ? reasonMsg(briefingR.reason) : null,
    risk: riskR.status === 'rejected' ? reasonMsg(riskR.reason) : null,
    settings: settingsR.status === 'rejected' ? reasonMsg(settingsR.reason) : null,
  };
  const hasAnyError = Object.values(fetchErrors).some(Boolean);

  // Log failed sources for debugging (visible in Vercel logs)
  if (hasAnyError) {
    for (const [source, error] of Object.entries(fetchErrors)) {
      if (error) console.error('[dashboard] %s failed: %s', source, error);
    }
  }

  return (
    <DashboardCanvas
      alerts={alerts}
      events={events}
      entries={entries}
      news={news}
      briefing={briefing}
      fetchErrors={fetchErrors}
      hasAnyError={hasAnyError}
      marginUsagePct={marginUsagePct}
      marginDetail={marginDetail}
    />
  );
}
