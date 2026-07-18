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

// Web-push sender using the `web-push` npm package (RFC 8030 / 8291 / 8292).
//
// Replaces the previous hand-rolled crypto implementation (ECDH, HKDF,
// AES-128-GCM, VAPID JWT signing, ASN.1 DER parsing) with the standard
// library maintained by the W3C Web Push working group.
//
// The public API is identical: `sendWebPush(sub, payload, env)` returns
// `{ ok, status, message }` so callers (alert delivery) don't need changes.

import webpush from 'web-push';

import type { PushSubscriptionRow } from './persistence';

export interface VapidEnv {
  VAPID_PUBLIC_KEY?: string | undefined;
  VAPID_PRIVATE_KEY?: string | undefined;
  VAPID_SUBJECT?: string | undefined;
}

export interface SendWebPushResult {
  ok: boolean;
  status: number;
  message?: string;
}

/**
 * Send a single web-push notification to one subscription endpoint.
 *
 * Returns the status code so the caller can decide between:
 *   - 2xx → markFired
 *   - 404 / 410 → drop the subscription, treat alert as fired
 *   - other non-2xx → leave the alert active so the next cron tick retries
 */
export async function sendWebPush(
  sub: PushSubscriptionRow,
  payload: string,
  env: VapidEnv,
): Promise<SendWebPushResult> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return { ok: false, status: 0, message: 'VAPID keys not configured' };
  }

  // Convert our flat subscription format to the format web-push expects.
  const subscription: webpush.PushSubscription = {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.p256dh,
      auth: sub.auth,
    },
  };

  try {
    const result = await webpush.sendNotification(
      subscription,
      payload,
      {
        TTL: 60,
        vapidDetails: {
          subject: env.VAPID_SUBJECT ?? 'mailto:owner@hamafx.local',
          publicKey: env.VAPID_PUBLIC_KEY,
          privateKey: env.VAPID_PRIVATE_KEY,
        },
      },
    );

    return {
      ok: true,
      status: result?.statusCode ?? 200,
    };
  } catch (err: unknown) {
    // web-push throws WebPushError on non-2xx responses.
    if (err && typeof err === 'object' && 'statusCode' in err) {
      const wpErr = err as { statusCode: number; body?: string; message?: string };
      return {
        ok: false,
        status: wpErr.statusCode,
        message: `push HTTP ${wpErr.statusCode}: ${(wpErr.body ?? wpErr.message ?? '').slice(0, 200)}`,
      };
    }

    // Network or other errors.
    const message = err instanceof Error ? err.message : 'fetch failed';
    return { ok: false, status: 0, message };
  }
}
