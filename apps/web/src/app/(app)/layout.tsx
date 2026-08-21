// SPDX-License-Identifier: Apache-2.0

import { redirect } from 'next/navigation';
import { cache, Suspense } from 'react';
import { auth } from '@/auth';
import { getUserWithSettings } from '@kestrel/db';
import { checkIsAdmin } from '@/lib/admin-check';

const getOnboardingStatus = cache(async (userId: string) => {
  const { settings } = await getUserWithSettings(userId);
  return settings?.onboardingCompleted ?? false;
});

import { DesktopSidebar } from '@/components/layout/desktop-sidebar';
import { MarketSessionBar } from '@/components/layout/market-session-bar';
import { NavDrawer } from '@/components/layout/nav-drawer';
import { NavDrawerProvider } from '@/components/layout/nav-drawer-context';
import { OfflineBanner } from '@/components/layout/offline-banner';
import { SkipToContent } from '@/components/layout/skip-to-content';
import { TopBar } from '@/components/layout/top-bar';
import { TickerTape } from '@/components/layout/ticker-tape';
import { CommandPalette, InstallNudge } from '@/components/layout/lazy-chrome';
import { MotionRoot } from '@/components/ui/motion-config';
import { Toaster } from '@/components/ui/toaster';

/**
 * Mobile-first & Desktop-adaptive shell shared by all authenticated pages.
 *
 *   1. <NavDrawerProvider/>   single source of truth for the menu state
 *   2. <DesktopSidebar/>      persistent sidebar rail on desktop (lg:+)
 *   3. <SkipToContent/>       a11y skip link, visible on focus only
 *   4. <TopBar/>              sticky top — hidden on /chat where
 *                              <ChatTopBar/> takes over
 *   5. <TickerTape/> + <MarketSessionBar/> ambient market telemetry
 *   6. main content           page body (id="main-content")
 *   7. <NavDrawer/>           drawer instance for mobile/touch
 *   8. <OfflineBanner/>       sticky network-state pill
 *   9. <Toaster/>             bottom-center sonner
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let userName: string | undefined;
  let userEmail: string | undefined;
  let userId: string | undefined;
  let isAdmin = false;

  if (process.env.AUTH_MODE !== 'legacy') {
    const session = await auth();
    if (session?.user?.id) {
      userId = session.user.id;
      userName = session.user.name ?? undefined;
      userEmail = session.user.email ?? undefined;
      const [onboardingCompleted, admin] = await Promise.all([
        getOnboardingStatus(session.user.id),
        checkIsAdmin(),
      ]);
      if (!onboardingCompleted) {
        redirect('/onboarding');
      }
      isAdmin = admin;
    }
  }

  return (
    <MotionRoot>
      <NavDrawerProvider>
        <div className="bg-bg text-fg relative min-h-svh">
          <DesktopSidebar
            {...(userName !== undefined ? { userName } : {})}
            {...(userEmail !== undefined ? { userEmail } : {})}
            isAdmin={isAdmin}
          />
          <div className="lg:pl-16 transition-all duration-200">
            <SkipToContent />
            <TopBar />
            <TickerTape />
            <MarketSessionBar />
            <main
              id="main-content"
              tabIndex={-1}
              className="mx-auto w-full max-w-2xl px-4 pt-4 xl:max-w-7xl xl:px-6 focus:outline-none"
              style={{ viewTransitionName: 'main-content', paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
            >
              {/* Phase B — UX_UPGRADE_PLAN.md item 12. PWA install hint. */}
              <InstallNudge />
              {/* H1: Suspense boundary for route-level streaming. */}
              <Suspense
                fallback={
                  <div className="flex min-h-[40svh] items-center justify-center">
                    <div className="shimmer h-32 w-full max-w-md rounded-sm" />
                  </div>
                }
              >
                {children}
              </Suspense>
            </main>
          </div>
          <NavDrawer {...(userName !== undefined ? { userName } : {})} {...(userEmail !== undefined ? { userEmail } : {})} {...(userId !== undefined ? { userId } : {})} isAdmin={isAdmin} />
          <OfflineBanner />
          {/* Phase B — UX_UPGRADE_PLAN.md item 11. Global ⌘K / Ctrl-K
              launcher. Self-contained: keyboard listener, vaul drawer,
              floating touch button. */}
          <CommandPalette />
          <Toaster />
        </div>
      </NavDrawerProvider>
    </MotionRoot>
  );
}
