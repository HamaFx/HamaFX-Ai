// SPDX-License-Identifier: Apache-2.0

import type { MetadataRoute } from 'next';

// Matches --color-bg = #0A0A0A from globals.css.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'HamaFX-Ai',
    short_name: 'HamaFX',
    description: 'AI trading copilot for forex & commodities',
    start_url: '/chat',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0A0A0A',
    theme_color: '#0A0A0A',
    categories: ['finance', 'productivity'],
    shortcuts: [
      { name: 'New Chat', url: '/chat', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Chart', url: '/chart/XAUUSD', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Alerts', url: '/alerts', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Journal', url: '/journal', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
    screenshots: [
      {
        src: '/screenshots/chat.png',
        sizes: '1080x1920',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'AI trading chat',
      },
      {
        src: '/screenshots/dashboard.png',
        sizes: '1080x1920',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'Trading dashboard',
      },
    ],
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
