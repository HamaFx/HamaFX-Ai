'use server';

console.error('[hamafx] actions.ts loaded, PID:', process.pid);

import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { AuthError } from 'next-auth';
import { z } from 'zod';

import { getDb, schema } from '@hamafx/db';
import { signIn } from '@/auth';

console.error('[hamafx] actions.ts imports done');

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  next: z.string().optional(),
});

export async function loginAction(prevState: unknown, formData: FormData) {
  console.error('[hamafx] loginAction called');
  const raw = formData instanceof FormData ? Object.fromEntries(formData) : (formData ?? {});
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Validation failed' };
  }

  const { email, password, next } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  try {
    console.error('[hamafx] loginAction calling signIn');
    await signIn('credentials', {
      email: normalizedEmail,
      password,
      redirectTo: next && next.startsWith('/') ? next : '/chat',
    });
    return { success: true };
  } catch (error) {
    console.error('[hamafx] loginAction caught error:', typeof error, error?.constructor?.name);
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
  console.error('[hamafx] registerAction called');
  const raw = formData instanceof FormData ? Object.fromEntries(formData) : (formData ?? {});
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Validation failed' };
  }

  const { name, email, password } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();
  const db = getDb();

  const existingUser = await db.select().from(schema.users).where(eq(schema.users.email, normalizedEmail)).limit(1);
  if (existingUser.length > 0) {
    return { error: 'An account with this email already exists' };
  }

  const hashedPassword = await bcrypt.hash(password, 10);

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

  await db.insert(schema.userSettings).values({
    userId: newUser.id,
    onboardingCompleted: false,
    defaultSymbol: 'XAUUSD',
  });

  try {
    console.error('[hamafx] registerAction calling signIn');
    await signIn('credentials', {
      email: normalizedEmail,
      password,
      redirectTo: '/onboarding',
    });
    return { success: true };
  } catch (error) {
    console.error('[hamafx] registerAction caught error:', typeof error, error?.constructor?.name);
    if (error instanceof AuthError) {
      return { error: 'Account created, but failed to automatically sign in' };
    }
    return { error: `Error: ${String(error).slice(0, 200)}` };
  }
}
