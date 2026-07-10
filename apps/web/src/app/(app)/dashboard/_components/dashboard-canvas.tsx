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

// Phase 1.6 — Modular customizable dashboard canvas.
//
// A dnd-kit-powered grid that maps the persisted `WidgetConfig[]`
// layout to concrete widget components. The layout is stored in
// `localStorage` (key from `widget-types.ts`) so it survives reloads
// without a server round-trip.
//
// Features:
//   - Drag to reorder via the dnd-kit `SortableContext`.
//   - Per-widget span toggle (1↔2 columns).
//   - Per-widget remove (re-add via the "Add widget" dropdown).
//   - Persist on every change.
//   - "Customize" toggle exposes the chrome; default = clean view.

import { useCallback, useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {IconGripVertical, IconPlus, IconAdjustmentsHorizontal, IconX} from '@tabler/icons-react';
import type {
  Alert,
  EconomicEvent,
  JournalEntry,
  NewsArticle,
  Symbol,
} from '@hamafx/shared';

import { Button } from '@/components/ui/button';
import {
  DEFAULT_LAYOUT,
  LAYOUT_STORAGE_KEY,
  WIDGET_LABELS,
  type WidgetConfig,
  type WidgetType,
} from './widget-types';
import { BriefingWidget } from './widgets/briefing-widget';
import { CalendarWidget } from './widgets/calendar-widget';
import { AlertsWidget } from './widgets/alerts-widget';
import { EquityCurveWidget } from './widgets/equity-curve-widget';
import { NewsPulseWidget } from './widgets/news-pulse-widget';
import { OpenPositionsWidget } from './widgets/open-positions-widget';
import { PnLHeatmapWidget } from './widgets/pnl-heatmap-widget';
import { StatsWidget } from './widgets/stats-widget';
import { TodayGlanceWidget } from './widgets/today-glance-widget';
import { WatchlistWidget } from './widgets/watchlist-widget';
import { cn } from '@/lib/cn';
import { useLocalStorage } from '@/hooks/use-local-storage';

type BriefingData = {
  messageId: string;
  createdAt: number;
  body: string;
  kind: 'pre' | 'post' | 'weekly_review';
  summary: string;
  eventTitle: string | null;
  eventDate: number | null;
  symbol: string | null;
} | null;

interface DashboardCanvasProps {
  alerts: readonly Alert[];
  events: readonly EconomicEvent[];
  entries: readonly JournalEntry[];
  news: readonly NewsArticle[];
  briefing: BriefingData;
}

const ALL_WIDGETS: WidgetType[] = [
  'today-glance',
  'briefing',
  'pnl-heatmap',
  'equity-curve',
  'stats',
  'watchlist',
  'open-positions',
  'alerts',
  'calendar',
  'news-pulse',
];

export function DashboardCanvas(props: DashboardCanvasProps) {
  const [layout, setLayout, hydrated] = useLocalStorage<WidgetConfig[]>(
    LAYOUT_STORAGE_KEY,
    DEFAULT_LAYOUT,
  );
  const [editMode, setEditMode] = useState(false);

  // After hydration, prune any widget types that no longer exist in the
  // catalogue (forward-compat) and fill missing ones from ALL_WIDGETS.
  const safeLayout = useMemo(() => {
    if (!hydrated) return DEFAULT_LAYOUT;
    const known = new Set<WidgetType>(ALL_WIDGETS);
    const present = new Set(layout.map((w) => w.type));
    const pruned = layout
      .filter((w) => known.has(w.type))
      // re-stamp `order` so newly-added widgets slot in at the end.
      .map((w, i) => ({ ...w, order: i }));
    const additions: WidgetConfig[] = [];
    for (const t of ALL_WIDGETS) {
      if (!present.has(t)) {
        additions.push({
          id: `w-${t}-${Math.random().toString(36).slice(2, 8)}`,
          type: t,
          span: t === 'today-glance' || t === 'briefing' || t === 'pnl-heatmap' ? 2 : 1,
          order: pruned.length + additions.length,
        });
      }
    }
    return [...pruned, ...additions];
  }, [hydrated, layout]);

  const persistLayout = useCallback(
    (next: WidgetConfig[]) => {
      const reStamped = next.map((w, i) => ({ ...w, order: i }));
      setLayout(reStamped);
    },
    [setLayout],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = safeLayout.findIndex((w) => w.id === active.id);
    const newIndex = safeLayout.findIndex((w) => w.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    persistLayout(arrayMove(safeLayout, oldIndex, newIndex));
  }

  function removeWidget(id: string) {
    persistLayout(safeLayout.filter((w) => w.id !== id));
  }

  function toggleSpan(id: string) {
    persistLayout(
      safeLayout.map((w) =>
        w.id === id ? { ...w, span: w.span === 1 ? 2 : 1 } : w,
      ),
    );
  }

  function resetLayout() {
    persistLayout(DEFAULT_LAYOUT);
  }

  const hidden = ALL_WIDGETS.filter(
    (t) => !safeLayout.some((w) => w.type === t),
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header / controls */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-fg text-xl font-bold tracking-tight">Dashboard</h1>
        <div className="flex items-center gap-2">
          {editMode && hidden.length > 0 ? (
            <AddWidgetMenu
              hidden={hidden}
              onAdd={(type) => {
                persistLayout([
                  ...safeLayout,
                  {
                    id: `w-${type}-${Math.random().toString(36).slice(2, 8)}`,
                    type,
                    span: 1,
                    order: safeLayout.length,
                  },
                ]);
              }}
            />
          ) : null}
          {editMode ? (
            <Button variant="ghost" size="sm" onClick={resetLayout}>
              Reset
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditMode((v) => !v)}
            aria-pressed={editMode}
          >
            <IconAdjustmentsHorizontal className="size-4" />
            {editMode ? 'Done' : 'Customize'}
          </Button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={safeLayout.map((w) => w.id)}
          strategy={rectSortingStrategy}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {safeLayout.map((w) => (
              <SortableWidget
                key={w.id}
                widget={w}
                editMode={editMode}
                onRemove={() => removeWidget(w.id)}
                onToggleSpan={() => toggleSpan(w.id)}
                {...props}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SortableWidget — wraps each widget in a chrome card with the drag handle,
// span toggle, and remove button when in edit mode. The actual widget body
// is rendered via `renderWidget()`.
// ---------------------------------------------------------------------------

interface SortableWidgetProps extends DashboardCanvasProps {
  widget: WidgetConfig;
  editMode: boolean;
  onRemove: () => void;
  onToggleSpan: () => void;
}

function SortableWidget({
  widget,
  editMode,
  onRemove,
  onToggleSpan,
  ...data
}: SortableWidgetProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        widget.span === 2 && 'md:col-span-2',
        editMode && 'rounded-sm ring-1 ring-border',
      )}
    >
      {editMode ? (
        <div className="border-border bg-bg-elev-1 mb-1 flex items-center justify-between gap-2 rounded-sm border px-3 py-1.5">
          <button
            type="button"
            aria-label={`Drag ${WIDGET_LABELS[widget.type]} widget`}
            className="text-fg-subtle hover:text-fg cursor-grab touch-none active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <IconGripVertical className="size-4" />
          </button>
          <span className="text-fg-subtle text-caption uppercase tracking-wider">
            {WIDGET_LABELS[widget.type]}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={`Toggle span for ${WIDGET_LABELS[widget.type]}`}
              onClick={onToggleSpan}
              className="text-fg-subtle hover:text-fg text-caption"
            >
              {widget.span === 1 ? '⤢' : '⤡'}
            </button>
            <button
              type="button"
              aria-label={`Remove ${WIDGET_LABELS[widget.type]}`}
              onClick={onRemove}
              className="text-fg-subtle hover:text-danger"
            >
              <IconX className="size-3.5" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="h-full">{renderWidget(widget.type, data)}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// renderWidget — maps a widget type to its concrete component. Keeps the
// chrome (`SortableWidget`) decoupled from individual widget APIs.
// ---------------------------------------------------------------------------

function renderWidget(
  type: WidgetType,
  data: Omit<DashboardCanvasProps, never>,
) {
  const {
    alerts,
    events,
    entries,
    news,
    briefing,
  } = data;

  const briefingNudge = briefing?.body?.split('. ')[0] ?? null;

  switch (type) {
    case 'today-glance':
      return (
        <TodayGlanceWidget
          events={[...events]}
          entries={[...entries]}
          briefingNudge={briefingNudge}
          defaultSymbol={(briefing?.symbol as Symbol | undefined) ?? 'XAUUSD'}
        />
      );
    case 'briefing':
      return <BriefingWidget briefing={briefing} />;
    case 'pnl-heatmap':
      return <PnLHeatmapWidget entries={entries} />;
    case 'equity-curve':
      return <EquityCurveWidget entries={entries} />;
    case 'stats':
      return <StatsWidget entries={entries} />;
    case 'watchlist':
      return <WatchlistWidget />;
    case 'open-positions':
      return <OpenPositionsWidget entries={entries} />;
    case 'alerts':
      return <AlertsWidget alerts={alerts} />;
    case 'calendar':
      return <CalendarWidget events={events} />;
    case 'news-pulse':
      return <NewsPulseWidget articles={news} />;
  }
}

// ---------------------------------------------------------------------------
// AddWidgetMenu — small popover that lists widget types not currently on
// the canvas. We use a native <details>/<summary> for simplicity so we
// don't pull in another popover primitive.
// ---------------------------------------------------------------------------

function AddWidgetMenu({
  hidden,
  onAdd,
}: {
  hidden: WidgetType[];
  onAdd: (type: WidgetType) => void;
}) {
  if (hidden.length === 0) return null;
  return (
    <details className="relative">
      <summary
        className="border-border bg-bg-elev-1 hover:bg-bg-elev-2 text-fg inline-flex cursor-pointer list-none items-center gap-1 rounded-sm border px-2 py-1 text-caption"
        aria-label="Add widget"
      >
        <IconPlus className="size-3.5" />
        Add widget
      </summary>
      <div className="border-border bg-bg-elev-1 absolute right-0 z-10 mt-1 flex min-w-[180px] flex-col rounded-sm border p-1 shadow-lg">
        {hidden.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onAdd(t)}
            className="text-fg hover:bg-bg-elev-2 rounded-sm px-2 py-1 text-left text-caption"
          >
            {WIDGET_LABELS[t]}
          </button>
        ))}
      </div>
    </details>
  );
}
