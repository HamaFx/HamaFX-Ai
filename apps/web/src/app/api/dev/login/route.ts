import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { signIn } from '@/auth';
import { getDb, schema } from '@hamafx/db';
import { eq } from 'drizzle-orm';

export async function GET() {
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
      console.error('[dev-login] Created dev user in DB');
    }

    await signIn('credentials', { email, password: devPassword, redirect: false });
    console.error('[dev-login] signIn OK');
  } catch (e: unknown) {
    console.error('[dev-login] error:', e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }

  return NextResponse.redirect(new URL('/chat', process.env.NEXTAUTH_URL || 'https://hamafx-ai.vercel.app'));
}
