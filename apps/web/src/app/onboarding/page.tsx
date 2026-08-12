// SPDX-License-Identifier: Apache-2.0

import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';

import { KestrelBrand } from '@/components/brand/kestrel-brand';

import { auth } from '@/auth';
import { buildCatalogForUser } from '@/lib/catalog-server';
import { getDb, schema } from '@kestrel/db';
import { OnboardingWizard } from '@/components/onboarding/wizard';

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const db = getDb();
  const [settings] = await db
    .select()
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, session.user.id));

  if (settings?.onboardingCompleted) {
    redirect('/chat');
  }

  // Phase E — call the catalog builder directly instead of fetching
  // our own host (RSC can't self-fetch without a full URL, and
  // APP_URL isn't always set on Vercel). The wizard accepts the
  // wider ProviderMeta shape so we pass it through as-is.
  const [catalog, symbolsCatalog] = await Promise.all([
    buildCatalogForUser(session.user.id),
    db
      .select()
      .from(schema.symbolCatalog)
      .where(and(
        eq(schema.symbolCatalog.isActive, true),
        eq(schema.symbolCatalog.tenantId, '__system__'),
      ))
      .orderBy(schema.symbolCatalog.sortOrder),
  ]);
  const providers = catalog.providers;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-center text-center">
        <KestrelBrand
          variant="lockup"
          decorative
          priority
          className="mb-5 w-44 sm:w-52"
        />
        <p className="text-brand text-caption mb-2 font-semibold uppercase tracking-[0.18em]">Your market view</p>
        <h1 className="text-fg mb-2 text-2xl font-bold tracking-tight sm:text-3xl">Welcome to Kestrel</h1>
        <p className="text-fg-muted max-w-md leading-relaxed">Set up your watchlist, data sources, and AI workspace for a clearer view of the markets.</p>
      </div>
      <OnboardingWizard
        initialName={session.user.name || ''}
        providers={providers}
        symbolsCatalog={symbolsCatalog}
        initialProgress={settings?.onboardingProgress ?? null}
      />
    </div>
  );
}