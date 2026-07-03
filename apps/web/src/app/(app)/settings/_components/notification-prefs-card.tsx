'use client';

import { Bell, Mail, Smartphone } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { updateNotificationPrefsAction } from '../actions';

type EventType = 'alerts' | 'briefings' | 'weekly_review' | 'usage_warnings';
type Channel = 'email' | 'push' | 'telegram';

type PrefsMatrix = Record<EventType, Record<Channel, boolean>>;

const EVENT_LABELS: Record<EventType, string> = {
  alerts: 'Price alerts',
  briefings: 'Market briefings',
  weekly_review: 'Weekly review',
  usage_warnings: 'Usage warnings',
};

const CHANNELS: { key: Channel; icon: typeof Bell; label: string }[] = [
  { key: 'email', icon: Mail, label: 'Email' },
  { key: 'push', icon: Bell, label: 'Push' },
  { key: 'telegram', icon: Smartphone, label: 'Telegram' },
];

const DEFAULT_PREFS: PrefsMatrix = {
  alerts: { email: true, push: true, telegram: false },
  briefings: { email: false, push: true, telegram: false },
  weekly_review: { email: true, push: false, telegram: false },
  usage_warnings: { email: true, push: true, telegram: true },
};

export function NotificationPrefsCard({
  initialPrefs,
}: {
  initialPrefs?: Record<string, Record<string, boolean>> | null;
}) {
  const [prefs, setPrefs] = useState<PrefsMatrix>(() => {
    if (initialPrefs) {
      return {
        ...DEFAULT_PREFS,
        ...Object.fromEntries(
          (Object.keys(DEFAULT_PREFS) as EventType[]).map((event) => [
            event,
            { ...DEFAULT_PREFS[event], ...(initialPrefs[event] ?? {}) },
          ]),
        ),
      };
    }
    return DEFAULT_PREFS;
  });

  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const toggle = useCallback((event: EventType, channel: Channel, value: boolean) => {
    const prev = prefsRef.current;
    const next: PrefsMatrix = {
      ...prev,
      [event]: { ...prev[event], [channel]: value },
    };
    setPrefs(next);
    updateNotificationPrefsAction(next).then((result) => {
      if (!result.ok) {
        setPrefs(prev);
        toast.error('Failed to update notification preference');
      }
    });
  }, []);

  return (
    <section className="border border-zinc-800 bg-zinc-950 rounded-sm flex flex-col gap-1 p-4" aria-labelledby="notification-prefs-heading">
      <div className="flex items-center gap-3 pb-2">
        <h2 id="notification-prefs-heading" className="text-fg text-base font-semibold tracking-tight">
          Notification preferences
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left py-2 pr-4 text-fg-muted font-medium">Event type</th>
              {CHANNELS.map((ch) => (
                <th key={ch.key} className="text-center py-2 px-3 text-fg-muted font-medium">
                  <ch.icon className="size-4 mx-auto" aria-hidden="true" />
                  <span className="sr-only">{ch.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(Object.keys(DEFAULT_PREFS) as EventType[]).map((event) => (
              <tr key={event} className="border-b border-divider/50 last:border-0">
                <td className="py-3 pr-4 text-fg">{EVENT_LABELS[event]}</td>
                {CHANNELS.map((ch) => (
                  <td key={ch.key} className="text-center py-3 px-3">
                    <Switch
                      checked={prefs[event]?.[ch.key] ?? false}
                      onCheckedChange={(v) => toggle(event, ch.key, v)}
                      srLabel={`${EVENT_LABELS[event]} — ${ch.label}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
