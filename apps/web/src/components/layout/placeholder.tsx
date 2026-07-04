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

import { cn } from '@/lib/cn';

interface PlaceholderProps {
  title: string;
  description: string;
  /** Phase tag, e.g. "Phase 1b" — shown as a small chip. */
  phase?: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Empty-state card used for routes that exist in the app shell but won't be
 * implemented until a later phase. Keeps the navigation discoverable while
 * making it obvious to anyone (you, or a future AI agent) what's pending.
 */
export function Placeholder({ title, description, phase, className, children }: PlaceholderProps) {
  return (
    <div
      className={cn(
        'border-border bg-bg-elev-1 flex flex-col items-start gap-3 rounded-sm border p-5',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-fg text-base font-semibold">{title}</h2>
        {phase ? (
          <span className="border-border text-fg-muted rounded-sm border px-2 py-0.5 text-xs font-medium">
            {phase}
          </span>
        ) : null}
      </div>
      <p className="text-fg-muted text-sm leading-[1.4]">{description}</p>
      {children}
    </div>
  );
}
