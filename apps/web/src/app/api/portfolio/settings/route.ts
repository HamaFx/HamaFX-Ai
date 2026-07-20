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

// PF-22 — /api/portfolio/settings — get / update settings (thin controller).

import { errorResponse, withAuth } from '@/lib/api';
import { getPortfolioSettingsService, savePortfolioSettingsService, PortfolioUpdateSettingsSchema } from '@/lib/services/portfolio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const result = await getPortfolioSettingsService(user.userId);
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
});

export const PUT = withAuth<void>(async (req, { user }) => {
  try {
    const body = await req.json();
    const input = PortfolioUpdateSettingsSchema.parse(body);
    const result = await savePortfolioSettingsService(user.userId, input);
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
});