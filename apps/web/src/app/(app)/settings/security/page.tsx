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

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getDb, schema } from '@hamafx/db';
import { eq, and } from 'drizzle-orm';
import { ChangePasswordCard } from '../_components/change-password-card';
import { TwoFactorSetup } from '../_components/two-factor-setup';
import { LinkedAccountsCard } from '../_components/linked-accounts-card';
import { SessionsCard } from '../_components/sessions-card';

export const metadata: Metadata = { title: 'Security | Settings | HamaFX' };
export const revalidate = 60;

export default async function SecurityPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const db = getDb();

  const [userRow] = await db
    .select({ twoFactorEnabled: schema.users.twoFactorEnabled })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  const [googleAccount] = await db
    .select({ providerAccountId: schema.accounts.providerAccountId })
    .from(schema.accounts)
    .where(and(
      eq(schema.accounts.userId, userId),
      eq(schema.accounts.provider, 'google'),
    ))
    .limit(1);

  const twoFactorEnabled = userRow?.twoFactorEnabled ?? false;
  const googleLinked = !!googleAccount;

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex flex-col gap-1">
        <h2 className="text-fg text-lg font-semibold tracking-tight">Security</h2>
        <p className="text-fg-subtle text-sm">Password, two-factor authentication, connected accounts, and active sessions.</p>
      </div>

      <div className="flex flex-col gap-3">
        <ChangePasswordCard />
        <TwoFactorSetup enabled={twoFactorEnabled} />
        <LinkedAccountsCard googleLinked={googleLinked} />
        <SessionsCard />
      </div>
    </div>
  );
}
