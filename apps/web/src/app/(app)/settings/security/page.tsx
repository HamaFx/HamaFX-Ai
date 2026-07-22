// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getDb, schema } from '@hamafx/db';
import { eq, and } from 'drizzle-orm';
import { ChangePasswordCard } from '../_components/security/change-password-card';
import { TwoFactorSetup } from '../_components/security/two-factor-setup';
import { LinkedAccountsCard } from '../_components/security/linked-accounts-card';
import { SessionsCard } from '../_components/security/sessions-card';

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
