'use server';

import * as Sentry from '@sentry/nextjs';
import bcrypt from 'bcryptjs';
import { and, eq, gt, sql } from 'drizzle-orm';
import { AuthError } from 'next-auth';
import { headers } from 'next/headers';
import { z } from 'zod';

import { getDb, schema, withRateLimit } from '@hamafx/db';
import { signIn } from '@/auth';
import { createScopedLoggerWithContext } from '@/lib/logger';
import { recordAuthEvent } from '@/lib/auth-anomaly';

const BCRYPT_COST = 12;

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  next: z.string().optional(),
});

export async function loginAction(prevState: unknown, formData: FormData) {
  return Sentry.withServerActionInstrumentation('loginAction', { formData }, async () => {
  const raw = formData instanceof FormData ? Object.fromEntries(formData) : (formData ?? {});
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Validation failed' };
  }

  const { email, password, next } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  // HIGH-02: Rate limit login attempts
  const headersList = await headers();
  const clientIp =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headersList.get('x-real-ip') ||
    'unknown';
  const rl = await withRateLimit(`login:${clientIp}`, 'login', 10);
  if (!rl.allowed) {
    return { error: 'Too many login attempts. Please try again later.' };
  }

  const rlEmail = await withRateLimit(`login-email:${normalizedEmail}`, 'login_email', 5);
  if (!rlEmail.allowed) {
    return { error: 'Too many login attempts for this email. Please try again later.' };
  }

  // MED-01: Prevent open redirect via protocol-relative URLs
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/chat';

  try {
    recordAuthEvent('login_success');
    await signIn('credentials', {
      email: normalizedEmail,
      password,
      totpCode: formData.get('totpCode') as string || undefined,
      rememberMe: formData.get('rememberMe') as string || undefined,
      redirectTo: safeNext,
    });
    return { success: true };
  } catch (error) {
    const errStr = String(error);
    if (errStr.includes('NEXT_REDIRECT')) throw error;
    if (error instanceof AuthError) {
      const message = error.message;
      if (message === 'ACCOUNT_LOCKED') {
        recordAuthEvent('account_locked');
        return { error: 'Account temporarily locked due to too many failed attempts. Try again later.' };
      }
      if (message === '2FA_REQUIRED') {
        return { requires2FA: true, email: normalizedEmail };
      }
      if (message === 'INVALID_2FA_CODE') {
        recordAuthEvent('2fa_failure');
        return { error: 'Invalid 2FA code', requires2FA: true };
      }
      recordAuthEvent('login_failure');
      return { error: 'Invalid email or password' };
    }
    Sentry.captureException(error, {
      tags: { component: 'auth-actions', action: 'login' },
      extra: { email: normalizedEmail },
    });
    return { error: 'Unable to sign in right now. Please try again.' };
  }
  });
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
  return Sentry.withServerActionInstrumentation('registerAction', { formData }, async () => {
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

  const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);
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

  // HIGH-04: Generate email verification token
  try {
    const { randomBytes } = await import('node:crypto');
    const verifyToken = randomBytes(32).toString('hex');
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await db.insert(schema.verificationTokens).values({
      identifier: normalizedEmail,
      token: verifyToken,
      expires: verifyExpires,
    });
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    if (process.env.NODE_ENV !== 'production') {
      createScopedLoggerWithContext({ component: 'auth-actions', action: 'register-verification-token' }).info(
        `verify link: ${baseUrl}/api/auth/verify-email?token=${verifyToken}`,
      );
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags: { component: 'auth-actions', action: 'register-verification-token' },
      extra: { email: normalizedEmail },
    });
    createScopedLoggerWithContext({ component: 'auth-actions', action: 'register-verification-token' }).errorContext(
      err,
      'createVerificationToken',
      { email: normalizedEmail },
    );
  }

  try {
    await signIn('credentials', {
      email: normalizedEmail,
      password,
      redirectTo: '/onboarding',
    });
    return { success: true };
  } catch (error) {
    const errStr = String(error);
    if (errStr.includes('NEXT_REDIRECT')) throw error;
    if (error instanceof AuthError) {
      return { error: 'Account created, but failed to automatically sign in' };
    }
    Sentry.captureException(error, {
      tags: { component: 'auth-actions', action: 'register' },
      extra: { email: normalizedEmail },
    });
    return { error: 'Unable to finish registration right now. Please try again.' };
  }
  });
}

// HIGH-05: Password reset flow

async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.ALERT_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    createScopedLoggerWithContext({ component: 'auth-actions', action: 'send-reset-email' }).warn(
      `RESEND_API_KEY or ALERT_FROM_EMAIL not set — logging reset link instead: ${resetUrl}`,
    );
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject: '[HamaFX-Ai] Reset your password',
        html: `<p>Click the link below to reset your password. This link expires in 1 hour.</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      createScopedLoggerWithContext({ component: 'auth-actions', action: 'send-reset-email' }).error(
        `Failed to send reset email: HTTP ${res.status} ${text.slice(0, 200)}`,
      );
    }
  } catch (err) {
    createScopedLoggerWithContext({ component: 'auth-actions', action: 'send-reset-email' }).error(
      'Failed to send reset email: ' + String(err),
    );
  }
}

export async function forgotPasswordAction(prevState: unknown, formData: FormData) {
  const raw = formData instanceof FormData ? Object.fromEntries(formData) : (formData ?? {});
  const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : '';
  if (!email) return { error: 'Email is required' };

  const rl = await withRateLimit(`forgot:${email}`, 'forgot_password', 3);
  if (!rl.allowed) return { error: 'Too many requests. Try again later.' };

  const db = getDb();
  const [user] = await db.select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  // Don't reveal whether the email exists
  if (user) {
    try {
      const { randomBytes } = await import('node:crypto');
      const resetToken = randomBytes(32).toString('hex');
      await db.insert(schema.verificationTokens).values({
        identifier: email,
        token: resetToken,
        expires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      });
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hamafx-ai.vercel.app';
      const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
      if (process.env.NODE_ENV !== 'production') {
        createScopedLoggerWithContext({ component: 'auth-actions', action: 'forgot-password' }).info(
          `reset link: ${resetUrl}`,
        );
      }
      await sendPasswordResetEmail(email, resetUrl);
    } catch (err) {
      createScopedLoggerWithContext({ component: 'auth-actions', action: 'forgot-password' }).error(
        'Failed to create reset token: ' + String(err),
      );
    }
  }

  return { success: true, message: 'If an account exists, a reset link has been sent.' };
}

export async function resetPasswordAction(prevState: unknown, formData: FormData) {
  const raw = formData instanceof FormData ? Object.fromEntries(formData) : (formData ?? {});
  const token = typeof raw.token === 'string' ? raw.token : '';
  const password = typeof raw.password === 'string' ? raw.password : '';

  if (!token) return { error: 'Missing reset token' };

  const parsed = z.object({
    password: z.string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
  }).safeParse({ password });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Invalid password' };
  }

  const db = getDb();
  const [vt] = await db.select()
    .from(schema.verificationTokens)
    .where(and(
      eq(schema.verificationTokens.token, token),
      gt(schema.verificationTokens.expires, new Date()),
    ))
    .limit(1);

  if (!vt) return { error: 'Invalid or expired reset link' };

  const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);

  let userId: string | null = null;
  await db.transaction(async (tx) => {
    const [u] = await tx.update(schema.users)
      .set({ hashedPassword, tokenVersion: sql`${schema.users.tokenVersion} + 1` })
      .where(eq(schema.users.email, vt.identifier))
      .returning({ id: schema.users.id });
    if (u) userId = u.id;
    await tx.delete(schema.verificationTokens)
      .where(eq(schema.verificationTokens.token, token));
  });

  // FEAT-03: Audit log for password reset
  if (userId) {
    try {
      await db.insert(schema.auditLogs).values({
        userId,
        action: 'password_reset',
        metadata: {},
      });
    } catch { /* fail open */ }
  }

  return { success: true, message: 'Password has been reset. You can now sign in.' };
}
