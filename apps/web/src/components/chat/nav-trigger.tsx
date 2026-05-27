'use client';

// The nav-drawer trigger button used inside <ChatTopBar>. Extracted so the
// chat top bar can pass it as `<NavDrawer trigger={...}>` without the
// drawer having to be aware of chat-specific styling.

import { Menu } from 'lucide-react';
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
          className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 inline-flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors"
          {...props}
        >
          <Menu className="size-5" />
        </button>
      </Tooltip>
    );
  },
);
