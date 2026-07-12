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

// Phase 1.7 — AI briefing widget.
//
// Surfaces the user's most recent briefing on the dashboard. The data
// shape comes from `getLatestBriefing` in `@hamafx/ai` (a snapshot of
// the dedicated `Briefings_Thread` assistant message) and is passed in
// as a prop — the widget itself is presentational.
//
// When `briefing` is null we render a quiet empty-state with a CTA into
// the chat surface, not an error: many users simply haven't received a
// briefing yet (fresh account, low event volume, etc.).

import {IconArrowRight, IconCalendar, IconNews, IconBolt} from '@tabler/icons-react';
import Link from 'next/link';
import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { EmptyState } from '@/components/ui/empty-state';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/cn';

interface BriefingWidgetProps {
  briefing: {
    messageId: string;
    createdAt: number;
    body: string;
    kind: 'pre' | 'post' | 'weekly_review';
    summary: string;
    eventTitle: string | null;
    eventDate: number | null;
    symbol: string | null;
  } | null;
}

interface KindMeta {
  label: string;
  icon: typeof IconBolt;
}

const KIND_META: Record<'pre' | 'post' | 'weekly_review', KindMeta> = {
  pre: { label: 'Pre-event briefing', icon: IconCalendar },
  post: { label: 'Post-event recap', icon: IconNews },
  weekly_review: { label: 'Weekly review', icon: IconBolt },
};

export function BriefingWidget({ briefing }: BriefingWidgetProps) {
  // useMemo must be called before any early return (rules of hooks).
  const markdownContent = useMemo(() => {
    if (!briefing?.body) return null;
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{briefing.body}</ReactMarkdown>
    );
  }, [briefing?.body]);

  if (!briefing) {
    return (
      <div className="border-border bg-bg-elev-1 rounded-sm border p-2">
        <EmptyState
          icon={<IconBolt className="size-6" />}
          title="No briefing yet"
          description="We'll surface an AI briefing here around the next high-impact event."
          tone="muted"
          bare
          className="py-6"
        />
      </div>
    );
  }

  const meta = KIND_META[briefing.kind] ?? { label: 'Briefing', icon: IconBolt };
  const Icon = meta.icon;

  return (
    <article
      role="status"
      aria-label={meta.label}
      className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-sm border p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="text-fg size-4" />
          <span className="text-fg text-body-sm font-semibold">AI Briefing</span>
          <span
            className={cn(
              'rounded-sm px-1.5 py-0.5 text-caption font-medium',
              briefing.kind === 'pre'
                ? 'bg-warn/10 text-warn'
                : briefing.kind === 'post'
                  ? 'bg-info/10 text-info'
                  : 'bg-bg-elev-2 text-fg',
            )}
          >
            {meta.label}
          </span>
        </div>
        <time
          dateTime={new Date(briefing.createdAt).toISOString()}
          className="text-fg-subtle text-caption tabular-nums"
        >
          {formatRelative(briefing.createdAt)}
        </time>
      </header>

      {briefing.eventTitle ? (
        <p className="text-fg-muted text-body-sm">
          <span className="text-fg-subtle text-caption mr-1 uppercase tracking-wider">
            Source
          </span>
          {briefing.eventTitle}
          {briefing.eventDate
            ? ` · ${new Date(briefing.eventDate).toUTCString().slice(5, 22)}`
            : null}
        </p>
      ) : null}

      <div className="md-prose text-fg-muted text-body-sm flex flex-col gap-2 leading-[1.4]">
        {markdownContent}
      </div>

      <footer className="mt-auto flex items-center justify-end">
        <Link
          href="/chat"
          className="text-fg text-body-sm hover:underline inline-flex items-center gap-1"
        >
          Dig deeper in chat <IconArrowRight className="size-3.5" />
        </Link>
      </footer>
    </article>
  );
}
