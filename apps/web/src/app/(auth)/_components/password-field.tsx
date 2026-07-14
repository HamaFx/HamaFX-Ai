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

// §5: Shared password field with show/hide toggle, caps-lock hint,
// and strength meter. Used by login, register, and reset-password pages.

import { useState } from 'react';
import { IconEye, IconEyeOff } from '@tabler/icons-react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';

interface PasswordFieldProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  autoComplete?: string;
  autoFocus?: boolean;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
  showStrengthMeter?: boolean;
  error?: boolean;
}

export function PasswordField({
  id = 'password',
  name = 'password',
  value,
  onChange,
  autoComplete,
  autoFocus,
  required,
  disabled,
  readOnly,
  minLength,
  maxLength = 128,
  placeholder,
  showStrengthMeter,
  error,
}: PasswordFieldProps) {
  const [show, setShow] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);

  const checks = showStrengthMeter
    ? [
        { label: 'Min 8 characters', ok: value.length >= 8 },
        { label: 'One uppercase letter', ok: /[A-Z]/.test(value) },
        { label: 'One lowercase letter', ok: /[a-z]/.test(value) },
        { label: 'One number', ok: /[0-9]/.test(value) },
      ]
    : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required={required}
          minLength={minLength}
          maxLength={maxLength}
          disabled={disabled}
          readOnly={readOnly}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e);
            // getModifierState is on the native event, not the React synthetic event
            setCapsLockOn((e.nativeEvent as KeyboardEvent).getModifierState?.('CapsLock') ?? false);
          }}
          onKeyUp={(e) => setCapsLockOn((e.nativeEvent as KeyboardEvent).getModifierState?.('CapsLock') ?? false)}
          {...(error !== undefined ? { error } : {})}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="text-fg-muted hover:text-fg absolute right-2 top-1/2 -translate-y-1/2"
          tabIndex={-1}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
        </button>
      </div>

      {/* Caps-lock hint */}
      {capsLockOn && (
        <p className="flex items-center gap-1 text-fg-muted text-xs" role="alert">
          ⇪ Caps Lock is on
        </p>
      )}

      {/* Strength meter */}
      {checks && value.length > 0 && (
        <div className={cn('text-xs grid grid-cols-2 gap-1 mt-1')}>
          {checks.map((c) => (
            <div key={c.label} className="flex items-center gap-1">
              <span className={c.ok ? 'text-success' : 'text-danger'}>
                {c.ok ? '\u2713' : '\u2717'}
              </span>
              <span className="text-fg-subtle">{c.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
