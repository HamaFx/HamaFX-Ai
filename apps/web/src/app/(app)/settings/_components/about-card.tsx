// SPDX-License-Identifier: Apache-2.0

// About card — sign-out + a small "what's running" footer with build id.
// Server component.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { IconLogout } from '@tabler/icons-react';

import { LogoutButton } from './logout-button';
import { SettingsRow } from './settings-row';

let _buildId: string | null | undefined;
function getBuildId(): string | null {
  if (_buildId === undefined) {
    try {
      const file = path.join(process.cwd(), '.build-id');
      const text = readFileSync(file, 'utf-8');
      _buildId = text.trim() || null;
    } catch {
      _buildId = null;
    }
  }
  return _buildId;
}

export async function AboutCard() {
  const buildId = getBuildId();

  return (
    <section
      aria-labelledby="about-heading"
      className="border border-border bg-bg-elev-1 rounded-sm flex flex-col gap-1 p-4"
    >
      <header className="flex items-center gap-3 pb-2">
        <h2 id="about-heading" className="text-fg text-base font-semibold tracking-tight">
          About
        </h2>
      </header>

      <SettingsRow
        icon={<IconLogout className="size-4" />}
        label="Sign out"
        description="Clears the password cookie on this device"
        action={<LogoutButton />}
      />

      {/* Footer — build id + a tiny credit line. Helps debug bug reports
          when the user can name the exact build they're on. */}
      <div className="border-border -mx-4 mt-2 flex flex-col gap-1 border-t px-4 pt-3 text-caption">
        <p className="text-fg-subtle tabular-nums">
          Build {buildId ?? 'unknown'}
        </p>
        <p className="text-fg-subtle/70">
          XAUUSD · EURUSD · GBPUSD — personal copilot
        </p>
      </div>
    </section>
  );
}
