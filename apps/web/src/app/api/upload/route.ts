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

// POST /api/upload — chat-attachment image uploads.
//
// Phase 3 hardening §7. Replaces the old "base64 the file into the
// chat JSON body" path. The composer now POSTs each image here as
// `multipart/form-data`, gets back a public URL, and ships the URL
// (not the bytes) in the chat message. With four 5 MB images this
// keeps `/api/chat` request bodies under ~50 KB instead of ~27 MB.
//
// Auth: this is gated by the global middleware so only the logged-in
// user can upload. CSRF risk is the same as for other state-changing
// endpoints — the cookie carries `SameSite=Lax`, which blocks
// cross-site form posts. (The §22 CSRF token would add belt-and-
// braces double-submit on top.)

import { validationError, providerUnavailable } from '@hamafx/shared';

import { errorResponse, withAuth } from '@/lib/api';
import { getServerEnv } from '@/lib/env';
import {
  CHAT_IMAGE_MAX_BYTES,
  uploadChatImage,
} from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Vercel's body limit applies to the whole multipart payload, not just
// the file. We cap the inbound size at MAX + 1 KB headroom.
const MAX_REQUEST_BYTES = CHAT_IMAGE_MAX_BYTES + 1024;

const ALLOWED_MEDIA_TYPES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

export const POST = withAuth<void>(async (req, { user }) => {
  try {
    // Pre-check the content-length header so an oversize request is
    // rejected before we read the form. The body-size guard in
    // parseJsonBody (Phase 1 §6) lives on the JSON path; multipart
    // has its own check here.
    const lenHeader = req.headers.get('content-length');
    if (lenHeader) {
      const declared = Number(lenHeader);
      if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
        throw validationError(
          `Upload too large (max ${CHAT_IMAGE_MAX_BYTES} bytes per file)`,
        );
      }
    }

    const env = getServerEnv();
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw providerUnavailable(
        'Image uploads are not configured (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)',
      );
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      throw validationError('Missing "file" form field');
    }

    if (file.size > CHAT_IMAGE_MAX_BYTES) {
      throw validationError(
        `Image exceeds ${CHAT_IMAGE_MAX_BYTES} bytes (got ${file.size})`,
      );
    }

    const mediaType = file.type || 'application/octet-stream';
    if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
      throw validationError(`Unsupported media type: ${mediaType}`);
    }

    const buffer = await file.arrayBuffer();
    const result = await uploadChatImage(
      {
        SUPABASE_URL: env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
      },
      {
        userId: user.userId,
        body: buffer,
        mediaType,
        filename: file.name || 'attachment',
      },
    );

    return Response.json({
      url: result.url,
      path: result.path,
      mediaType: result.mediaType,
      uploadedAt: result.uploadedAt,
    });
  } catch (err) {
    return errorResponse(err, req);
  }
});
