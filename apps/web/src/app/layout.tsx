// SPDX-License-Identifier: Apache-2.0

import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import { ViewTransitions } from 'next-view-transitions';

import { Providers } from '@/components/providers';

import './globals.css';

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  adjustFontFallback: false,
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
      className={jetbrainsMono.variable}
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
