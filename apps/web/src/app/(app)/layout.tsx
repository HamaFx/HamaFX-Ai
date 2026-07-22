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

import { redirect } from 'next/navigation';
import { cache, Suspense } from 'react';
import { auth } from '@/auth';
import { getUserWithSettings } from '@hamafx/db';
import { checkIsAdmin } from '@/lib/admin-check';

const getOnboardingStatus = cache(async (userId: string) => {
  const { settings } = await getUserWithSettings(userId);
  return settings?.onboardingCompleted ?? false;
});

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
 * Mobile-first shell shared by all authenticated pages.
 *
 *   1. <NavDrawerProvider/>   single source of truth for the menu state
 *   2. <SkipToContent/>       a11y skip link, visible on focus only
 *   3. <TopBar/>              sticky top — hidden on /chat where
 *                              <ChatTopBar/> takes over
 *   5. main content           page body (id="main-content")
 *   6. <NavDrawer/>           single global drawer instance, opened from
 *                              any nav trigger via context
 *   7. <OfflineBanner/>       sticky network-state pill
 *   8. <Toaster/>             bottom-center sonner
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
      // Parallelize the two independent data fetches. The admin check only
      // matters once we know onboarding is complete, but it is independent
      // of the settings fetch, so running them together saves ~one network
      // round-trip on every authenticated page load.
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
          <SkipToContent />
          <TopBar />
          <TickerTape />
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
