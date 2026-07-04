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

// The nav-drawer trigger button used inside <ChatTopBar>. Extracted so the
// chat top bar can pass it as `<NavDrawer trigger={...}>` without the
// drawer having to be aware of chat-specific styling.

import { IconMenu2 } from '@tabler/icons-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { Tooltip } from '@/components/ui/tooltip';

export const NavTrigger = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function NavTrigger(props, ref) {
    return (
      <Tooltip label="Menu" side="bottom">
        <button
          ref={ref}
          type="button"
          aria-label="Open menu"
          className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 active:scale-95 inline-flex size-11 shrink-0 items-center justify-center rounded-sm transition-all"
          {...props}
        >
          <IconMenu2 className="size-5" />
        </button>
      </Tooltip>
    );
  },
);
