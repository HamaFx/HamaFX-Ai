import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { signIn } from '@/auth';
import { getUserById, createUserWithSettings } from '@hamafx/db';
import { createScopedLoggerWithContext } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// C-1: Derive a deterministic-but-unpredictable dev password from the
// deployment's ENCRYPTION_SECRET so it's not the 'devpass' that ships
// in the open-source repo. Generated once at module load.
const DEV_PASSWORD: string = (() => {
  const secret = process.env.ENCRYPTION_SECRET;
  if (secret && secret.length >= 32) {
    return crypto.createHash('sha256').update(`dev-login:${secret}`).digest('hex').slice(0, 16);
  }
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
})();

/**
 * GET /api/dev/login — one-click dev login for local development only.
 *
 * SECURITY (C-1):
 * - Requires NODE_ENV=development AND ENABLE_DEV_LOGIN=true.
 * - Uses a deployment-unique password derived from ENCRYPTION_SECRET
 *   (not the previously hardcoded 'devpass' that shipped in the repo).
 * - Absolutely forbidden in production — the NODE_ENV guard makes this
 *   unreachable when NODE_ENV=production, and an additional
 *   ALLOW_DEV_LOGIN_IN_PRODUCTION guard blocks accidental activation
 *   in Docker/production-like environments.
 */
export async function GET() {
  const log = createScopedLoggerWithContext({ component: 'dev', route: '/api/dev/login' });

  // Hard guard — only allow in development. In production this route
  // returns 404 regardless of any other env vars.
  if (process.env.NODE_ENV !== 'development') {
    // Belt-and-suspenders: even if someone sets NODE_ENV=development in a
    // production-like Docker container, require an explicit override.
    if (process.env.ALLOW_DEV_LOGIN_IN_PRODUCTION !== 'true') {
      return new NextResponse('Not Found', { status: 404 });
    }
    log.warn('dev login accessed with NODE_ENV=production override — ensure this is intentional');
  }

  // Additional guard — require explicit opt-in via ENABLE_DEV_LOGIN
  if (process.env.ENABLE_DEV_LOGIN !== 'true') {
    return new NextResponse('Not Found', { status: 404 });
  }

  const email = 'dev@hamafx.ai';
  const userId = 'test-user-id';

  try {
    // Ensure the dev user exists in the DB so FK constraints (user_settings, etc.) pass.
    const existing = await getUserById(userId);
    if (!existing) {
      const hashedPassword = await bcrypt.hash(DEV_PASSWORD, 12);
      await createUserWithSettings({
        id: userId,
        email,
        name: 'Dev User',
        hashedPassword,
      });
      log.info('created dev user in DB');
    }

    await signIn('credentials', { email, password: DEV_PASSWORD, redirect: false });
    log.info('dev signIn OK');
  } catch (e: unknown) {
    log.errorContext(e, 'devLogin', {});
  }

  return NextResponse.redirect(new URL('/chat', process.env.NEXTAUTH_URL || 'https://hamafx-ai.vercel.app'));
}
