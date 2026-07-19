'use client';

import { useActionState, useEffect, useState } from 'react';
import {IconLock, IconCheck, IconEye, IconEyeOff} from '@tabler/icons-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { changePasswordAction } from '../actions';

type FormState = { ok: boolean; error: string };

export function ChangePasswordCard() {
  const [newPassword, setNewPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  // key forces form remount on success → clears all uncontrolled inputs
  const [formKey, setFormKey] = useState(0);

  const [state, action, pending] = useActionState(
    async (_prev: FormState, formData: FormData): Promise<FormState> => {
      const currentPassword = formData.get('currentPassword') as string;
      const newPw = formData.get('newPassword') as string;
      const totpCode = (formData.get('totpCode') as string) || undefined;

      if (!currentPassword || !newPw) {
        return { ok: false, error: 'Both password fields are required' };
      }

      const res = await changePasswordAction(currentPassword, newPw, totpCode);
      return {
        ok: res.ok,
        error: 'error' in res ? (res.error ?? '') : '',
      };
    },
    { ok: false, error: '' },
  );

  useEffect(() => {
    if (state.ok) {
      toast.success('Password changed');
      setNewPassword('');
      setFormKey((k) => k + 1); // remount form to clear all inputs
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state.ok, state.error]);

  return (
    <div className="border border-border bg-bg-elev-1 rounded-sm flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <IconLock className="text-fg-muted size-4" />
        <h2 className="text-fg text-base font-semibold tracking-tight">Change Password</h2>
      </div>

      {state.ok ? (
        <div className="flex items-center gap-2 text-sm text-success">
          <IconCheck className="size-4" />
          Password changed successfully
        </div>
      ) : (
        <form key={formKey} action={action} className="flex flex-col gap-3">
          <div className="relative">
            <Input
              name="currentPassword"
              type={showCurrent ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Current password"
              required
              disabled={pending}
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
              name="newPassword"
              type={showNew ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              disabled={pending}
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
            name="totpCode"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="2FA code (if enabled)"
            disabled={pending}
          />
          <Button type="submit" size="sm" loading={pending} disabled={pending}>
            Change password
          </Button>
        </form>
      )}
    </div>
  );
}
