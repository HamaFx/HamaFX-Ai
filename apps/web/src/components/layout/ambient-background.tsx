// Ambient animated background — three slowly drifting blurred gradient
// orbs that give the app surface a sense of depth and life without being
// distracting. Pure CSS animations (no JS), GPU-accelerated transforms.
//
// Positioned `fixed inset-0 -z-10` so it sits behind all content but
// stays in place when the page scrolls.

export function AmbientBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Top-right amber orb */}
      <div
        className="animate-orb-1 absolute -top-32 -right-32 h-[28rem] w-[28rem] rounded-full opacity-30 blur-[100px]"
        style={{ background: 'oklch(78% 0.16 78 / 1)' }}
      />
      {/* Bottom-left violet orb */}
      <div
        className="animate-orb-2 absolute -bottom-32 -left-32 h-[32rem] w-[32rem] rounded-full opacity-25 blur-[120px]"
        style={{ background: 'oklch(72% 0.18 295 / 1)' }}
      />
      {/* Center cyan orb (subtle) */}
      <div
        className="animate-orb-3 absolute left-1/2 top-1/3 h-[24rem] w-[24rem] -translate-x-1/2 rounded-full opacity-15 blur-[110px]"
        style={{ background: 'oklch(72% 0.16 200 / 1)' }}
      />
      {/* Subtle noise texture for organic feel — pure SVG, no asset */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.025] mix-blend-overlay"
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#noise)" />
      </svg>
    </div>
  );
}
