// SPDX-License-Identifier: Apache-2.0

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
export const LAYOUT_STORAGE_KEY = 'kestrel:dashboard-layout:v1';

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

export type LayoutPresetName = 'default' | 'day_trader' | 'macro' | 'risk';

export const PRESET_LAYOUTS: Record<
  LayoutPresetName,
  { name: string; description: string; layout: WidgetConfig[] }
> = {
  default: {
    name: 'Full Overview',
    description: 'All widgets in balanced narrative order',
    layout: DEFAULT_LAYOUT,
  },
  day_trader: {
    name: 'Day Trader',
    description: 'Watchlist, open positions, alerts, and calendar up front',
    layout: [
      { id: 'w-dt-1', type: 'watchlist', span: 2, order: 0 },
      { id: 'w-dt-2', type: 'open-positions', span: 2, order: 1 },
      { id: 'w-dt-3', type: 'alerts', span: 1, order: 2 },
      { id: 'w-dt-4', type: 'calendar', span: 1, order: 3 },
      { id: 'w-dt-5', type: 'news-pulse', span: 1, order: 4 },
      { id: 'w-dt-6', type: 'stats', span: 1, order: 5 },
      { id: 'w-dt-7', type: 'today-glance', span: 2, order: 6 },
    ],
  },
  macro: {
    name: 'Macro & News',
    description: 'Economic calendar, tagged headlines, and AI daily briefing',
    layout: [
      { id: 'w-mc-1', type: 'calendar', span: 2, order: 0 },
      { id: 'w-mc-2', type: 'news-pulse', span: 2, order: 1 },
      { id: 'w-mc-3', type: 'briefing', span: 2, order: 2 },
      { id: 'w-mc-4', type: 'watchlist', span: 1, order: 3 },
      { id: 'w-mc-5', type: 'today-glance', span: 1, order: 4 },
      { id: 'w-mc-6', type: 'pnl-heatmap', span: 2, order: 5 },
    ],
  },
  risk: {
    name: 'Performance & Risk',
    description: 'Equity curves, P&L heatmap, stats, and open risk',
    layout: [
      { id: 'w-rk-1', type: 'equity-curve', span: 2, order: 0 },
      { id: 'w-rk-2', type: 'pnl-heatmap', span: 2, order: 1 },
      { id: 'w-rk-3', type: 'stats', span: 2, order: 2 },
      { id: 'w-rk-4', type: 'open-positions', span: 1, order: 3 },
      { id: 'w-rk-5', type: 'today-glance', span: 1, order: 4 },
      { id: 'w-rk-6', type: 'briefing', span: 2, order: 5 },
    ],
  },
};