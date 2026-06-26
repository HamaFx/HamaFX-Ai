'use server';

console.log('[hamafx] actions.ts loaded, PID:', process.pid);

import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { AuthError } from 'next-auth';
import { z } from 'zod';

import { getDb, schema } from '@hamafx/db';
import { signIn } from '@/auth';

console.log('[hamafx] actions.ts imports done');

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  next: z.string().optional(),
});

export async function loginAction(prevState: unknown, formData: FormData) {
  console.log('[hamafx] loginAction called');
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Validation failed' };
  }

  const { email, password, next } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  console.log('[hamafx] loginAction calling signIn');
  try {
    await signIn('credentials', {
      email: normalizedEmail,
      password,
      redirectTo: next && next.startsWith('/') ? next : '/chat',
    });
    console.log('[hamafx] loginAction signIn returned (no redirect)');
    return { success: true };
  } catch (error) {
    console.log('[hamafx] loginAction caught error:', typeof error, error?.constructor?.name, String(error).slice(0, 200));
    if (error instanceof AuthError) {
      return { error: 'Invalid email or password' };
    }
    return { error: `Error: ${String(error).slice(0, 200)}` };
  }
}
