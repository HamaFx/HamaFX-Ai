// SPDX-License-Identifier: Apache-2.0

import { cache } from 'react';
import { getAdminUser } from './admin-auth';

/**
 * Lightweight admin check for server components.
 * Delegates to the canonical `getAdminUser` in admin-auth.ts.
 */
export const checkIsAdmin = cache(async (): Promise<boolean> => {
  const { admin } = await getAdminUser();
  return admin !== null;
});
