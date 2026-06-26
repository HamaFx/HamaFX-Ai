'use server';

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

import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { AuthError } from 'next-auth';
import { z } from 'zod';

import { getDb, schema } from '@hamafx/db';
import { signIn } from '@/auth';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  next: z.string().optional(),
});

export async function loginAction(prevState: unknown, formData: FormData) {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Validation failed' };
  }

  const { email, password, next } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  try {
    console.error('[diag] loginAction: calling signIn');
    await signIn('credentials', {
      email: normalizedEmail,
      password,
      redirectTo: next && next.startsWith('/') ? next : '/chat',
    });
    console.error('[diag] loginAction: signIn returned (no redirect)');
    return { success: true };
    } catch (error) {
    const errMsg = String(error);
    const errName = error?.constructor?.name ?? 'unknown';
    console.error('[diag] loginAction caught:', errName, errMsg);
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return { error: 'Invalid email or password' };
        default:
          return { error: 'An error occurred during sign in' };
      }
    }
    // NEXT_REDIRECT is expected — let it propagate
    if (errName === 'NEXT_REDIRECT') throw error;
    // Otherwise return a diagnostic message
    return { error: `Server error (${errName}): ${errMsg.slice(0, 200)}` };
  }
  }
}

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

export async function registerAction(prevState: unknown, formData: FormData) {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Validation failed' };
  }

  const { name, email, password } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();
  const db = getDb();
  
  // Check if user exists
  const existingUser = await db.select().from(schema.users).where(eq(schema.users.email, normalizedEmail)).limit(1);
  if (existingUser.length > 0) {
    return { error: 'An account with this email already exists' };
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Insert user
  const [newUser] = await db.insert(schema.users).values({
    id: crypto.randomUUID(),
    name,
    email: normalizedEmail,
    hashedPassword,
    image: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`,
  }).returning();

  if (!newUser) {
    return { error: 'Failed to create user' };
  }

  // Create default user settings (required for onboarding flow)
  await db.insert(schema.userSettings).values({
    userId: newUser.id,
    onboardingCompleted: false,
    defaultSymbol: 'XAUUSD',
  });

  // Login the newly registered user
  try {
    await signIn('credentials', {
      email: normalizedEmail,
      password,
      redirectTo: '/onboarding',
    });
    return { success: true };
  } catch (error) {
    const errMsg = String(error);
    const errName = error?.constructor?.name ?? 'unknown';
    console.error('[diag] registerAction caught:', errName, errMsg);
    if (error instanceof AuthError) {
      return { error: 'Account created, but failed to automatically sign in' };
    }
    if (errName === 'NEXT_REDIRECT') throw error;
    return { error: `Server error (${errName}): ${errMsg.slice(0, 200)}` };
  }
}
