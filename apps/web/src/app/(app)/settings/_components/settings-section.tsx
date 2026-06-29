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

// Premium glass settings section.

import type { ReactNode } from 'react';

interface SettingsSectionProps {
  icon?: ReactNode;
  iconColor?: string;
  title: string;
  description?: string;
  children: ReactNode;
}

export function SettingsSection({
  icon,
  iconColor = 'oklch(78% 0.16 78 / 0.18)',
  title,
  description,
  children,
}: SettingsSectionProps) {
  return (
    <section
      aria-labelledby={`section-${title.toLowerCase().replace(/\s+/g, '-')}`}
      className="flex flex-col gap-3"
    >
      <header className="flex items-center gap-3 px-0.5">
        {icon ? (
          <span
            className="text-fg inline-flex h-7 w-7 items-center justify-center rounded-lg"
            style={{
              background: iconColor,
            }}
          >
            {icon}
          </span>
        ) : null}
        <div className="flex flex-col gap-0.5">
          <h2
            id={`section-${title.toLowerCase().replace(/\s+/g, '-')}`}
            className="text-fg text-sm font-semibold tracking-tight"
          >
            {title}
          </h2>
          {description ? <p className="text-fg-subtle text-caption">{description}</p> : null}
        </div>
      </header>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}
