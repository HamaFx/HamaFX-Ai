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
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { getDb, schema } from '@hamafx/db';

import { AmbientBackground } from '@/components/layout/ambient-background';
import { CommandPalette } from '@/components/layout/command-palette';
import { InstallNudge } from '@/components/layout/install-nudge';
import { NavDrawer } from '@/components/layout/nav-drawer';
import { NavDrawerProvider } from '@/components/layout/nav-drawer-context';
import { OfflineBanner } from '@/components/layout/offline-banner';
import { SkipToContent } from '@/components/layout/skip-to-content';
import { TopBar } from '@/components/layout/top-bar';
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
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (process.env.AUTH_MODE !== 'legacy') {
    const session = await auth();
    if (session?.user?.id) {
      const db = getDb();
      const [settings] = await db
        .select({ onboardingCompleted: schema.userSettings.onboardingCompleted })
        .from(schema.userSettings)
        .where(eq(schema.userSettings.userId, session.user.id));
      if (!settings?.onboardingCompleted) {
        redirect('/onboarding');
      }
    }
  }

  return (
    <MotionRoot>
      <NavDrawerProvider>
        <div className="text-fg relative min-h-svh">
          <SkipToContent />
          <AmbientBackground />
          <TopBar />
          <main
            id="main-content"
            tabIndex={-1}
            className="mx-auto w-full max-w-2xl px-4 pt-4 focus:outline-none"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
          >
            {/* Phase B — UX_UPGRADE_PLAN.md item 12. PWA install hint.
                Sticky-positioned below the top bar (drawn here so it
                sits at the top of the page, above page content but
                below the nav drawer overlay). */}
            <InstallNudge />
            {children}
          </main>
          <NavDrawer />
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
