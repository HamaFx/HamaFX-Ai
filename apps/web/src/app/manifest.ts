import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'HamaFX-Ai',
    short_name: 'HamaFX',
    description: 'Personal AI trading copilot for XAUUSD, EURUSD, GBPUSD.',
    start_url: '/chat',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0d14',
    theme_color: '#0a0d14',
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
