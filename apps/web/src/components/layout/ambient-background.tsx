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
// Per PLAN.md §2.6 — single orb at top-right only. The previous
// bottom-left orb is removed (competed with the brand canvas instead of
// complementing it). Opacity dropped from 0.06 → 0.04 for an even
// quieter rest state.
//
// `intensity="vivid"` brings back the three-orb composition for the
// login surface, where chromatic interest is a feature.
//
// Noise uses CSS repeating-conic-gradient instead of feTurbulence to
// avoid the known iOS-Safari compositing cost of SVG turbulence filters.

// AmbientBackground is now a no-op — the institutional terminal theme
// uses a pure black canvas with no ambient orbs or gradients.
// The component is kept for backward import compatibility.

export function AmbientBackground() {
  return null;
}
