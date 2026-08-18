// SPDX-License-Identifier: Apache-2.0

import 'server-only';

import { consumeUIMessageStream, waitUntil } from '@kestrel/ai';

import { runMastraShadowComparison, type MastraShadowComparison } from './mastra-shadow-comparison';

export interface MastraShadowStreamInput {
  userId: string;
  threadId: string;
  prompt: string;
}

/**
 * Tee a completed legacy chat response. One branch goes immediately to the
 * client; the other is consumed by the bounded shadow job. The response body
 * and headers remain unchanged from the legacy route.
 */
export function attachMastraShadowToResponse(
  response: Response,
  input: MastraShadowStreamInput,
  onComparison?: (comparison: MastraShadowComparison | null) => void,
): Response {
  if (!response.body) return response;

  const [clientBody, shadowBody] = response.body.tee();
  const shadowResponse = new Response(shadowBody, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });

  waitUntil(
    consumeUIMessageStream(shadowResponse)
      .then((legacy) => runMastraShadowComparison({
        ...input,
        legacyText: legacy.text,
      }))
      .then((comparison) => {
        onComparison?.(comparison);
      })
      .catch(() => {
        // The shadow path is deliberately best effort. The comparison service
        // records execution failures; stream parsing failures must also never
        // affect the user's already-running legacy response.
        onComparison?.(null);
      }),
  );

  return new Response(clientBody, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
