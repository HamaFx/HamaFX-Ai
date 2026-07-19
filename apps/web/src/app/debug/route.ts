import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Mask a DB connection URL so we can see the host/scheme but never the
 * credentials. e.g. `postgresql://user:pass@host:5432/db` →
 * `postgresql://***@host:5432/db`.
 */
function maskDbUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.username || u.password) {
      u.username = '***';
      u.password = '';
    }
    return u.toString();
  } catch {
    // Not a parseable URL — return only the scheme if present, else '(invalid)'
    const schemeMatch = /^([a-z][a-z0-9+\-.]*):\/\//i.exec(raw);
    return schemeMatch ? `${schemeMatch[1]}://(non-parseable)` : '(invalid)';
  }
}

export async function GET() {
  // M-1: Guard debug route — only available in development.
  // In production (including Docker self-hosted), this returns 404.
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not Found', { status: 404 });
  }
  // Additional guard for Docker/prod-like environments that have
  // NODE_ENV=development accidentally set.
  if (process.env.ALLOW_DEBUG_IN_PRODUCTION !== 'true' && process.env.NODE_ENV !== 'development') {
    return new NextResponse('Not Found', { status: 404 });
  }
  const env: Record<string, unknown> = {
    DATABASE_URL_type: typeof process.env.DATABASE_URL,
    POSTGRES_URL_type: typeof process.env.POSTGRES_URL,
    DATABASE_URL_set: !!process.env.DATABASE_URL,
    POSTGRES_URL_set: !!process.env.POSTGRES_URL,
  };

  if (process.env.DATABASE_URL) {
    env.DATABASE_URL_length = process.env.DATABASE_URL.length;
    env.DATABASE_URL_masked = maskDbUrl(process.env.DATABASE_URL);
  }
  if (process.env.POSTGRES_URL) {
    env.POSTGRES_URL_length = process.env.POSTGRES_URL.length;
    env.POSTGRES_URL_masked = maskDbUrl(process.env.POSTGRES_URL);
  }

  const result: Record<string, unknown> = { env };

  try {
    const { getDb } = await import('@hamafx/db');
    const db = getDb();
    result.getDb_success = true;

    // Try an actual query to see if the connection works
    const { sql } = await import('drizzle-orm');
    const testResult = await db.execute(sql`SELECT 1 AS ok`);
    result.query_success = true;
    result.query_result = String(testResult).substring(0, 500);
  } catch (e) {
    result.getDb_error = String(e).substring(0, 1000);
    if (e instanceof Error) {
      result.getDb_error_name = e.name;
      result.getDb_error_message = e.message.substring(0, 500);
      result.getDb_error_stack = (e.stack || '').substring(0, 1000);
    }
  }

  // Test auth module loading
  try {
    const { auth } = await import('@/auth');
    result.auth_loaded = true;
    result.auth_type = typeof auth;
  } catch (e) {
    result.auth_error = String(e).substring(0, 500);
  }

  // Test DrizzleAdapter
  let adapterLoaded = false;
  try {
    await import('@auth/drizzle-adapter');
    adapterLoaded = true;
  } catch (e) {
    result.adapter_error = String(e).substring(0, 500);
  }
  result.adapter_loaded = adapterLoaded;

  // Test NextAuth full initialization
  if (adapterLoaded) {
    try {
      const NextAuth = (await import('next-auth')).default;
      const { authConfig } = await import('@/auth.config');
      const { getDb } = await import('@hamafx/db');
      const { DrizzleAdapter } = await import('@auth/drizzle-adapter');
      const adapter = DrizzleAdapter(getDb());
      result.adapter_created = true;
      const test = NextAuth({ ...authConfig, adapter, providers: [] });
      result.nextauth_created = true;
      result.nextauth_keys = Object.keys(test).join(', ');
    } catch (e) {
      result.nextauth_error = String(e).substring(0, 500);
    }
  }

  return NextResponse.json(result);
}
