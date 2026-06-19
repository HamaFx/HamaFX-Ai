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

// About card — sign-out + a small "what's running" footer with build id.
// Server component.

import { LogOut } from 'lucide-react';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { LogoutButton } from './logout-button';
import { SettingsRow } from './settings-row';

async function readBuildId(): Promise<string | null> {
  try {
    const file = path.join(process.cwd(), '.build-id');
    const text = await fs.readFile(file, 'utf-8');
    const trimmed = text.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

export async function AboutCard() {
  const buildId = await readBuildId();

  return (
    <section
      aria-labelledby="about-heading"
      className="card-premium flex flex-col gap-1 p-4"
    >
      <header className="flex items-center gap-3 pb-2">
        <h2 id="about-heading" className="text-fg text-base font-semibold tracking-tight">
          Session
        </h2>
      </header>

      <SettingsRow
        icon={<LogOut className="size-4" />}
        label="Sign out"
        description="Clears the password cookie on this device"
        action={<LogoutButton />}
      />

      {/* Footer — build id + a tiny credit line. Helps debug bug reports
          when the user can name the exact build they're on. */}
      <div className="border-divider/60 -mx-4 mt-2 flex flex-col gap-1 border-t px-4 pt-3 text-[10px]">
        <p className="text-fg-subtle tabular-nums">
          Build {buildId ?? 'unknown'} · Next.js 15 · Vercel deploy
        </p>
        <p className="text-fg-subtle/70">
          XAUUSD · EURUSD · GBPUSD — personal copilot
        </p>
      </div>
    </section>
  );
}
