'use client';

import dynamic from 'next/dynamic';

export const CommandPalette = dynamic(
  () => import('@/components/layout/command-palette').then((m) => m.CommandPalette),
  { ssr: false, loading: () => <div className="hidden" aria-hidden="true" /> },
);

export const InstallNudge = dynamic(
  () => import('@/components/layout/install-nudge').then((m) => m.InstallNudge),
  { ssr: false, loading: () => <div className="hidden" aria-hidden="true" /> },
);
