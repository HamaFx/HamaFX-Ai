// SPDX-License-Identifier: Apache-2.0

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

import { validationError, providerUnavailable, AppError } from '@hamafx/shared';

import { errorResponse, withAuth } from '@/lib/api';
import { getServerEnv } from '@/lib/env';
import { withRateLimit } from '@hamafx/db';
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
  // H-6: HEIC/HEIF removed — these container formats can carry
  // multiple images, depth maps, and metadata. Sharp's HEIC parser
  // has a smaller security track record than JPEG/PNG/WebP.
  // See: https://github.com/lovell/sharp/issues?q=heif+security
]);

export const POST = withAuth<void>(async (req, { user }) => {
  try {
    // STAB-12: Rate limit uploads — 20 per user per minute.
    const rl = await withRateLimit(user.userId, 'upload', 20);
    if (!rl.allowed) {
      return errorResponse(new AppError('RATE_LIMITED', 'Too many uploads. Please wait a moment.', 429), req);
    }

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

    let uploadBody: ArrayBuffer | Uint8Array = await file.arrayBuffer();
    
    // PERF-09: Image optimization with sharp
    if (mediaType.startsWith('image/')) {
      const sharp = (await import('sharp')).default;
      const optimized = await sharp(uploadBody)
        .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      uploadBody = new Uint8Array(optimized);
    }

    const result = await uploadChatImage(
      {
        SUPABASE_URL: env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
      },
      {
        userId: user.userId,
        body: uploadBody,
        mediaType: mediaType.startsWith('image/') ? 'image/webp' : mediaType,
        filename: file.name ? file.name.replace(/\.[^/.]+$/, "") + ".webp" : 'attachment.webp',
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
