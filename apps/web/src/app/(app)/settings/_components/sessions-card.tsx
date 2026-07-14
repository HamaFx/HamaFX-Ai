'use client';

import {IconLogout, IconDeviceMobile, IconDeviceDesktop, IconTrash} from '@tabler/icons-react';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { signOut } from 'next-auth/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-drawer';
import { listSessionsAction, revokeSessionAction, signOutEverywhereAction } from '../actions';
import { SettingsRow } from './settings-row';
import { RowDivider } from './row-divider';

interface Session {
  id: string;
  deviceName: string | null;
  ip: string | null;
  createdAt: Date;
  lastActiveAt: Date;
}

export function SessionsCard() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revokingSessions, setRevokingSessions] = useState<Set<string>>(new Set());
  const [, startRevokeTransition] = useTransition();
  const [signingOut, startSignOutTransition] = useTransition();
  const [confirmEl, confirm] = useConfirm();

  useEffect(() => {
    listSessionsAction().then((res) => {
      if (res.ok && res.data) {
        setSessions(res.data.sessions);
        setCurrentSessionId(res.data.currentSessionId);
      }
      setLoading(false);
    });
  }, []);

  const handleRevoke = useCallback(async (sessionId: string) => {
    const ok = await confirm({
      title: 'Revoke this session?',
      description: 'The device will be signed out on its next request.',
      confirmLabel: 'Revoke',
      tone: 'danger',
    });
    if (!ok) return;

    setRevokingSessions((prev) => new Set(prev).add(sessionId));
    startRevokeTransition(async () => {
      try {
        const res = await revokeSessionAction(sessionId);
        if (res.ok) {
          setSessions((prev) => prev.filter((s) => s.id !== sessionId));
          toast.success('Session revoked');
        } else {
          toast.error(res.error || 'Failed to revoke session');
        }
      } finally {
        setRevokingSessions((prev) => {
          const next = new Set(prev);
          next.delete(sessionId);
          return next;
        });
      }
    });
  }, [confirm]);

  const handleSignOutEverywhere = useCallback(async () => {
    const ok = await confirm({
      title: 'Sign out everywhere?',
      description: 'This will sign out all active sessions, including this one.',
      confirmLabel: 'Sign out everywhere',
      tone: 'danger',
    });
    if (!ok) return;

    startSignOutTransition(async () => {
      const res = await signOutEverywhereAction();
      if (res.ok) {
        await signOut({ callbackUrl: '/login' });
      } else {
        toast.error(res.error || 'Failed to sign out everywhere');
      }
    });
  }, [confirm]);

  const formatDate = (d: Date | string) => {
    const date = typeof d === 'string' ? new Date(d) : d;
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <section className="border border-border bg-bg-elev-1 rounded-sm flex flex-col gap-1 p-4" aria-labelledby="active-sessions-heading">
      <div className="flex items-center gap-3 pb-2">
        <h2 id="active-sessions-heading" className="text-fg text-base font-semibold tracking-tight">
          Active sessions
        </h2>
        <span className="text-fg-subtle ml-auto text-caption uppercase tracking-wider">
          {sessions.length} session{sessions.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loading ? (
        <p className="text-fg-subtle text-sm py-2">Loading sessions...</p>
      ) : sessions.length === 0 ? (
        <p className="text-fg-subtle text-sm py-2">No active sessions</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-1.5 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {s.deviceName?.startsWith('Mobile') ? (
                  <IconDeviceMobile className="size-4 shrink-0 text-fg-muted" />
                ) : (
                  <IconDeviceDesktop className="size-4 shrink-0 text-fg-muted" />
                )}
                <div className="min-w-0">
                  <p className="text-sm text-fg truncate flex items-center gap-1.5">
                    {s.deviceName ?? 'Unknown device'}
                    {s.id === currentSessionId && (
                      <span className="inline-flex items-center rounded-sm bg-bg-elev-2 text-fg px-1.5 py-0.5 text-caption font-bold uppercase tracking-wider">
                        Current session
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-fg-subtle">
                    {s.ip ? `${s.ip} · ` : ''}
                    {formatDate(s.lastActiveAt)}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={revokingSessions.has(s.id)}
                onClick={() => handleRevoke(s.id)}
                aria-label={`Revoke session ${s.deviceName ?? 'unknown'}`}
              >
                <IconTrash className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {sessions.length > 0 && (
        <>
          <RowDivider />
          <SettingsRow
            icon={<IconLogout className="size-4" />}
            label="Sign out everywhere"
            description="End all active sessions"
            action={
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={signingOut}
                loading={signingOut}
                onClick={() => void handleSignOutEverywhere()}
              >
                <IconLogout className="size-3.5" />
                Sign out everywhere
              </Button>
            }
          />
        </>
      )}

      {confirmEl}
    </section>
  );
}
