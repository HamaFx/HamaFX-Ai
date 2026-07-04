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

import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({ title, description, icon, children }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-2 pb-2">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          {icon ? (
            <span
              aria-hidden="true"
              className="text-fg bg-bg-elev-2 inline-flex size-12 items-center justify-center rounded-sm"
            >
              {icon}
            </span>
          ) : null}
          <h1 className="text-fg text-display-lg font-bold tracking-tight">
            {title}
          </h1>
        </div>
        {children ? <div className="flex items-center gap-2">{children}</div> : null}
      </div>
      {description ? (
        <p className="text-fg-muted text-body-sm leading-[1.4]">{description}</p>
      ) : null}
    </header>
  );
}
