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

// Phase 1.6 — Modular customizable dashboard canvas.
//
// Widget type definitions + the default layout. The runtime data graph
// (which widgets exist, in what order, what span) lives here so the
// `DashboardCanvas` client component stays presentational and the server
// page can map `WidgetConfig[]` → props without drift.
//
// Design tokens (`bg-bg-elev-1`, `text-fg`, `border-border`, etc.) and
// the rounded-sm convention from PLAN.md §2.4 are applied uniformly by
// the widget wrapper inside `DashboardCanvas` — widget implementations
// only need to render their own body.

export type WidgetType =
  | 'today-glance' // 1.9 — hero (4-cell strip)
  | 'briefing' // 1.7 — AI briefing
  | 'pnl-heatmap' // 1.8 — P&L calendar
  | 'equity-curve' // existing PerformanceChart
  | 'watchlist' // live prices + sparklines
  | 'open-positions' // from journal
  | 'alerts' // active alerts
  | 'calendar' // next events countdown
  | 'news-pulse' // sentiment summary
  | 'stats'; // win rate, total R, etc.

export interface WidgetConfig {
  /** Stable widget id used as the drag-sortable key. */
  id: string;
  type: WidgetType;
  /** Grid span on desktop. 1 = half, 2 = full width. */
  span: 1 | 2;
  /** Sort order (low → left / top). Persisted in localStorage. */
  order: number;
}

/**
 * Default layout shipped to a fresh user. Order is intentionally
 * "story-first": today's glance → AI briefing → P&L heatmap (the three
 * full-width heroes), then the half-width modules in descending signal
 * strength.
 */
export const DEFAULT_LAYOUT: WidgetConfig[] = [
  { id: 'w1', type: 'today-glance', span: 2, order: 0 },
  { id: 'w2', type: 'briefing', span: 2, order: 1 },
  { id: 'w3', type: 'pnl-heatmap', span: 2, order: 2 },
  { id: 'w4', type: 'equity-curve', span: 1, order: 3 },
  { id: 'w5', type: 'stats', span: 1, order: 4 },
  { id: 'w6', type: 'watchlist', span: 1, order: 5 },
  { id: 'w7', type: 'open-positions', span: 1, order: 6 },
  { id: 'w8', type: 'alerts', span: 1, order: 7 },
  { id: 'w9', type: 'calendar', span: 1, order: 8 },
  { id: 'w10', type: 'news-pulse', span: 1, order: 9 },
];

/**
 * Local-storage key for the user's layout. Centralised so the dashboard
 * page and a future "reset to default" action agree on the source of
 * truth. Versioned (`v1`) so we can ship migrations without losing
 * existing layouts.
 */
export const LAYOUT_STORAGE_KEY = 'hamafx:dashboard-layout:v1';

/** Human-readable label rendered on the edit-mode toolbar. */
export const WIDGET_LABELS: Record<WidgetType, string> = {
  'today-glance': 'Today at a glance',
  briefing: 'AI briefing',
  'pnl-heatmap': 'P&L heatmap',
  'equity-curve': 'Equity curve',
  watchlist: 'Watchlist',
  'open-positions': 'Open positions',
  alerts: 'Alerts',
  calendar: 'Calendar',
  'news-pulse': 'News pulse',
  stats: 'Stats',
};