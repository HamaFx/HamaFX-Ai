import { describe, expect, it } from 'vitest';

import { LibSQLStore } from '@mastra/libsql';

import { MASTRA_CAPABILITIES } from '../src/mastra';
import {
  assertMastraRegistryComplete,
  createKestrelMastra,
  MASTRA_COMPONENT_REGISTRY,
  MastraComponentKindMismatchError,
  MastraComponentNotRegisteredError,
  mastraRegistrationFor,
  resolveMastraAgent,
  resolveMastraWorkflow,
} from '../src/mastra-v2';

function memoryStore(): LibSQLStore {
  return new LibSQLStore({ id: 'test-store', url: ':memory:' });
}

describe('mastra-v2 capability registry', () => {
  it('maps every declared capability to a Mastra component', () => {
    expect(() => assertMastraRegistryComplete()).not.toThrow();
    for (const id of Object.keys(MASTRA_CAPABILITIES)) {
      expect(mastraRegistrationFor(id), `missing registration for ${id}`).toBeTruthy();
    }
  });

  it('maps research capabilities to workflows and conversation/mutation capabilities to agents/workflows', () => {
    expect(MASTRA_COMPONENT_REGISTRY['xauusd-research']).toEqual({
      kind: 'workflow',
      key: 'xauusdResearch',
      phase: 2,
    });
    expect(MASTRA_COMPONENT_REGISTRY['xauusd-conversation']).toEqual({
      kind: 'agent',
      key: 'xauusdConversation',
      phase: 4,
    });
    expect(MASTRA_COMPONENT_REGISTRY['symbol-research']).toEqual({
      kind: 'workflow',
      key: 'symbolResearch',
      phase: 2,
    });
    expect(MASTRA_COMPONENT_REGISTRY['mutation-workflows']).toEqual({
      kind: 'workflow',
      key: 'mutationWorkflows',
      phase: 7,
    });
  });

  it('fails closed with a typed error when an agent capability is not yet registered', () => {
    const storage = memoryStore();
    const { instance } = createKestrelMastra({ storage, storageKind: 'libsql', env: {} });
    expect(() => resolveMastraAgent(instance, 'xauusd-conversation')).toThrow(
      MastraComponentNotRegisteredError,
    );
  });

  it('fails closed with a typed error when a workflow capability is not yet registered', () => {
    const storage = memoryStore();
    const { instance } = createKestrelMastra({ storage, storageKind: 'libsql', env: {} });
    expect(() => resolveMastraWorkflow(instance, 'symbol-research')).toThrow(
      MastraComponentNotRegisteredError,
    );
  });

  it('rejects resolving a component through the wrong kind', () => {
    const storage = memoryStore();
    const { instance } = createKestrelMastra({ storage, storageKind: 'libsql', env: {} });
    expect(() => resolveMastraAgent(instance, 'symbol-research')).toThrow(
      MastraComponentKindMismatchError,
    );
    expect(() => resolveMastraWorkflow(instance, 'xauusd-conversation')).toThrow(
      MastraComponentKindMismatchError,
    );
  });

  it('rejects unknown capability ids', () => {
    expect(mastraRegistrationFor('not-a-capability')).toBeNull();
  });
});
