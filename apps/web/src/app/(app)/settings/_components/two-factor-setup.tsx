'use client';

import { useState } from 'react';
import {IconShield, IconShieldOff, IconLoader2, IconCheck, IconCopy} from '@tabler/icons-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { setupTwoFactorAction, verifyTwoFactorAction, disableTwoFactorAction } from '../actions';

interface TwoFactorSetupProps {
  enabled: boolean;
}

export function TwoFactorSetup({ enabled }: TwoFactorSetupProps) {
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [step, setStep] = useState<'idle' | 'show_qr' | 'verify' | 'done'>('idle');

  const handleStartSetup = async () => {
    setIsSettingUp(true);
    try {
      const res = await setupTwoFactorAction();
      if (res.ok && res.data) {
        setSecret(res.data.secret);
        setQrDataUrl(res.data.qrDataUrl);
        setStep('show_qr');
      } else {
        toast.error('error' in res ? (res.error ?? 'Failed to start setup') : 'Failed to start setup');
      }
    } catch {
      toast.error('Failed to start 2FA setup');
    } finally {
      setIsSettingUp(false);
    }
  };

  const handleVerify = async () => {
    if (!token.trim()) return;
    setVerifying(true);
    try {
      const res = await verifyTwoFactorAction(token.trim());
      if (res.ok) {
        toast.success('Two-factor authentication enabled');
        setStep('done');
      } else {
        toast.error('error' in res ? (res.error ?? 'Invalid code') : 'Invalid code');
      }
    } catch {
      toast.error('Failed to verify code');
    } finally {
      setVerifying(false);
    }
  };

  const handleDisable = async () => {
    if (!token.trim()) return;
    setDisabling(true);
    try {
      const res = await disableTwoFactorAction(token.trim());
      if (res.ok) {
        toast.success('Two-factor authentication disabled');
        setStep('idle');
        setSecret(null);
        setQrDataUrl(null);
        setToken('');
      } else {
        toast.error('error' in res ? (res.error ?? 'Failed to disable') : 'Failed to disable');
      }
    } catch {
      toast.error('Failed to disable 2FA');
    } finally {
      setDisabling(false);
    }
  };

  const handleCopySecret = () => {
    if (secret) {
      navigator.clipboard.writeText(secret);
      toast.success('Secret copied to clipboard');
    }
  };

  if (enabled && step !== 'done') {
    return (
      <div className="border border-border bg-bg-elev-1 rounded-sm p-4 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <IconShield className="size-4 text-bull" />
          <span className="text-sm font-medium text-fg">Two-Factor Authentication</span>
          <span className="rounded-sm bg-bull/15 px-2 py-0.5 text-xs font-medium text-bull ml-auto">
            Enabled
          </span>
        </div>
        <p className="text-caption text-fg-subtle">
          Your account is protected with TOTP-based two-factor authentication.
        </p>
        <div className="flex flex-col gap-2">
          <Input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Enter 6-digit code to disable"
            maxLength={6}
            aria-label="Enter 6-digit code to disable two-factor authentication"
            className="bg-bg-elev-1 h-9 text-sm w-40"
          />
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={handleDisable}
            disabled={disabling || token.length !== 6}
            className="w-fit"
          >
            {disabling ? <IconLoader2 className="size-3.5 animate-spin mr-1" /> : <IconShieldOff className="size-3.5 mr-1" />}
            Disable 2FA
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="border border-border bg-bg-elev-1 rounded-sm p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <IconCheck className="size-4 text-bull" />
          <span className="text-sm font-medium text-fg">Two-Factor Authentication</span>
          <span className="rounded-sm bg-bull/15 px-2 py-0.5 text-xs font-medium text-bull ml-auto">
            Enabled
          </span>
        </div>
        <p className="text-caption text-fg-subtle">
          2FA is active. Next time you perform a sensitive action (export keys, delete account), you'll need your authenticator app code.
        </p>
      </div>
    );
  }

  if (step === 'show_qr' && qrDataUrl) {
    return (
      <div className="border border-border bg-bg-elev-1 rounded-sm p-4 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <IconShield className="size-4 text-fg" />
          <span className="text-sm font-medium text-fg">Set Up Two-Factor Authentication</span>
        </div>
        <div className="flex flex-col items-center gap-3">
          <img src={qrDataUrl} alt="Scan this QR code with your authenticator app" className="size-40 border border-border rounded-sm" />
          <p className="text-caption text-fg-subtle text-center max-w-sm">
            Scan this QR code with your authenticator app (e.g., Google Authenticator, Authy).
          </p>
          <div className="flex items-center gap-2">
            <code className="text-xs bg-bg-elev-2 px-2 py-1 rounded-sm border border-border font-mono select-all">
              {secret}
            </code>
            <button
              type="button"
              onClick={handleCopySecret}
              className="p-1 text-fg-subtle hover:text-fg cursor-pointer"
              aria-label="Copy secret"
            >
              <IconCopy className="size-3.5" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Enter 6-digit code"
            maxLength={6}
            aria-label="Enter verification code"
            className="bg-bg-elev-1 h-9 text-sm w-32"
          />
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleVerify}
            disabled={verifying || token.length !== 6}
          >
            {verifying ? <IconLoader2 className="size-3.5 animate-spin mr-1" /> : null}
            Verify & Enable
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border bg-bg-elev-1 rounded-sm p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <IconShield className="size-4 text-fg-muted" />
        <span className="text-sm font-medium text-fg">Two-Factor Authentication</span>
        {enabled && (
          <span className="rounded-sm bg-bull/15 px-2 py-0.5 text-xs font-medium text-bull ml-auto">
            Enabled
          </span>
        )}
      </div>
      <p className="text-caption text-fg-subtle">
        Add an extra layer of security by requiring a one-time code from your authenticator app when performing sensitive actions.
      </p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={handleStartSetup}
        disabled={isSettingUp}
        className="w-fit"
      >
        {isSettingUp ? <IconLoader2 className="size-3.5 animate-spin mr-1" /> : <IconShield className="size-3.5 mr-1" />}
        Set up 2FA
      </Button>
    </div>
  );
}
