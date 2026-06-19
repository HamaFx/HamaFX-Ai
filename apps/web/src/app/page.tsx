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
import { getDb, schema } from '@hamafx/db';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';

export default async function RootPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/chat');
  }

  const db = getDb();
  const [settings] = await db
    .select({ onboardingCompleted: schema.userSettings.onboardingCompleted })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, session.user.id));

  if (!settings?.onboardingCompleted) {
    redirect('/onboarding');
  }

  redirect('/chat');
}
