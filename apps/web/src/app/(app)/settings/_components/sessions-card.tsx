'use client';

import { LogOut, Smartphone, Monitor, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { signOut } from 'next-auth/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-drawer';
import { listSessionsAction, revokeSessionAction, signOutEverywhereAction } from '../actions';
import { SettingsRow } from './settings-row';

interface Session {
  id: string;
  deviceName: string | null;
  ip: string | null;
  createdAt: Date;
  lastActiveAt: Date;
}

export function SessionsCard() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, startRevokeTransition] = useTransition();
  const [signingOut, startSignOutTransition] = useTransition();
  const [confirmEl, confirm] = useConfirm();

  useEffect(() => {
    listSessionsAction().then((res) => {
      if (res.ok && res.data) {
        setSessions(res.data);
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

    startRevokeTransition(async () => {
      const res = await revokeSessionAction(sessionId);
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        toast.success('Session revoked');
      } else {
        toast.error(res.error || 'Failed to revoke session');
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
    <section className="border border-divider bg-bg-elev-1 rounded-lg flex flex-col gap-1 p-4" aria-labelledby="active-sessions-heading">
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
                  <Smartphone className="size-4 shrink-0 text-fg-muted" />
                ) : (
                  <Monitor className="size-4 shrink-0 text-fg-muted" />
                )}
                <div className="min-w-0">
                  <p className="text-sm text-fg truncate">
                    {s.deviceName ?? 'Unknown device'}
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
                disabled={revoking}
                onClick={() => handleRevoke(s.id)}
                aria-label={`Revoke session ${s.deviceName ?? 'unknown'}`}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {sessions.length > 0 && (
        <>
          <hr className="border-divider my-2" />
          <SettingsRow
            icon={<LogOut className="size-4" />}
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
                <LogOut className="size-3.5" />
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
