import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { signIn } from '@/auth';
import { getDb, schema } from '@hamafx/db';
import { eq } from 'drizzle-orm';
import { createScopedLoggerWithContext } from '@/lib/logger';

export async function GET() {
  const log = createScopedLoggerWithContext({ component: 'dev', route: '/api/dev/login' });
  // Hard guard — only allow in development
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse('Not Found', { status: 404 });
  }

  // Additional guard — require explicit opt-in
  if (process.env.ENABLE_DEV_LOGIN !== 'true') {
    return new NextResponse('Not Found', { status: 404 });
  }

  const email = 'dev@hamafx.ai';
  const userId = 'test-user-id';
  const devPassword = 'devpass';

  try {
    // Ensure the dev user exists in the DB so FK constraints (user_settings, etc.) pass.
    const db = getDb();
    const [existing] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    if (!existing) {
      const hashedPassword = await bcrypt.hash(devPassword, 12);
      await db.insert(schema.users).values({
        id: userId,
        email,
        name: 'Dev User',
        hashedPassword,
      });
      log.info('created dev user in DB');
    }

    await signIn('credentials', { email, password: devPassword, redirect: false });
    log.info('dev signIn OK');
  } catch (e: unknown) {
    log.errorContext(e, 'devLogin', {});
  }

  return NextResponse.redirect(new URL('/chat', process.env.NEXTAUTH_URL || 'https://hamafx-ai.vercel.app'));
}
