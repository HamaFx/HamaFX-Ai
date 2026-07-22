// SPDX-License-Identifier: Apache-2.0

// SRP-3: User provisioning + account linking extracted from the NextAuth
// signIn callback. The callback was ~108 lines of `any`-typed business
// logic — this module makes it typed, testable, and self-contained.
//
// The signIn callback becomes thin glue: validate inputs, delegate to
// provisionUserOnSignIn, return its decision.

import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '@hamafx/db';
import { getDb } from '@hamafx/ai';

// ── Typed inputs ──────────────────────────────────────────────────────

export interface SignInInput {
  user: {
    id?: string;
    email?: string | null;
    name?: string | null;
    image?: string | null;
  };
  account: {
    provider: string;
    providerAccountId: string;
    type: string;
    access_token?: unknown;
    refresh_token?: unknown;
    expires_at?: unknown;
    token_type?: unknown;
    scope?: unknown;
    id_token?: unknown;
  } | null;
  profile?: Record<string, unknown> | undefined;
}

export interface SignInDecision {
  allow: boolean;
  reason?: string;
  /** Fields to merge onto the user object before the JWT callback fires. */
  userFields?: {
    id: string;
    tokenVersion: number;
    emailVerified: Date;
    rememberMe: boolean;
    sessionId: string;
  };
}

// ── Provisioning ──────────────────────────────────────────────────────

/**
 * Provision or link a user on Google OAuth sign-in.
 *
 * Behaviour (byte-for-byte equivalent to the original signIn callback):
 *   1. Non-Google providers → allow: true (noop).
 *   2. Missing / unverified email → allow: false.
 *   3. Existing user by email → link accounts, set emailVerified.
 *   4. New user → create users + userSettings rows in a transaction.
 *   5. Upsert accounts link row.
 *   6. Return DB identity fields for the JWT callback to stash.
 */
export async function provisionUserOnSignIn(input: SignInInput): Promise<SignInDecision> {
  const { account, profile } = input;

  // Non-OAuth providers are handled by the Credentials authorize() path;
  // the signIn callback is a no-op for them.
  if (account?.provider !== 'google') return { allow: true };

  if (!profile?.email || profile.email_verified === false) {
    return { allow: false, reason: 'Google account email not verified' };
  }

  const email = String(profile.email).toLowerCase().trim();
  const db = getDb();

  // Find existing user by email (link accounts)
  const [existing] = await db
    .select({ id: schema.users.id, tokenVersion: schema.users.tokenVersion })
    .from(schema.users)
    .where(and(eq(schema.users.email, email), isNull(schema.users.deletedAt)))
    .limit(1);

  let userId = existing?.id;

  if (!userId) {
    // Create new OAuth user
    userId = crypto.randomUUID();
    const newUserId = userId; // narrow to string for the transaction closure
    await db.transaction(async (tx) => {
      const t = tx as unknown as typeof db;
      await t.insert(schema.users).values({
        id: newUserId,
        email,
        name: (profile.name ?? email) as string,
        image:
          (profile.picture as string) ??
          `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(String(profile.name ?? email))}`,
        emailVerified: new Date(),
        hashedPassword: null,
      });
      await t.insert(schema.userSettings).values({
        userId: newUserId,
        onboardingCompleted: false,
        defaultSymbol: 'XAUUSD',
      });
    });
  } else {
    // Ensure emailVerified is set for linked accounts
    await db
      .update(schema.users)
      .set({ emailVerified: new Date() })
      .where(eq(schema.users.id, userId));
  }

  // Upsert account link row
  await db
    .insert(schema.accounts)
    .values({
      userId,
      type: account.type as string,
      provider: 'google',
      providerAccountId: account.providerAccountId as string,
      access_token: (account.access_token as string) ?? null,
      refresh_token: (account.refresh_token as string) ?? null,
      expires_at: (account.expires_at as number) ?? null,
      token_type: (account.token_type as string) ?? null,
      scope: (account.scope as string) ?? null,
      id_token: (account.id_token as string) ?? null,
    })
    .onConflictDoNothing();

  // Stash canonical DB id + tokenVersion so JWT callback uses them
  return {
    allow: true,
    userFields: {
      id: userId,
      tokenVersion: existing?.tokenVersion ?? 0,
      emailVerified: new Date(),
      rememberMe: true, // OAuth users default to remembered
      sessionId: crypto.randomUUID(),
    },
  };
}
