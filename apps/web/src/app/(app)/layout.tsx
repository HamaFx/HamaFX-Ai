import { AmbientBackground } from '@/components/layout/ambient-background';
import { BottomNav } from '@/components/layout/bottom-nav';
import { OfflineBanner } from '@/components/layout/offline-banner';
import { TopBar } from '@/components/layout/top-bar';
import { SwRegister } from '@/components/providers/sw-register';
import { MotionRoot } from '@/components/ui/motion-config';
import { Toaster } from '@/components/ui/toaster';

/**
 * Mobile-first shell shared by all authenticated pages.
 *
 * Layout layers (back → front):
 *   1. <AmbientBackground/>   fixed -z-10, animated gradient orbs + noise
 *   2. main content           page body
 *   3. <TopBar/>              sticky top, glass
 *   4. <BottomNav/>           fixed bottom, glass
 *   5. <Toaster/>             bottom-center toasts above nav
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <MotionRoot>
      <div className="text-fg relative min-h-svh">
        <AmbientBackground />
        <SwRegister />
        <TopBar />
        <main
          className="mx-auto w-full max-w-2xl px-4 pt-4"
          style={{ paddingBottom: 'calc(72px + env(safe-area-inset-bottom) + 24px)' }}
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
