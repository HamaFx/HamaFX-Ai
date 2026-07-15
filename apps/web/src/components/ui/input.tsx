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

import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

// Mobile-first: h-12 (48px) — comfortably above the 44pt minimum so the
// input is unmistakably tappable. text-base (16px) prevents iOS Safari's
// auto-zoom on focus, which fires whenever an input renders smaller than
// 16px and is one of the worst mobile UX bugs we used to ship.
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, error, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={error ? 'true' : undefined}
      className={cn(
        'bg-bg-elev-1/60 text-fg placeholder:text-fg-subtle',
        'h-12 w-full rounded-sm border px-4 text-base',
        error
          ? 'border-danger/60 focus:border-danger/80 focus:ring-2 focus:ring-danger/30'
          : 'border-border focus:border-brand-border',
        '',
        'transition-all duration-150 ease-in-out',
        'focus:bg-bg-elev-1/80',
        'focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...rest}
    />
  );
});
