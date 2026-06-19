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

import { AmbientBackground } from '@/components/layout/ambient-background';
import { NavDrawer } from '@/components/layout/nav-drawer';
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
      <div className="text-fg relative min-h-svh md:flex md:flex-row bg-bg">
        <SkipToContent />
        <AmbientBackground />
        <SwRegister />
        
        {/* Desktop Sidebar (hidden on mobile) */}
        <div className="hidden md:block shrink-0">
          <NavDrawer isDesktop />
        </div>

        <div className="flex flex-1 flex-col min-w-0">
          <TopBar />
          <main
            id="main-content"
            tabIndex={-1}
            className="flex-1 w-full max-w-7xl mx-auto px-4 pt-4 pb-24 md:pb-8 focus:outline-none"
          >
            {children}
          </main>
        </div>

        {/* Mobile Bottom Nav (hidden on desktop) */}
        <div className="md:hidden">
          <NavDrawer isMobile />
        </div>
        
        <OfflineBanner />
        <Toaster />
      </div>
    </MotionRoot>
  );
}
