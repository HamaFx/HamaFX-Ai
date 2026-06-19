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

// Static ambient background — a single, very subtle warm orb at the
// top-right edge of the viewport. With the new pure-black canvas, heavy
// gradient orbs read as "color-tinted" rather than "premium black", so
// the default app shell now uses just enough warmth to add depth.
//
// `intensity="vivid"` brings back the three-orb composition for the
// login surface, where chromatic interest is a feature.

import { cn } from '@/lib/cn';

type Intensity = 'subtle' | 'vivid';

interface AmbientBackgroundProps {
  intensity?: Intensity;
  /** Render absolutely (inside a self-contained surface) instead of fixed. */
  contained?: boolean;
  className?: string;
}

export function AmbientBackground({
  intensity = 'subtle',
  contained = false,
  className,
}: AmbientBackgroundProps) {
  const root = cn(
    'pointer-events-none overflow-hidden',
    contained ? 'absolute inset-0' : 'fixed inset-0 -z-10',
    className,
  );

  if (intensity === 'subtle') {
    // Default app shell: one tiny warm whisper. No noise filter — pure
    // canvas reads cleaner and avoids feTurbulence's known iOS-Safari
    // compositing cost.
    return (
      <div aria-hidden="true" className={root}>
        <div
          className="absolute -top-40 -right-40 h-[28rem] w-[28rem] rounded-full blur-[100px]"
          style={{ background: 'oklch(82% 0.14 85 / 1)', opacity: 0.06 }}
        />
        <div
          className="absolute -bottom-32 -left-32 h-[24rem] w-[24rem] rounded-full blur-[120px]"
          style={{ background: 'oklch(70% 0.14 285 / 1)', opacity: 0.04 }}
        />
      </div>
    );
  }

  // Vivid (login marquee): three orbs + faint noise.
  return (
    <div aria-hidden="true" className={root}>
      <div
        className="absolute -top-32 -right-32 h-[28rem] w-[28rem] rounded-full blur-[100px]"
        style={{ background: 'oklch(82% 0.14 85 / 1)', opacity: 0.18 }}
      />
      <div
        className="absolute -bottom-32 -left-32 h-[32rem] w-[32rem] rounded-full blur-[120px]"
        style={{ background: 'oklch(70% 0.14 285 / 1)', opacity: 0.14 }}
      />
      <div
        className="absolute left-1/2 top-1/3 h-[24rem] w-[24rem] -translate-x-1/2 rounded-full blur-[110px]"
        style={{ background: 'oklch(74% 0.14 230 / 1)', opacity: 0.08 }}
      />
      <svg
        className="absolute inset-0 h-full w-full mix-blend-overlay"
        style={{ opacity: 0.04 }}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <filter id="hama-noise">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#hama-noise)" />
      </svg>
    </div>
  );
}
