// /api/chat/threads — list + create chat threads.

import { z } from 'zod';

import { createThread, listThreads } from '@hamafx/ai';
import { SymbolSchema } from '@hamafx/shared';

import { errorResponse, parseJsonBody } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const threads = await listThreads();
    return Response.json({ threads });
  } catch (err) {
    return errorResponse(err);
  }
}

const CreateBodySchema = z
  .object({
    pinnedSymbol: SymbolSchema.nullable().optional(),
  })
  .default({});

export async function POST(req: Request): Promise<Response> {
  try {
    const { pinnedSymbol } = await parseJsonBody(req, CreateBodySchema);
    const thread = await createThread({ pinnedSymbol: pinnedSymbol ?? null });
    return Response.json({ thread }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
