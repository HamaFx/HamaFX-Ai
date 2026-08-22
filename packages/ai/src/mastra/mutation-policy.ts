import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const MastraMutationNameSchema = z.enum([
  'set_alert',
  'log_journal',
  'share_snapshot',
  'run_system_action',
]);

export type MastraMutationName = z.infer<typeof MastraMutationNameSchema>;

export interface MastraMutationRequest {
  mutation: MastraMutationName;
  userId: string;
  threadId: string;
  /** Set only by a server-side approval flow after validating the user action. */
  confirmed: boolean;
  /** Optional opaque approval id for audit correlation. */
  approvalId?: string;
}

export type MastraMutationDecision =
  | { allowed: true; mutation: MastraMutationName }
  | {
      allowed: false;
      mutation: MastraMutationName;
      reason: 'disabled' | 'confirmation-required' | 'invalid-context' | 'token-expired' | 'token-invalid';
    };

/**
 * Mastra writes are deliberately separate from the legacy AI SDK tools.
 * The flag is false unless an operator explicitly enables it, and the
 * request must carry a server-issued confirmation decision as well.
 */
export function evaluateMastraMutation(request: MastraMutationRequest): MastraMutationDecision {
  if (!request.userId || !request.threadId) {
    return { allowed: false, mutation: request.mutation, reason: 'invalid-context' };
  }
  if (process.env.ENABLE_MASTRA_MUTATIONS !== 'true') {
    return { allowed: false, mutation: request.mutation, reason: 'disabled' };
  }
  if (!request.confirmed) {
    return {
      allowed: false,
      mutation: request.mutation,
      reason: 'confirmation-required',
    };
  }
  return { allowed: true, mutation: request.mutation };
}

/**
 * Draft-time gate: a mutation may only begin its confirmation flow when the
 * feature is enabled and the context is valid. Confirmation is intentionally
 * NOT required here — the draft is the start of the confirmation flow.
 */
export function assertMastraMutationDraftAllowed(request: {
  mutation: MastraMutationName;
  userId: string;
  threadId: string;
}): void {
  if (!request.userId || !request.threadId) {
    throw mutationPolicyError('invalid-context');
  }
  if (process.env.ENABLE_MASTRA_MUTATIONS !== 'true') {
    throw mutationPolicyError('disabled');
  }
}

export function assertMastraMutationAllowed(request: MastraMutationRequest): void {
  const decision = evaluateMastraMutation(request);
  if (decision.allowed) return;

  if (!decision.allowed) {
    throw mutationPolicyError(decision.reason);
  }
}

function mutationPolicyError(
  reason: Extract<MastraMutationDecision, { allowed: false }>['reason'] | 'token-expired' | 'token-invalid',
): Error {
  const error = new Error(
    reason === 'disabled'
      ? 'Mastra mutations are disabled by policy.'
      : reason === 'confirmation-required'
        ? 'Mastra mutation requires explicit server-side confirmation.'
        : reason === 'token-expired'
          ? 'Mastra mutation confirmation token has expired.'
          : reason === 'token-invalid'
            ? 'Mastra mutation confirmation token is invalid.'
            : 'Mastra mutation context is invalid.',
  );
  error.name = 'MastraMutationPolicyError';
  Object.assign(error, {
    code: `MASTRA_MUTATION_${reason.toUpperCase().replaceAll('-', '_')}`,
  });
  return error;
}

// ---------------------------------------------------------------------------
// Phase 7 — stateful confirmation tokens.
//
// The workflow issues a single-use, expiring confirmation token at the draft
// step and stores only its HMAC in the persisted run state. The resume step
// verifies the presented token against the stored digest (timing-safe) and
// its expiry before any write executes. Single-use is enforced by the
// workflow run itself: a resumed run leaves the suspended state, so the same
// run cannot be resumed twice with the same token.
// ---------------------------------------------------------------------------

export const MUTATION_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes default

/** Raw token handed to the client (random, high-entropy). */
export interface MutationConfirmationToken {
  token: string;
  expiresAt: number;
}

/** What the workflow persists in run state — never the raw token. */
export interface StoredMutationConfirmation {
  digest: string;
  expiresAt: number;
}

export interface IssueConfirmationTokenOptions {
  mutation: MastraMutationName;
  userId: string;
  /** HMAC secret. Defaults to `AUTH_COOKIE_SECRET` from env. */
  secret?: string;
  ttlMs?: number;
  now?: number;
}

export function issueMutationConfirmationToken(
  options: IssueConfirmationTokenOptions,
): MutationConfirmationToken {
  // Ensures the secret is configured (throws in production when absent).
  confirmationSecret(options.secret);
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? MUTATION_TOKEN_TTL_MS;
  const token = randomBytes(32).toString('base64url');
  return { token, expiresAt: now + ttlMs };
}

/** Compute the persisted digest for a token (store this, not the token). */
export function storedConfirmationForToken(
  token: string,
  options: Omit<IssueConfirmationTokenOptions, 'ttlMs' | 'now'> & { expiresAt: number },
): StoredMutationConfirmation {
  const secret = confirmationSecret(options.secret);
  return {
    digest: hmacDigest(secret, `${token}:${options.mutation}:${options.userId}:${options.expiresAt}`),
    expiresAt: options.expiresAt,
  };
}

export interface VerifyConfirmationTokenOptions {
  /** Raw token presented by the client on resume. */
  token: string;
  /** Digest + expiry persisted in run state by the draft step. */
  stored: StoredMutationConfirmation;
  mutation: MastraMutationName;
  userId: string;
  secret?: string;
  now?: number;
}

/**
 * Timing-safe verification of a presented confirmation token against the
 * stored digest + expiry. Returns false for any mismatch (never throws), so
 * the resume step fails closed on replay, expiry, or cross-run token reuse.
 */
export function verifyMutationConfirmationToken(
  options: VerifyConfirmationTokenOptions,
): boolean {
  const secret = confirmationSecret(options.secret);
  const now = options.now ?? Date.now();
  if (now > options.stored.expiresAt) return false;
  const expected = hmacDigest(
    secret,
    `${options.token}:${options.mutation}:${options.userId}:${options.stored.expiresAt}`,
  );
  return timingSafeEqualHex(expected, options.stored.digest);
}

export function confirmationSecret(explicit?: string): string {
  const secret = explicit ?? process.env.AUTH_COOKIE_SECRET ?? '';
  if (secret.length < 32) {
    // Fail closed: without a strong secret, confirmation tokens cannot be
    // issued. (Dev/test callers may pass an explicit secret.)
    if (process.env.NODE_ENV !== 'production' && explicit) return explicit;
    throw new Error(
      'AUTH_COOKIE_SECRET (>= 32 chars) is required for mutation confirmation tokens.',
    );
  }
  return secret;
}

function hmacDigest(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value, 'utf8').digest('hex');
}

/** Constant-time hex comparison (both sides hex-decoded). */
function timingSafeEqualHex(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'hex');
  const bBuf = Buffer.from(b, 'hex');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
