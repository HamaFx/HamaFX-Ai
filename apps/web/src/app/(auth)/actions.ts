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
import { generateToken, hashToken } from '@/lib/auth-tokens';

const BCRYPT_COST = 12;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128; // P2-4: bcrypt truncates at 72 bytes, but 128 is a reasonable UX cap

/**
 * P2-7: Centralized redirect sanitizer. Blocks open redirects via
 * protocol-relative URLs, backslashes, and encoded // sequences.
 */
export async function sanitizeNext(next: string | undefined | null): Promise<string> {
  if (typeof next !== 'string' || next.length === 0) return '/chat';
  if (next.length > 500) return '/chat';
  if (!next.startsWith('/')) return '/chat';
  if (next.startsWith('//')) return '/chat';
  if (next.includes('\\')) return '/chat';
  if (/%2f/i.test(next) && /%2f.*%2f/i.test(next)) return '/chat';
  return next;
}

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

  // P2-7: Centralized redirect sanitizer
  const safeNext = sanitizeNext(next);

  // P0-4: Capture device info for session management
  const ua = headersList.get('user-agent')?.slice(0, 255) || undefined;

  try {
    await signIn('credentials', {
      email: normalizedEmail,
      password,
      totpCode: formData.get('totpCode') as string || undefined,
      rememberMe: formData.get('rememberMe') as string || undefined,
      deviceName: ua,
      ip: clientIp !== 'unknown' ? clientIp : undefined,
      redirectTo: safeNext,
    });
    // P1-1: Record login success ONLY after signIn resolves without throwing.
    recordAuthEvent('login_success');
    return { success: true };
  } catch (error) {
    const errStr = String(error);
    // P3-2: isRedirectError from next/navigation unavailable in this
    // Next.js version — fall back to string check for NEXT_REDIRECT.
    if (errStr.includes('NEXT_REDIRECT')) {
      recordAuthEvent('login_success');
      throw error;
    }
    if (error instanceof AuthError) {
      const message = error.message;
      if (message === 'ACCOUNT_LOCKED') {
        // recorded in authorize() — no duplicate
        return { error: 'Account temporarily locked due to too many failed attempts. Try again later.' };
      }
      if (message === '2FA_REQUIRED') {
        return { requires2FA: true, email: normalizedEmail };
      }
      if (message === 'INVALID_2FA_CODE') {
        // recorded in authorize() — no duplicate
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
    .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
    .max(PASSWORD_MAX, `Password must be at most ${PASSWORD_MAX} characters`)
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
    const { raw, hashed } = generateToken();
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await db.insert(schema.verificationTokens).values({
      identifier: normalizedEmail,
      token: hashed, // P0-6: store SHA-256 hash, not raw token
      purpose: 'email_verify',
      expires: verifyExpires,
    });
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(raw)}`;
    if (process.env.NODE_ENV !== 'production') {
      createScopedLoggerWithContext({ component: 'auth-actions', action: 'register-verification-token' }).info(
        `verify link: ${verifyUrl}`,
      );
    }
    // P0-5: Actually send the verification email
    await sendVerificationEmail(normalizedEmail, verifyUrl);
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
      rememberMe: 'true', // new registrations get remembered by default
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

/** P0-5: Send email verification link via Resend. */
async function sendVerificationEmail(to: string, verifyUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.ALERT_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    createScopedLoggerWithContext({ component: 'auth-actions', action: 'send-verify-email' }).warn(
      `RESEND_API_KEY or ALERT_FROM_EMAIL not set — logging verify link instead: ${verifyUrl}`,
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
        subject: '[HamaFX-Ai] Verify your email address',
        html: `<p>Welcome to HamaFX-Ai! Click the link below to verify your email address. This link expires in 24 hours.</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      createScopedLoggerWithContext({ component: 'auth-actions', action: 'send-verify-email' }).error(
        `Failed to send verify email: HTTP ${res.status} ${text.slice(0, 200)}`,
      );
    }
  } catch (err) {
    createScopedLoggerWithContext({ component: 'auth-actions', action: 'send-verify-email' }).error(
      'Failed to send verify email: ' + String(err),
    );
  }
}

export async function forgotPasswordAction(prevState: unknown, formData: FormData) {
  return Sentry.withServerActionInstrumentation('forgotPasswordAction', { formData }, async () => {
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
        const { raw, hashed } = generateToken();
        // P0-6: store SHA-256 hash with purpose discriminator
        await db.insert(schema.verificationTokens).values({
          identifier: email,
          token: hashed,
          purpose: 'password_reset',
          expires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        });
        // BUG-10: use a consistent localhost fallback to avoid sending prod URLs in non-prod envs
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(raw)}`;
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
  });
}

export async function resetPasswordAction(prevState: unknown, formData: FormData) {
  return Sentry.withServerActionInstrumentation('resetPasswordAction', { formData }, async () => {
    const raw = formData instanceof FormData ? Object.fromEntries(formData) : (formData ?? {});
    const token = typeof raw.token === 'string' ? raw.token : '';
    const password = typeof raw.password === 'string' ? raw.password : '';

    if (!token) return { error: 'Missing reset token' };

    // BUG-4: Rate limit reset attempts per client IP to prevent token enumeration / brute force.
    const headersList = await headers();
    const clientIp =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      headersList.get('x-real-ip') ||
      'unknown';
    const rl = await withRateLimit(`reset:${clientIp}`, 'reset_password', 5);
    if (!rl.allowed) {
      return { error: 'Too many reset attempts. Please try again later.' };
    }

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
    // P0-6: Hash the incoming raw token and filter by purpose
    const hashedToken = hashToken(token);
    const [vt] = await db.select()
      .from(schema.verificationTokens)
      .where(and(
        eq(schema.verificationTokens.token, hashedToken),
        eq(schema.verificationTokens.purpose, 'password_reset'),
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
        .where(and(
          eq(schema.verificationTokens.token, hashedToken),
          eq(schema.verificationTokens.purpose, 'password_reset'),
        ));
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
  });
}

/**
 * P0-5: Resend email verification link.
 * Rate-limited: 3 requests per email per 5 minutes.
 */
export async function resendVerificationAction(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return { error: 'Invalid email address' };
  }

  const rl = await withRateLimit(`resend-verify:${normalizedEmail}`, 'resend_verify', 3);
  if (!rl.allowed) {
    return { error: 'Too many requests. Please try again later.' };
  }

  const db = getDb();
  const [user] = await db
    .select({ id: schema.users.id, emailVerified: schema.users.emailVerified })
    .from(schema.users)
    .where(eq(schema.users.email, normalizedEmail))
    .limit(1);

  // Don't reveal whether the email exists or is already verified
  if (!user || user.emailVerified) {
    return { success: true, message: 'If the email is unverified, a new verification link has been sent.' };
  }

  try {
    const { raw, hashed } = generateToken();
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.insert(schema.verificationTokens).values({
      identifier: normalizedEmail,
      token: hashed,
      purpose: 'email_verify',
      expires: verifyExpires,
    });
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(raw)}`;
    if (process.env.NODE_ENV !== 'production') {
      createScopedLoggerWithContext({ component: 'auth-actions', action: 'resend-verify' }).info(
        `verify link: ${verifyUrl}`,
      );
    }
    await sendVerificationEmail(normalizedEmail, verifyUrl);
  } catch (err) {
    createScopedLoggerWithContext({ component: 'auth-actions', action: 'resend-verify' }).error(
      'Failed to resend verification: ' + String(err),
    );
  }

  return { success: true, message: 'If the email is unverified, a new verification link has been sent.' };
}
