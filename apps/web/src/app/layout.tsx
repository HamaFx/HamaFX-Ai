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
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: 'oklch(15% 0.02 260)' },
    { media: '(prefers-color-scheme: light)', color: 'oklch(99% 0.005 260)' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body className="bg-bg text-fg min-h-svh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
