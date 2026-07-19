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

// Bottom-sheet drawer built on vaul. Mirrors the shadcn/ui Drawer API so
// patterns from the docs translate directly. iOS-feel swipe-to-dismiss,
// focus trapping, and Escape-to-close come from vaul out of the box.
//
// Phase 7 task 7.4 — the manual focus trap + Tab cycling was removed to
// avoid double-handling with vaul's built-in trap. vaul/Radix already
// manages focus restore, Tab cycling, and Escape-to-close. We keep only
// the initial focus move to the first focusable element for ergonomics.

import * as React from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';

import { cn } from '@/lib/cn';

const Drawer = ({
  shouldScaleBackground = true,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) => (
  <DrawerPrimitive.Root shouldScaleBackground={shouldScaleBackground} {...props} />
);
Drawer.displayName = 'Drawer';

const DrawerTrigger: typeof DrawerPrimitive.Trigger = DrawerPrimitive.Trigger;
const DrawerPortal: typeof DrawerPrimitive.Portal = DrawerPrimitive.Portal;
const DrawerClose: typeof DrawerPrimitive.Close = DrawerPrimitive.Close;

const DrawerOverlay = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-50 bg-overlay ', className)}
    {...props}
  />
)) as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay> & React.RefAttributes<HTMLDivElement>
>;
DrawerOverlay.displayName = 'DrawerOverlay';

const DrawerContent = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      contentRef.current = node;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [ref],
  );

  // M-1 audit fix: gate the focus-management effect with an empty deps
  // array so it runs exactly once on mount (when the drawer opens), not
  // on every render of DrawerContent. vaul portals DrawerContent in only
  // when the Root is open, so mount == open. Without the deps array the
  // effect would re-focus the first focusable element on any parent state
  // change (e.g. typing into an input inside the drawer), which both
  // wastes work and can yank focus away from the user mid-interaction.
  React.useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    // Focus the first focusable element each time the drawer opens.
    // vaul handles Tab cycling, Escape-to-close, and focus restore.
    const focusableSelector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusables = Array.from(
      el.querySelectorAll<HTMLElement>(focusableSelector),
    ).filter(
      (node) => !node.hasAttribute('disabled') && node.getAttribute('aria-hidden') !== 'true',
    );

    const firstFocusable = focusables[0];
    if (firstFocusable) {
      firstFocusable.focus();
    } else {
      el.focus();
    }
  }, []);

  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Content
        ref={setRefs}
        tabIndex={-1}
        className={cn(
          'surface-elevated fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto max-h-[92svh] flex-col rounded-sm border-b-0',
          'pb-[max(env(safe-area-inset-bottom),16px)]',
          'focus-visible:outline-none',
          className,
        )}
        {...props}
      >
        <div className="mx-auto mt-3 mb-2 h-1.5 w-12 rounded-sm bg-fg-subtle/40" aria-hidden="true" />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}) as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content> & React.RefAttributes<HTMLDivElement>
>;
DrawerContent.displayName = 'DrawerContent';

const DrawerHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('grid gap-1.5 px-4 pb-2 text-left', className)} {...props} />
);
DrawerHeader.displayName = 'DrawerHeader';

const DrawerFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mt-auto flex flex-col gap-2 px-4 pt-4', className)} {...props} />
);
DrawerFooter.displayName = 'DrawerFooter';

const DrawerTitle = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight text-fg', className)}
    {...props}
  />
)) as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title> & React.RefAttributes<HTMLHeadingElement>
>;
DrawerTitle.displayName = 'DrawerTitle';

const DrawerDescription = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn('text-sm text-fg-muted', className)}
    {...props}
  />
)) as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description> & React.RefAttributes<HTMLParagraphElement>
>;
DrawerDescription.displayName = 'DrawerDescription';

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
