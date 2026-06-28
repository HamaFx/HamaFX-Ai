import { NextResponse } from 'next/server';
import { and, eq, gt } from 'drizzle-orm';
import { getDb, schema } from '@hamafx/db';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const db = getDb();
  const [vt] = await db.select()
    .from(schema.verificationTokens)
    .where(and(
      eq(schema.verificationTokens.token, token),
      gt(schema.verificationTokens.expires, new Date()),
    ))
    .limit(1);

  if (!vt) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 });
  }

  await db.update(schema.users)
    .set({ emailVerified: new Date() })
    .where(eq(schema.users.email, vt.identifier));

  await db.delete(schema.verificationTokens)
    .where(eq(schema.verificationTokens.token, token));

  return NextResponse.redirect(new URL('/login?verified=true', req.url));
}
