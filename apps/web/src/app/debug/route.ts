import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const env: Record<string, unknown> = {
    DATABASE_URL_type: typeof process.env.DATABASE_URL,
    POSTGRES_URL_type: typeof process.env.POSTGRES_URL,
    DATABASE_URL_set: !!process.env.DATABASE_URL,
    POSTGRES_URL_set: !!process.env.POSTGRES_URL,
  };

  if (process.env.DATABASE_URL) {
    env.DATABASE_URL_length = process.env.DATABASE_URL.length;
    env.DATABASE_URL_prefix = process.env.DATABASE_URL.substring(0, 20);
  }
  if (process.env.POSTGRES_URL) {
    env.POSTGRES_URL_length = process.env.POSTGRES_URL.length;
    env.POSTGRES_URL_prefix = process.env.POSTGRES_URL.substring(0, 20);
  }

  const result: Record<string, unknown> = { env };

  try {
    const { getDb } = await import('@hamafx/db');
    const _db = getDb();
    result.getDb_success = true;
  } catch (e) {
    result.getDb_error = String(e).substring(0, 500);
  }

  return NextResponse.json(result);
}
