import { NextResponse } from 'next/server';
import { signIn } from '@/auth';
import { getDb, schema } from '@hamafx/db';
import { eq } from 'drizzle-orm';

export async function GET() {
  const email = 'dev@hamafx.ai';
  const userId = 'test-user-id';

  try {
    // Ensure the dev user exists in the DB so FK constraints (user_settings, etc.) pass.
    const db = getDb();
    const [existing] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    if (!existing) {
      await db.insert(schema.users).values({
        id: userId,
        email,
        name: 'Dev User',
      });
      console.error('[dev-login] Created dev user in DB');
    }

    await signIn('credentials', { email, password: 'devpass', redirect: false });
    console.error('[dev-login] signIn OK');
  } catch (e: unknown) {
    console.error('[dev-login] error:', e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }

  return NextResponse.redirect(new URL('/chat', process.env.NEXTAUTH_URL || 'https://hamafx-ai.vercel.app'));
}
