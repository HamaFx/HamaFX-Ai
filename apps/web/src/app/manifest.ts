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
