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

import type { Metadata } from 'next';
import Image from 'next/image';

import { AmbientBackground } from '@/components/layout/ambient-background';

export const metadata: Metadata = {
  title: {
    template: '%s | HamaFX-Ai',
    default: 'HamaFX-Ai',
  },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="bg-bg relative flex min-h-svh flex-col overflow-hidden px-6"
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 24px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 24px)',
      }}
    >
      <AmbientBackground intensity="vivid" />

      <div className="relative z-10 mx-auto flex w-full max-w-sm flex-1 flex-col justify-between gap-12 py-8">
        <header className="flex flex-col items-center gap-4 text-center">
          <Image
            src="/icons/icon-192.png"
            alt=""
            width={80}
            height={80}
            className="rounded-2xl shadow-xl shadow-black/60"
            priority
          />
          <div className="flex flex-col gap-2">
            <h1 className="text-fg text-3xl font-bold tracking-tight">
              Hama<span className="text-brand">FX</span>
              <span className="text-fg-subtle font-normal">·Ai</span>
            </h1>
            <p className="text-fg-muted text-base">Enterprise trading copilot</p>
          </div>
        </header>

        <div className="flex flex-col gap-6">{children}</div>
      </div>
    </main>
  );
}
