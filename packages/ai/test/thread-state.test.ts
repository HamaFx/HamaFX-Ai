import { describe, expect, it } from 'vitest';
import {
  getThreadStateHandler,
  canTransitionThread,
  getInitialThreadState,
  type ThreadState,
} from '../src/thread-state';

describe('getThreadStateHandler', () => {
  it('returns handler for valid state "created"', () => {
    const handler = getThreadStateHandler('created');
    expect(handler.state).toBe('created');
    expect(handler.canAppendMessage()).toBe(true);
    expect(handler.canEdit()).toBe(true);
    expect(handler.canDelete()).toBe(true);
    expect(handler.canArchive()).toBe(false);
  });

  it('returns handler for valid state "active"', () => {
    const handler = getThreadStateHandler('active');
    expect(handler.state).toBe('active');
    expect(handler.canAppendMessage()).toBe(true);
    expect(handler.canEdit()).toBe(true);
    expect(handler.canDelete()).toBe(true);
    expect(handler.canArchive()).toBe(true);
  });

  it('returns handler for valid state "archived"', () => {
    const handler = getThreadStateHandler('archived');
    expect(handler.state).toBe('archived');
    expect(handler.canAppendMessage()).toBe(false);
    expect(handler.canEdit()).toBe(false);
    expect(handler.canDelete()).toBe(true);
    expect(handler.canArchive()).toBe(false);
  });

  it('returns handler for valid state "deleted"', () => {
    const handler = getThreadStateHandler('deleted');
    expect(handler.state).toBe('deleted');
    expect(handler.canAppendMessage()).toBe(false);
    expect(handler.canEdit()).toBe(false);
    expect(handler.canDelete()).toBe(false);
    expect(handler.canArchive()).toBe(false);
  });

  it('throws for unknown state', () => {
    expect(() => getThreadStateHandler('unknown' as ThreadState)).toThrow(
      'Unknown thread state: "unknown"',
    );
  });
});

describe('canTransitionThread', () => {
  it('allows created → active', () => {
    expect(canTransitionThread('created', 'active')).toBe(true);
  });

  it('allows created → deleted', () => {
    expect(canTransitionThread('created', 'deleted')).toBe(true);
  });

  it('disallows created → archived (must go through active first)', () => {
    expect(canTransitionThread('created', 'archived')).toBe(false);
  });

  it('allows active → archived', () => {
    expect(canTransitionThread('active', 'archived')).toBe(true);
  });

  it('allows active → deleted', () => {
    expect(canTransitionThread('active', 'deleted')).toBe(true);
  });

  it('disallows active → created (no going backwards)', () => {
    expect(canTransitionThread('active', 'created')).toBe(false);
  });

  it('allows archived → active (unarchive)', () => {
    expect(canTransitionThread('archived', 'active')).toBe(true);
  });

  it('allows archived → deleted', () => {
    expect(canTransitionThread('archived', 'deleted')).toBe(true);
  });

  it('disallows archived → created', () => {
    expect(canTransitionThread('archived', 'created')).toBe(false);
  });

  it('disallows any transition from deleted (terminal state)', () => {
    const states: ThreadState[] = ['created', 'active', 'archived', 'deleted'];
    for (const to of states) {
      expect(canTransitionThread('deleted', to)).toBe(false);
    }
  });
});

describe('getInitialThreadState', () => {
  it('returns "created" as the initial state', () => {
    expect(getInitialThreadState()).toBe('created');
  });
});

describe('state handler consistency', () => {
  it('all allowedTransitions() are valid ThreadState values', () => {
    const allStates: ThreadState[] = ['created', 'active', 'archived', 'deleted'];
    for (const state of allStates) {
      const handler = getThreadStateHandler(state);
      const transitions = handler.allowedTransitions();
      for (const t of transitions) {
        expect(allStates).toContain(t);
      }
    }
  });

  it('created state has exactly 2 allowed transitions', () => {
    expect(getThreadStateHandler('created').allowedTransitions()).toEqual([
      'active',
      'deleted',
    ]);
  });

  it('active state has exactly 2 allowed transitions', () => {
    expect(getThreadStateHandler('active').allowedTransitions()).toEqual([
      'archived',
      'deleted',
    ]);
  });

  it('archived state has exactly 2 allowed transitions', () => {
    expect(getThreadStateHandler('archived').allowedTransitions()).toEqual([
      'active',
      'deleted',
    ]);
  });

  it('deleted state has zero allowed transitions (terminal)', () => {
    expect(getThreadStateHandler('deleted').allowedTransitions()).toEqual([]);
  });
});
