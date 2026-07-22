// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

// L-5: Minimum password length of 10 (NIST SP 800-63B recommends 8 as
// absolute minimum; 10 provides additional brute-force resistance).
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128; // P2-4: bcrypt truncates at 72 bytes, but 128 is a reasonable UX cap

/**
 * Shared password schema used by registration and password reset flows.
 * Centralizing this prevents the register/reset drift described in the
 * frontend audit.
 */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `Password must be at most ${PASSWORD_MAX} characters`)
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');
