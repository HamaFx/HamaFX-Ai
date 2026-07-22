import { NextResponse } from 'next/server';
import { findVerificationToken, deleteVerificationToken, verifyUserEmail } from '@hamafx/db';
import { AppError } from '@hamafx/shared';
import { errorResponse } from '@/lib/api';
import { hashToken } from '@/lib/auth-tokens';

/**
 * GET /api/auth/verify-email?token=...
 * Verifies a user's email address. Only accepts tokens with
 * purpose='email_verify' (P0-6 — prevents cross-flow replay).
 * Single-use: deletes the token on successful verification.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rawToken = url.searchParams.get('token');
    if (!rawToken) {
      return errorResponse(new AppError('VALIDATION', 'Missing token', 400), req);
    }

    // P0-6: Hash the incoming raw token and filter by purpose
    const hashedToken = hashToken(rawToken);

    const vt = await findVerificationToken(hashedToken, 'email_verify');

    if (!vt) {
      return errorResponse(new AppError('VALIDATION', 'Invalid or expired token', 400), req);
    }    await verifyUserEmail(vt.identifier);

    // Single-use: delete after consumption (defense-in-depth: filter by purpose too)
    await deleteVerificationToken(hashedToken, 'email_verify');

    return NextResponse.redirect(new URL('/login?verified=true', req.url));
  } catch (err) {
    return errorResponse(err, req);
  }
}
