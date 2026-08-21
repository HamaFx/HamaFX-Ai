// SPDX-License-Identifier: Apache-2.0

'use client';

import { useState } from 'react';
import { IconPlus } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { EntryForm } from '@/app/(app)/journal/_components/entry-form';

export function QuickLogTradeDrawer({
  onTradeLogged,
}: {
  onTradeLogged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function handleSuccess() {
    setOpen(false);
    onTradeLogged?.();
    router.refresh();
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button
          variant="primary"
          size="sm"
          className="gap-1.5 font-semibold shadow-xs"
        >
          <IconPlus className="size-4" />
          <span>Log Trade</span>
        </Button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[90vh] overflow-y-auto">
        <DrawerHeader>
          <DrawerTitle>Log New Trade</DrawerTitle>
          <DrawerDescription>
            Record an active or pending order to track live risk, floating R, and execution psychology.
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-6">
          <EntryForm onCreated={handleSuccess} />
        </div>
        <div className="border-t border-border p-3">
          <DrawerClose className="text-fg-muted hover:text-fg text-body-sm w-full text-center py-1">
            Cancel
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
