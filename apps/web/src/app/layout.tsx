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

import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import { GeistSans } from 'geist/font/sans';
import { ViewTransitions } from 'next-view-transitions';

import { Providers } from '@/components/providers';

import './globals.css';

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'HamaFX-Ai',
    template: '%s · HamaFX-Ai',
  },
  description: 'AI trading copilot for forex & commodities.',
  applicationName: 'HamaFX-Ai',
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon-180.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#0A0A0A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <meta name="color-scheme" content="dark" />
        {/* iPhone 14 & 15 Pro */}
        <link
          rel="apple-touch-startup-image"
          media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
          href="/icons/apple-splash-1179x2556.png"
        />
        {/* iPhone 14 & 15 Pro Max */}
        <link
          rel="apple-touch-startup-image"
          media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
          href="/icons/apple-splash-1179x2556.png"
        />
        {/* iPhone 12 & 13 Pro, iPhone 14 */}
        <link
          rel="apple-touch-startup-image"
          media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
          href="/icons/apple-splash-1179x2556.png"
        />
        {/* iPhone 12 & 13 Pro Max, iPhone 14 Plus */}
        <link
          rel="apple-touch-startup-image"
          media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
          href="/icons/apple-splash-1179x2556.png"
        />
        {/* iPad Pro 12.9" */}
        <link
          rel="apple-touch-startup-image"
          media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
          href="/icons/apple-splash-1179x2556.png"
        />
        {/* iPad Pro 11" */}
        <link
          rel="apple-touch-startup-image"
          media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
          href="/icons/apple-splash-1179x2556.png"
        />
      </head>
      <body className="bg-bg text-fg min-h-svh antialiased">
        <ViewTransitions>
          <Providers>{children}</Providers>
        </ViewTransitions>
      </body>
    </html>
  );
}
