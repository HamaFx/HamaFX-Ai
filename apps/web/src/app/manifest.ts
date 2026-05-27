import type { MetadataRoute } from 'next';

// Pure black canvas — matches --color-bg = oklch(8% 0 0).
// `#0a0a0a` is the closest sRGB approximation.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'HamaFX-Ai',
    short_name: 'HamaFX',
    description: 'Personal AI trading copilot for XAUUSD, EURUSD, GBPUSD.',
    start_url: '/chat',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
