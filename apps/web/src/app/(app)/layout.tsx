import { AmbientBackground } from '@/components/layout/ambient-background';
import { BottomNav } from '@/components/layout/bottom-nav';
import { OfflineBanner } from '@/components/layout/offline-banner';
import { SkipToContent } from '@/components/layout/skip-to-content';
import { TopBar } from '@/components/layout/top-bar';
import { SwRegister } from '@/components/providers/sw-register';
import { MotionRoot } from '@/components/ui/motion-config';
import { Toaster } from '@/components/ui/toaster';

/**
 * Mobile-first shell shared by all authenticated pages.
 *
 * Layout layers (back → front):
 *   1. <SkipToContent/>       a11y skip link, visible on focus only
 *   2. <AmbientBackground/>   fixed -z-10, three blurred orbs + noise
 *   3. main content           page body (id="main-content")
 *   4. <TopBar/>              sticky top, glass
 *   5. <BottomNav/>           fixed bottom, glass
 *   6. <Toaster/>             bottom-center toasts above nav
 *
 * Heights are driven by the layout tokens in globals.css:
 *   --topbar-h, --bottom-nav-h, --fab-bottom, --toast-bottom
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <MotionRoot>
      <div className="text-fg relative min-h-svh">
        <SkipToContent />
        <AmbientBackground intensity="normal" />
        <SwRegister />
        <TopBar />
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-2xl px-4 pt-4 focus:outline-none"
          style={{
            paddingBottom:
              'calc(var(--bottom-nav-h) + env(safe-area-inset-bottom) + 24px)',
          }}
        >
          {children}
        </main>
        <OfflineBanner />
        <BottomNav />
        <Toaster />
      </div>
    </MotionRoot>
  );
}
