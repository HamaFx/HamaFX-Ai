// SPDX-License-Identifier: Apache-2.0

// Phase 3 hardening §7 — thin Supabase Storage client for chat image
// uploads.
//
// We talk to the storage REST API directly instead of pulling in
// `@supabase/supabase-js` because:
//
//   - The SDK is large; we only need two operations (PUT object,
//     signed-URL).
//   - We already have `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in
//     the server env. No additional config needed.
//   - The web bundle stays Edge-friendly for any future migration.
//
// The bucket (`CHAT_IMAGES_BUCKET`) must exist in Supabase Storage and
// be marked PUBLIC. We never expose the service-role key to the
// browser; the only thing the client gets back is the public URL.
//
// Cleanup is the operator's responsibility — set up a bucket-level
// `expiry` policy in Supabase or run a small "delete blobs > 7 days"
// cron from the worker. The metadata header on each upload encodes
// the upload epoch so a sweeping job can filter cheaply.

const CHAT_IMAGES_BUCKET = 'chat-images';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // mirrors composer-side cap

export interface ChatImageUploadEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export interface ChatImageUploadResult {
  /** Public URL the chat composer hands to the model. */
  url: string;
  /** Storage path inside the bucket — useful for delete operations. */
  path: string;
  /** Detected mime-type, mirrors what the model needs in `mediaType`. */
  mediaType: string;
  /** ms epoch UTC of the upload — surfaced for the cleanup cron. */
  uploadedAt: number;
}

export interface ChatImageUploadInput {
  userId: string;
  /**
   * Raw bytes. Caller is expected to have already validated the
   * file type / size at the route boundary; we re-check size here as
   * defence in depth.
   */
  body: Uint8Array | ArrayBuffer;
  mediaType: string;
  /** Original filename — used only for the storage-side basename. */
  filename: string;
}

/**
 * Upload a single chat-attachment image to Supabase Storage. Returns
 * the public URL the chat composer can ship in the chat-message's
 * `parts` array, and the path so a future cleanup can remove the
 * blob.
 *
 * Throws when:
 *   - The byte payload exceeds `MAX_UPLOAD_BYTES`.
 *   - Supabase Storage returns a non-2xx (passes the body through so
 *     the route handler's error envelope surfaces a useful message).
 */
export async function uploadChatImage(
  env: ChatImageUploadEnv,
  input: ChatImageUploadInput,
): Promise<ChatImageUploadResult> {
  const bytes = input.body instanceof Uint8Array ? input.body : new Uint8Array(input.body);
  if (bytes.byteLength === 0) {
    throw new Error('upload payload is empty');
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(
      `upload exceeds ${MAX_UPLOAD_BYTES} bytes (got ${bytes.byteLength})`,
    );
  }
  if (!input.mediaType.startsWith('image/')) {
    throw new Error(`media type ${input.mediaType} is not an image`);
  }

  const path = buildObjectPath(input.userId, input.filename);
  const uploadUrl = `${env.SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/${CHAT_IMAGES_BUCKET}/${path}`;
  const uploadedAt = Date.now();

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': input.mediaType,
      // `x-upsert: 'false'` so we 409 instead of overwriting on the
      // (statistically improbable) collision. The randomised path
      // generator keeps this safe in practice.
      'x-upsert': 'false',
      // Cleanup metadata — see the file-level comment.
      'x-metadata': JSON.stringify({ uploadedAt }),
    },
    body: bytes as unknown as BodyInit,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '<no body>');
    throw new Error(`Supabase Storage upload failed: HTTP ${res.status} — ${detail.slice(0, 200)}`);
  }

  const publicUrl = `${env.SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/public/${CHAT_IMAGES_BUCKET}/${path}`;
  return {
    url: publicUrl,
    path,
    mediaType: input.mediaType,
    uploadedAt,
  };
}

/**
 * Random-prefixed path so the same filename uploaded twice doesn't
 * collide. The prefix is a 12-char hex slug (≈48 bits of entropy);
 * good enough for personal-mode at our upload rate.
 */
function buildObjectPath(userId: string, filename: string): string {
  const safeBase = filename
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .slice(0, 64);
  const prefix = bytesToHex(crypto.getRandomValues(new Uint8Array(6)));
  // YYYY-MM-DD partition so a future cleanup cron can target one day
  // at a time without scanning the whole bucket.
  const day = new Date().toISOString().slice(0, 10);
  return `${userId}/${day}/${prefix}-${safeBase}`;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i]!.toString(16).padStart(2, '0');
  }
  return out;
}

export const CHAT_IMAGE_BUCKET_NAME = CHAT_IMAGES_BUCKET;
export const CHAT_IMAGE_MAX_BYTES = MAX_UPLOAD_BYTES;

export function safeGetItem<T>(key: string, fallback: T): T {
  try {
    if (typeof window === 'undefined') return fallback;
    const item = localStorage.getItem(key);
    return item === null ? fallback : (JSON.parse(item) as T);
  } catch {
    return fallback;
  }
}

export function safeSetItem<T>(key: string, value: T): boolean {
  try {
    if (typeof window === 'undefined') return false;
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Silently fail - localStorage may be unavailable or quota exceeded
    return false;
  }
}

/**
 * Migrate a value stored under an old localStorage key to a new key.
 * The value is JSON-parsed, optionally transformed, and written under
 * the new key; the old key is then removed. If the new key already
 * exists, no action is taken. This follows the `hamafx:dashboard-layout:v1`
 * versioning precedent.
 */
export function migrateLocalStorageKey<T>(
  oldKey: string,
  newKey: string,
  transform?: (value: unknown) => T,
): void {
  if (typeof window === 'undefined') return;
  if (window.localStorage.getItem(newKey) !== null) return;

  const raw = window.localStorage.getItem(oldKey);
  if (raw === null) return;

  try {
    const parsed = JSON.parse(raw) as unknown;
    const migrated = transform ? transform(parsed) : parsed;
    window.localStorage.setItem(newKey, JSON.stringify(migrated));
  } catch {
    /* old value was corrupt; continue to remove the old key */
  } finally {
    window.localStorage.removeItem(oldKey);
  }
}
