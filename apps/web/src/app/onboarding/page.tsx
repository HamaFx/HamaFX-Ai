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
import { auth } from '@/auth';
import { getDb, schema } from '@hamafx/db';
import { eq } from 'drizzle-orm';
import { OnboardingWizard } from '@/components/onboarding/wizard';
import { BYOK_PROVIDERS_LIST } from '@hamafx/ai';

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

  // Phase C — UX_UPGRADE_PLAN.md item 16: pass `bestFor` and
  // `supports` through so the wizard tooltip can show them.
  // Conditional spreads keep the object compatible with the
  // strict-optional fields on `ProviderMeta` under
  // exactOptionalPropertyTypes.
  const providers = BYOK_PROVIDERS_LIST.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    familyName: p.familyName,
    keyHint: p.keyHint,
    description: p.description,
    pricingTier: p.pricingTier,
    ...(p.bestFor !== undefined ? { bestFor: p.bestFor } : {}),
    supports: p.supports,
  }));

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