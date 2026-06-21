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

import { auth } from '@/auth';
import { buildCatalogForUser } from '@/lib/catalog-server';
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

  // Phase E — call the catalog builder directly instead of fetching
// our own host (RSC can't self-fetch without a full URL, and
// APP_URL isn't always set on Vercel). The wizard accepts the
// wider ProviderMeta shape so we pass it through as-is.
const catalog = await buildCatalogForUser(session.user.id);
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
      />
    </div>
  );
}