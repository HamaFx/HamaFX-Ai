'use client';

// SPDX-License-Identifier: Apache-2.0
import { IconChevronDown, IconCpu } from '@tabler/icons-react';

import { usePopupMenu } from '@/hooks/use-popup-menu';
import { cn } from '@/lib/cn';

import { modelLabelFromSelection } from './model-picker-utils';
import { RegenModelPicker } from './regen-model-picker';

interface ChatModelSelectorProps {
  /** Persisted `provider:model` value, or null when using the resolver default. */
  activeModelId: string | null;
  disabled?: boolean;
  onPick: (modelId: string) => void;
}

/**
 * Model selection for future chat turns. This intentionally reuses the same
 * authenticated catalog and capability filtering as "Regenerate with…" so
 * the chat page never exposes providers the user has not configured.
 */
export function ChatModelSelector({
  activeModelId,
  disabled = false,
  onPick,
}: ChatModelSelectorProps) {
  const menu = usePopupMenu({ focusFirstOnOpen: false });
  const label = modelLabelFromSelection(activeModelId);

  return (
    <div className="relative shrink-0" ref={menu.menuRef}>
      <button
        ref={menu.triggerRef}
        type="button"
        disabled={disabled}
        onClick={menu.toggle}
        aria-label="Chat model"
        title={activeModelId ? `Chat model: ${label}` : 'Chat model: use configured default'}
        {...menu.triggerProps}
        className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 active:bg-bg-elev-3 text-caption inline-flex min-h-9 items-center gap-1 rounded-sm px-2 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        <IconCpu className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="hidden max-w-28 truncate sm:inline">{label}</span>
        <IconChevronDown className="size-3 shrink-0" aria-hidden="true" />
      </button>

      {menu.open ? (
        <div
          {...menu.menuProps}
          className={cn(
            'bg-bg-elev-1 border-border absolute top-full right-0 z-50 mt-2 rounded-sm border p-2 shadow-xl',
            'max-w-[calc(100vw-1.5rem)]',
          )}
        >
          <div className="text-caption text-fg-subtle px-2 pb-1">Applies to future chat turns</div>
          <RegenModelPicker
            popoverId={menu.menuId}
            activeModelId={activeModelId}
            onPick={(modelId) => {
              onPick(modelId);
              menu.close();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
