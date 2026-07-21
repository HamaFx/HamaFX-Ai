import { describe, expect, it, beforeEach } from 'vitest';
import { makeThread, makeMessage, resetThreadCounter } from './threads';

describe('makeThread', () => {
  beforeEach(() => {
    resetThreadCounter();
  });

  it('creates a thread with auto-incrementing id and sensible defaults', () => {
    const thread = makeThread();
    expect(thread.id).toBe('thread-1');
    expect(thread.userId).toBe('test-user-1');
    expect(thread.title).toBe('Test Thread 1');
    expect(thread.pinnedSymbol).toBeNull();
    expect(thread.createdAt).toBeInstanceOf(Date);
    expect(thread.updatedAt).toBeInstanceOf(Date);
  });

  it('increments the id counter across multiple calls', () => {
    const t1 = makeThread();
    const t2 = makeThread();
    expect(t1.id).toBe('thread-1');
    expect(t2.id).toBe('thread-2');
  });

  it('accepts partial overrides', () => {
    const thread = makeThread({
      id: 'custom-thread',
      title: 'Custom Title',
      pinnedSymbol: 'XAUUSD',
    });
    expect(thread.id).toBe('custom-thread');
    expect(thread.title).toBe('Custom Title');
    expect(thread.pinnedSymbol).toBe('XAUUSD');
    expect(thread.userId).toBe('test-user-1'); // auto-generated
  });

  it('accepts all overrides', () => {
    const now = new Date('2025-01-01');
    const thread = makeThread({
      id: 't1',
      userId: 'user-1',
      title: 'Gold Analysis',
      pinnedSymbol: 'EURUSD',
      createdAt: now,
      updatedAt: now,
    });
    expect(thread).toEqual({
      id: 't1',
      userId: 'user-1',
      title: 'Gold Analysis',
      pinnedSymbol: 'EURUSD',
      createdAt: now,
      updatedAt: now,
    });
  });
});

describe('makeMessage', () => {
  beforeEach(() => {
    resetThreadCounter();
  });

  it('creates a message with auto-incrementing id and defaults', () => {
    const msg = makeMessage();
    expect(msg.id).toBe('msg-1');
    expect(msg.threadId).toBe('thread-1');
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('Hello');
    expect(msg.createdAt).toBeInstanceOf(Date);
  });

  it('shares counter with makeThread (both increment _threadIdCounter)', () => {
    // makeThread and makeMessage share the same module-level counter.
    // Calling makeThread before makeMessage bumps the counter for both.
    makeThread();
    const msg = makeMessage();
    // Counter was incremented by makeThread then makeMessage
    expect(msg.id).toBe('msg-2');
  });

  it('accepts partial overrides', () => {
    const msg = makeMessage({ role: 'assistant', content: 'Hi there!' });
    expect(msg.role).toBe('assistant');
    expect(msg.content).toBe('Hi there!');
    expect(msg.threadId).toBe('thread-1');
  });

  it('accepts all overrides', () => {
    const now = new Date('2025-06-15');
    const msg = makeMessage({
      id: 'msg-custom',
      threadId: 'thread-42',
      role: 'assistant',
      content: 'Analysis complete.',
      createdAt: now,
    });
    expect(msg).toEqual({
      id: 'msg-custom',
      threadId: 'thread-42',
      role: 'assistant',
      content: 'Analysis complete.',
      createdAt: now,
    });
  });
});
