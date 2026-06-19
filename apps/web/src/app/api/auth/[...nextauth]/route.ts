// NextAuth v5 API catch-all route handler.
// Handles: /api/auth/callback/*, /api/auth/signin, /api/auth/signout, /api/auth/session

import { handlers } from '@/auth';

export const { GET, POST } = handlers;