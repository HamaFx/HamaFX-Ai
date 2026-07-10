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

// <ConfirmDrawer> — drawer-based confirmation dialog. Replaces native
// `window.confirm()` calls so destructive actions stay within the app's
// clean aesthetic.
//
// Two ways to use it:
//
// 1. Controlled — pass `open` + `onOpenChange`, render trigger separately:
//      <ConfirmDrawer
//        open={open}
//        onOpenChange={setOpen}
//        title="Delete conversation?"
//        description="This permanently removes the thread and all messages."
//        confirmLabel="Delete"
//        tone="danger"
//        onConfirm={() => deleteThread()}
//      />
//
// 2. Imperative via the `useConfirm()` hook — returns a `confirm(opts)`
//    promise that resolves `true` on confirm, `false` otherwise. Renders
//    its own portal-mounted drawer.

import { IconAlertTriangle } from '@tabler/icons-react';
import { useCallback, useRef, useState } from 'react';

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { cn } from '@/lib/cn';

import { Button } from './button';

type Tone = 'danger' | 'default';

interface ConfirmDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string | undefined;
  confirmLabel?: string | undefined;
  cancelLabel?: string | undefined;
  tone?: Tone | undefined;
  busy?: boolean | undefined;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDrawer({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  busy,
  onConfirm,
}: ConfirmDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <div className="flex items-center gap-3">
            {tone === 'danger' ? (
              <span
                aria-hidden
                className="text-danger bg-danger/10 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-sm"
              >
                <IconAlertTriangle className="size-5" strokeWidth={2} />
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              <DrawerTitle>{title}</DrawerTitle>
              {description ? (
                <DrawerDescription className="mt-1">{description}</DrawerDescription>
              ) : null}
            </div>
          </div>
        </DrawerHeader>
        <DrawerFooter>
          <Button
            type="button"
            variant={tone === 'danger' ? 'danger' : 'primary'}
            size="md"
            disabled={busy}
            onClick={() => void onConfirm()}
            className={cn('w-full', busy && 'opacity-70')}
          >
            {busy ? `${confirmLabel}…` : confirmLabel}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="md"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="w-full"
          >
            {cancelLabel}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Imperative API — useConfirm()
// ---------------------------------------------------------------------------

interface ConfirmOptions {
  title: string;
  description?: string | undefined;
  confirmLabel?: string | undefined;
  cancelLabel?: string | undefined;
  tone?: Tone | undefined;
}

/**
 * Returns `[confirmEl, confirm]` — render `confirmEl` once near the root,
 * call `await confirm({ ... })` anywhere to prompt and await user choice.
 */
export function useConfirm(): readonly [React.ReactNode, (opts: ConfirmOptions) => Promise<boolean>] {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({ title: '' });
  const resolveRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts);
    setBusy(false);
    setOpen(true);
    return new Promise<boolean>((res) => {
      resolveRef.current = res;
    });
  }, []);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      resolveRef.current?.(false);
      resolveRef.current = null;
      setOpen(false);
    }
  }, []);

  const handleConfirm = useCallback(async () => {
    setBusy(true);
    try {
      resolveRef.current?.(true);
      resolveRef.current = null;
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }, []);

  const node = (
    <ConfirmDrawer
      open={open}
      onOpenChange={handleOpenChange}
      title={options.title}
      description={options.description}
      confirmLabel={options.confirmLabel}
      cancelLabel={options.cancelLabel}
      tone={options.tone}
      busy={busy}
      onConfirm={handleConfirm}
    />
  );

  return [node, confirm] as const;
}
