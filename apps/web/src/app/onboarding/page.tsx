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

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';

import type { CatalogResponse } from '@hamafx/shared';

import { auth } from '@/auth';
import { getDb, schema } from '@hamafx/db';
import { OnboardingWizard } from '@/components/onboarding/wizard';

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/auth/login');
  }

  const db = getDb();
  const [settings] = await db
    .select()
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, session.user.id));

  if (settings?.onboardingCompleted) {
    redirect('/chat');
  }

  // Phase E — provider list comes from the catalog endpoint now, but
// for the onboarding picker we only need the lightweight metadata
// (id/displayName/keyHint/etc.). The wizard accepts a wider
// ProviderMeta shape; pass it through so the per-domain model
// preview later in the flow stays type-safe.
const headersList = await headers();
const catalogRes = await fetch(`${process.env.APP_URL ?? ''}/api/settings/catalog`, {
  headers: { cookie: headersList.get('cookie') ?? '' },
  cache: 'no-store',
});
const catalog: CatalogResponse | null = catalogRes.ok
  ? await catalogRes.json()
  : null;
const providers = catalog?.providers ?? [];

  return (
    <div className="flex flex-col gap-8">
      <div className="text-center">
        <h1 className="text-fg text-2xl font-bold tracking-tight sm:text-3xl mb-2">Welcome to HamaFX-Ai</h1>
        <p className="text-fg-subtle">Let's configure your workspace.</p>
      </div>
      <OnboardingWizard
        initialName={session.user.name || ''}
        providers={providers}
      />
    </div>
  );
}