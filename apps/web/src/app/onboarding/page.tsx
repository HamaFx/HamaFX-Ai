// SPDX-License-Identifier: Apache-2.0

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { auth } from '@/auth';
import { buildCatalogForUser } from '@/lib/catalog-server';
import { getDb, schema } from '@hamafx/db';
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
      .where(eq(schema.symbolCatalog.isActive, true))
      .orderBy(schema.symbolCatalog.sortOrder),
  ]);
  const providers = catalog.providers;

  return (
    <div className="flex flex-col gap-8">
      <div className="text-center">
        <h1 className="text-fg text-2xl font-bold tracking-tight sm:text-3xl mb-2">Welcome to HamaFX-Ai</h1>
        <p className="text-fg-subtle">Let's configure your workspace.</p>
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