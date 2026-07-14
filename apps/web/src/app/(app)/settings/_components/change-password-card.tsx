'use client';

import { useEffect, useState } from 'react';
import {IconLock, IconCheck, IconEye, IconEyeOff} from '@tabler/icons-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { changePasswordAction } from '../actions';

export function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [changing, setChanging] = useState(false);
  const [done, setDone] = useState(false);

  // Reset success state on unmount
  useEffect(() => {
    return () => { setDone(false); };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;
    setChanging(true);
    try {
      const res = await changePasswordAction(
        currentPassword,
        newPassword,
        totpCode || undefined,
      );
      if (res.ok) {
        toast.success('Password changed');
        setDone(true);
        setCurrentPassword('');
        setNewPassword('');
        setTotpCode('');
      } else {
        toast.error('error' in res ? (res.error ?? 'Failed to change password') : 'Failed to change password');
      }
    } catch {
      toast.error('Failed to change password');
    } finally {
      setChanging(false);
    }
  };

  return (
    <div className="border border-border bg-bg-elev-1 rounded-sm flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <IconLock className="text-fg-muted size-4" />
        <h2 className="text-fg text-base font-semibold tracking-tight">Change Password</h2>
      </div>

      {done ? (
        <div className="flex items-center gap-2 text-sm text-success">
          <IconCheck className="size-4" />
          Password changed successfully
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="relative">
            <Input
              type={showCurrent ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              disabled={changing}
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className="text-fg-muted hover:text-fg absolute right-2 top-1/2 -translate-y-1/2"
              tabIndex={-1}
              aria-label={showCurrent ? 'Hide password' : 'Show password'}
            >
              {showCurrent ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
            </button>
          </div>
          <div className="relative">
            <Input
              type={showNew ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              disabled={changing}
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="text-fg-muted hover:text-fg absolute right-2 top-1/2 -translate-y-1/2"
              tabIndex={-1}
            >
              {showNew ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
            </button>
          </div>
          {newPassword.length > 0 && (
            <div className="text-xs text-fg-subtle grid grid-cols-2 gap-1">
              <span className={newPassword.length >= 8 ? 'text-success' : 'text-danger'}>
                {newPassword.length >= 8 ? '✓' : '✗'} Min 8 characters
              </span>
              <span className={/[A-Z]/.test(newPassword) ? 'text-success' : 'text-danger'}>
                {/[A-Z]/.test(newPassword) ? '✓' : '✗'} Uppercase
              </span>
              <span className={/[a-z]/.test(newPassword) ? 'text-success' : 'text-danger'}>
                {/[a-z]/.test(newPassword) ? '✓' : '✗'} Lowercase
              </span>
              <span className={/[0-9]/.test(newPassword) ? 'text-success' : 'text-danger'}>
                {/[0-9]/.test(newPassword) ? '✓' : '✗'} Number
              </span>
            </div>
          )}
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="2FA code (if enabled)"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value)}
            disabled={changing}
          />
          <Button type="submit" size="sm" loading={changing} disabled={changing}>
            Change password
          </Button>
        </form>
      )}
    </div>
  );
}
