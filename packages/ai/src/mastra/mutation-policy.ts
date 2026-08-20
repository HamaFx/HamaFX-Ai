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
      reason: 'disabled' | 'confirmation-required' | 'invalid-context';
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

export function assertMastraMutationAllowed(request: MastraMutationRequest): void {
  const decision = evaluateMastraMutation(request);
  if (decision.allowed) return;

  const error = new Error(
    decision.reason === 'disabled'
      ? 'Mastra mutations are disabled by policy.'
      : decision.reason === 'confirmation-required'
        ? 'Mastra mutation requires explicit server-side confirmation.'
        : 'Mastra mutation context is invalid.',
  );
  error.name = 'MastraMutationPolicyError';
  Object.assign(error, {
    code: `MASTRA_MUTATION_${decision.reason.toUpperCase().replaceAll('-', '_')}`,
  });
  throw error;
}
