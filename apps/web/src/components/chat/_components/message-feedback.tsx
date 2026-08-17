'use client';

import { useState } from 'react';
import { IconCheck, IconThumbDown, IconThumbUp } from '@tabler/icons-react';
import { toast } from 'sonner';

import { apiMutate } from '@/lib/api-client';

interface MessageFeedbackProps {
  threadId: string;
  messageId: string;
}

type Rating = 'positive' | 'negative';

export function MessageFeedback({ threadId, messageId }: MessageFeedbackProps) {
  const [rating, setRating] = useState<Rating | null>(null);
  const [pending, setPending] = useState<Rating | null>(null);

  async function submit(nextRating: Rating) {
    setPending(nextRating);
    try {
      await apiMutate(`/api/chat/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/feedback`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rating: nextRating }),
      });
      setRating(nextRating);
      toast.success(nextRating === 'positive' ? 'Thanks for the feedback' : 'Thanks — we will review this response');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save feedback');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex items-center gap-1" aria-label="Rate this response">
      <button
        type="button"
        aria-label="Good response"
        aria-pressed={rating === 'positive'}
        disabled={pending !== null}
        onClick={() => void submit('positive')}
        className="text-fg-subtle hover:text-success focus-visible:ring-fg inline-flex size-8 items-center justify-center rounded-sm transition-colors focus:outline-none focus-visible:ring-2 disabled:opacity-50"
      >
        {rating === 'positive' ? <IconCheck className="size-3.5" aria-hidden="true" /> : <IconThumbUp className="size-3.5" aria-hidden="true" />}
      </button>
      <button
        type="button"
        aria-label="Poor response"
        aria-pressed={rating === 'negative'}
        disabled={pending !== null}
        onClick={() => void submit('negative')}
        className="text-fg-subtle hover:text-danger focus-visible:ring-fg inline-flex size-8 items-center justify-center rounded-sm transition-colors focus:outline-none focus-visible:ring-2 disabled:opacity-50"
      >
        {rating === 'negative' ? <IconCheck className="size-3.5" aria-hidden="true" /> : <IconThumbDown className="size-3.5" aria-hidden="true" />}
      </button>
    </div>
  );
}
