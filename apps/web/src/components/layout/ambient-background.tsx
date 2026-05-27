// Static ambient background — three soft gradient orbs and a noise
// overlay. No animation, no drift. Pure decoration that adds depth
// without movement.
//
// Positioned `fixed inset-0 -z-10` so it sits behind all content but
// stays in place when the page scrolls.
//
// `intensity` controls overall opacity so the same component can serve
// the app shell ("subtle"), the chat surface ("subtle" — chat used to
// double up its own copy, removed), and the login screen ("vivid").

import { cn } from '@/lib/cn';

type Intensity = 'subtle' | 'normal' | 'vivid';

interface AmbientBackgroundProps {
  intensity?: Intensity;
  /** Render as a non-fixed (absolute) background — for self-contained
   *  surfaces like the login card scene where the page itself is the
   *  scrollable element. Default false (fixed). */
  contained?: boolean;
  className?: string;
}

const ORB_OPACITY: Record<Intensity, { tr: number; bl: number; mid: number; noise: number }> = {
  subtle: { tr: 0.18, bl: 0.14, mid: 0.08, noise: 0.018 },
  normal: { tr: 0.25, bl: 0.2, mid: 0.1, noise: 0.025 },
  vivid: { tr: 0.3, bl: 0.22, mid: 0.16, noise: 0.04 },
};

export function AmbientBackground({
  intensity = 'normal',
  contained = false,
  className,
}: AmbientBackgroundProps) {
  const o = ORB_OPACITY[intensity];
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none overflow-hidden',
        contained ? 'absolute inset-0' : 'fixed inset-0 -z-10',
        className,
      )}
    >
      {/* Top-right amber orb */}
      <div
        className="absolute -top-32 -right-32 h-[28rem] w-[28rem] rounded-full blur-[100px]"
        style={{ background: 'oklch(78% 0.16 78 / 1)', opacity: o.tr }}
      />
      {/* Bottom-left violet orb */}
      <div
        className="absolute -bottom-32 -left-32 h-[32rem] w-[32rem] rounded-full blur-[120px]"
        style={{ background: 'oklch(72% 0.18 295 / 1)', opacity: o.bl }}
      />
      {/* Center cyan orb */}
      <div
        className="absolute left-1/2 top-1/3 h-[24rem] w-[24rem] -translate-x-1/2 rounded-full blur-[110px]"
        style={{ background: 'oklch(72% 0.16 200 / 1)', opacity: o.mid }}
      />
      {/* Subtle noise texture for organic feel. We share a single SVG
       *  filter id across mounts (intensity is encoded via opacity, not
       *  filter params) so the GPU doesn't recompile per-page. */}
      <svg
        className="absolute inset-0 h-full w-full mix-blend-overlay"
        style={{ opacity: o.noise }}
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
