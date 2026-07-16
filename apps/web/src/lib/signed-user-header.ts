/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// SEC-1: Signed x-user-id header to prevent impersonation.
//
// middleware.ts (Edge) signs the userId + requestId with HMAC-SHA256.
// getUserFromRequest() (Node.js route handler) verifies the signature
// before trusting the header.
//
// The secret is NEXTAUTH_SECRET / AUTH_SECRET — the same key used by
// NextAuth.js for JWT signing. No new secret required.
//
// NOTE: This file is imported by BOTH middleware (Edge runtime) and
// route handlers (Node.js runtime). Only Edge-safe APIs (Web Crypto,
// process.env) are used here. The Node.js HMAC verification is done
// inline in api.ts to keep the Edge bundle clean.

export const USER_ID_HEADER = 'x-user-id';
export const USER_ID_SIG_HEADER = 'x-user-id-sig';

/**
 * Sign a userId + requestId pair using HMAC-SHA256.
 *
 * Designed for the Edge runtime (Web Crypto API) so middleware can use it.
 * Uses NEXTAUTH_SECRET (or AUTH_SECRET) as the signing key.
 */
export async function signUserId(
  userId: string,
  requestId: string,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret.slice(0, 128)); // keep key material bounded
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const data = encoder.encode(`${userId}.${requestId}`);
  const sig = await crypto.subtle.sign('HMAC', key, data);
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Read the signing secret from process.env.
 * Returns undefined when neither AUTH_SECRET nor NEXTAUTH_SECRET is set.
 */
export function getSigningSecret(): string | undefined {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) return undefined;
  return secret;
}
