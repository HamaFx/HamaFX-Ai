import { BottomNav } from '@/components/layout/bottom-nav';
import { TopBar } from '@/components/layout/top-bar';

/**
 * Mobile-first shell shared by all authenticated pages.
 *
 *   ┌──────────────┐ ← TopBar (sticky, 48px + safe-area-top)
 *   │              │
 *   │  page body   │   (scrollable, padded for the nav at the bottom)
 *   │              │
 *   ├──────────────┤
 *   │  BottomNav   │ ← (fixed, 64px + safe-area-bottom)
 *   └──────────────┘
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-bg text-fg min-h-svh">
      <TopBar />
      <main
        className="mx-auto w-full max-w-2xl px-4 pt-4"
        // Bottom padding = nav height + safe-area + breathing room.
        style={{ paddingBottom: 'calc(64px + env(safe-area-inset-bottom) + 24px)' }}
      >
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
