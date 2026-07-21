export interface MockThread {
  id: string;
  userId: string;
  title: string;
  pinnedSymbol: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MockMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

let _threadIdCounter = 0;

export function makeThread(overrides?: Partial<MockThread>): MockThread {
  _threadIdCounter++;
  return {
    id: overrides?.id ?? `thread-${_threadIdCounter}`,
    userId: overrides?.userId ?? `test-user-${_threadIdCounter}`,
    title: overrides?.title ?? `Test Thread ${_threadIdCounter}`,
    pinnedSymbol: overrides?.pinnedSymbol ?? null,
    createdAt: overrides?.createdAt ?? new Date(),
    updatedAt: overrides?.updatedAt ?? new Date(),
  };
}

export function makeMessage(overrides?: Partial<MockMessage>): MockMessage {
  _threadIdCounter++;
  return {
    id: overrides?.id ?? `msg-${_threadIdCounter}`,
    threadId: overrides?.threadId ?? 'thread-1',
    role: overrides?.role ?? 'user',
    content: overrides?.content ?? 'Hello',
    createdAt: overrides?.createdAt ?? new Date(),
  };
}

export function resetThreadCounter(): void {
  _threadIdCounter = 0;
}
