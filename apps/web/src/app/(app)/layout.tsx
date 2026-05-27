import { AmbientBackground } from '@/components/layout/ambient-background';
import { NavDrawer } from '@/components/layout/nav-drawer';
import { NavDrawerProvider } from '@/components/layout/nav-drawer-context';
import { OfflineBanner } from '@/components/layout/offline-banner';
import { SkipToContent } from '@/components/layout/skip-to-content';
import { TopBar } from '@/components/layout/top-bar';
import { SwRegister } from '@/components/providers/sw-register';
import { MotionRoot } from '@/components/ui/motion-config';
import { Toaster } from '@/components/ui/toaster';

/**
 * Mobile-first shell shared by all authenticated pages.
 *
 *   1. <NavDrawerProvider/>   single source of truth for the menu state
 *   2. <SkipToContent/>       a11y skip link, visible on focus only
 *   3. <AmbientBackground/>   fixed -z-10, very subtle warm orb
 *   4. <TopBar/>              sticky top, glass — hidden on /chat where
 *                              <ChatTopBar/> takes over
 *   5. main content           page body (id="main-content")
 *   6. <NavDrawer/>           single global drawer instance, opened from
 *                              any nav trigger via context
 *   7. <OfflineBanner/>       sticky network-state pill
 *   8. <Toaster/>             bottom-center sonner
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <MotionRoot>
      <NavDrawerProvider>
        <div className="text-fg relative min-h-svh">
          <SkipToContent />
          <AmbientBackground />
          <SwRegister />
          <TopBar />
          <main
            id="main-content"
            tabIndex={-1}
            className="mx-auto w-full max-w-2xl px-4 pt-4 focus:outline-none"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
          >
            {children}
          </main>
          <NavDrawer />
          <OfflineBanner />
          <Toaster />
        </div>
      </NavDrawerProvider>
    </MotionRoot>
  );
}
