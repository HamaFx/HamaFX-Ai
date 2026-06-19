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

import type { ReactNode } from 'react';
import { AmbientBackground } from '@/components/layout/ambient-background';
import { Toaster } from '@/components/ui/toaster';

export const metadata = {
  title: 'Welcome - HamaFX-Ai',
};

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="text-fg relative min-h-svh">
      <AmbientBackground />
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        {children}
      </main>
      <Toaster />
    </div>
  );
}
