'use server';

import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { AuthError } from 'next-auth';
import { headers } from 'next/headers';
import { z } from 'zod';

import { getDb, schema, withRateLimit } from '@hamafx/db';
import { signIn } from '@/auth';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  next: z.string().optional(),
});

export async function loginAction(prevState: unknown, formData: FormData) {
  const raw = formData instanceof FormData ? Object.fromEntries(formData) : (formData ?? {});
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Validation failed' };
  }

  const { email, password, next } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  try {
    await signIn('credentials', {
      email: normalizedEmail,
      password,
      redirectTo: next && next.startsWith('/') ? next : '/chat',
    });
    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: 'Invalid email or password' };
    }
    return { error: `Error: ${String(error).slice(0, 200)}` };
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
  const raw = formData instanceof FormData ? Object.fromEntries(formData) : (formData ?? {});
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Validation failed' };
  }

  const { name, email, password } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  // INFRA-08: Rate limit registrations per IP — 5 per minute per IP.
  // This prevents automated account-creation spam.
  const headersList = await headers();
  const clientIp =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headersList.get('x-real-ip') ||
    'unknown';
  const rl = await withRateLimit(`register:${clientIp}`, 'register', 5);
  if (!rl.allowed) {
    return { error: 'Too many registration attempts. Please try again later.' };
  }

  const db = getDb();

  const existingUser = await db.select().from(schema.users).where(eq(schema.users.email, normalizedEmail)).limit(1);
  if (existingUser.length > 0) {
    return { error: 'An account with this email already exists' };
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUserId = crypto.randomUUID();

  // STAB-10: Wrap the users + userSettings insert in a single transaction
  // so a partial failure (e.g. userSettings FK violation) rolls back the user row.
  await db.transaction(async (tx) => {
    const [u] = await tx.insert(schema.users).values({
      id: newUserId,
      name,
      email: normalizedEmail,
      hashedPassword,
      image: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`,
    }).returning();

    if (!u) throw new Error('Failed to create user');

    await tx.insert(schema.userSettings).values({
      userId: u.id,
      onboardingCompleted: false,
      defaultSymbol: 'XAUUSD',
    });

    return [u];
  });

  try {
    await signIn('credentials', {
      email: normalizedEmail,
      password,
      redirectTo: '/onboarding',
    });
    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: 'Account created, but failed to automatically sign in' };
    }
    return { error: `Error: ${String(error).slice(0, 200)}` };
  }
}
