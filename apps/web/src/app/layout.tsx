import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';

import { Providers } from '@/components/providers';

import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

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
  description: 'Personal AI trading copilot for XAUUSD, EURUSD, GBPUSD.',
  applicationName: 'HamaFX-Ai',
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
  // No public crawling — personal app.
  robots: { index: false, follow: false },
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
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: 'oklch(15% 0.02 260)' },
    { media: '(prefers-color-scheme: light)', color: 'oklch(99% 0.005 260)' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <link
          rel="apple-touch-startup-image"
          media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
          href="/icons/apple-splash-1179x2556.png"
        />
      </head>
      <body className="bg-bg text-fg min-h-svh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
