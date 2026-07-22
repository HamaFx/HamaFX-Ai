// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from 'react';
import { Toaster } from '@/components/ui/toaster';

export const metadata = {
  title: 'Welcome - HamaFX-Ai',
};

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="text-fg relative min-h-svh">
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        {children}
      </main>
      <Toaster />
    </div>
  );
}
