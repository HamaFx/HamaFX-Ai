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

// PF-17 — State pattern for thread lifecycle.
//
// A chat thread transitions through these states:
//   CREATED → ACTIVE → (ARCHIVED | DELETED)
//
// Each state defines which operations are allowed. This prevents
// operations like appending messages to an archived thread.

/**
 * Thread states in the lifecycle.
 */
export type ThreadState = 'created' | 'active' | 'archived' | 'deleted';

/**
 * PF-17 — Contract for a thread state.
 * Each state implementation defines what transitions are allowed.
 */
export interface ThreadStateHandler {
  readonly state: ThreadState;
  canAppendMessage(): boolean;
  canEdit(): boolean;
  canDelete(): boolean;
  canArchive(): boolean;
  allowedTransitions(): ThreadState[];
}

// ── State implementations ──────────────────────────────────────────────────

class CreatedState implements ThreadStateHandler {
  readonly state: ThreadState = 'created';

  canAppendMessage(): boolean { return true; }
  canEdit(): boolean { return true; }
  canDelete(): boolean { return true; }
  canArchive(): boolean { return false; }

  allowedTransitions(): ThreadState[] {
    return ['active', 'deleted'];
  }
}

class ActiveState implements ThreadStateHandler {
  readonly state: ThreadState = 'active';

  canAppendMessage(): boolean { return true; }
  canEdit(): boolean { return true; }
  canDelete(): boolean { return true; }
  canArchive(): boolean { return true; }

  allowedTransitions(): ThreadState[] {
    return ['archived', 'deleted'];
  }
}

class ArchivedState implements ThreadStateHandler {
  readonly state: ThreadState = 'archived';

  canAppendMessage(): boolean { return false; }
  canEdit(): boolean { return false; }
  canDelete(): boolean { return true; }
  canArchive(): boolean { return false; }

  allowedTransitions(): ThreadState[] {
    return ['active', 'deleted']; // unarchive or delete
  }
}

class DeletedState implements ThreadStateHandler {
  readonly state: ThreadState = 'deleted';

  canAppendMessage(): boolean { return false; }
  canEdit(): boolean { return false; }
  canDelete(): boolean { return false; }
  canArchive(): boolean { return false; }

  allowedTransitions(): ThreadState[] {
    return []; // terminal state
  }
}

// ── Registry ───────────────────────────────────────────────────────────────

const STATE_MAP: Record<ThreadState, ThreadStateHandler> = {
  created: new CreatedState(),
  active: new ActiveState(),
  archived: new ArchivedState(),
  deleted: new DeletedState(),
};

/**
 * Get the handler for a thread state.
 */
export function getThreadStateHandler(state: ThreadState): ThreadStateHandler {
  const handler = STATE_MAP[state];
  if (!handler) {
    throw new Error(`Unknown thread state: "${state}"`);
  }
  return handler;
}

/**
 * Validate a state transition. Returns true when the transition is allowed.
 *
 * @example
 * ```ts
 * if (!canTransitionThread('archived', 'active')) {
 *   throw new Error('Cannot unarchive an active thread');
 * }
 * ```
 */
export function canTransitionThread(from: ThreadState, to: ThreadState): boolean {
  const handler = getThreadStateHandler(from);
  return handler.allowedTransitions().includes(to);
}

/**
 * Return the initial state for a new thread.
 */
export function getInitialThreadState(): ThreadState {
  return 'created';
}
