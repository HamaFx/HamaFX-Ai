// SPDX-License-Identifier: Apache-2.0

/**
 * Capability → Mastra component registry (Phase 0).
 *
 * The server-side capability policy (`../mastra/capabilities.ts`) remains the
 * fail-closed gate for what a request may do. This registry maps each
 * capability id to the Mastra agent or workflow that implements it, so the
 * route layer can resolve the exact component a capability allows — never a
 * broader implicit tool menu.
 *
 * Phase 0 defines the mapping table and typed resolution helpers. The
 * components themselves are registered in later phases:
 * - Phase 2: `symbolResearch` and `xauusdResearch` workflows (Quick/
 *   Standard/Full modes + the XAUUSD verified-report pipeline). Note the
 *   workflows are per-request factories (BYOK closures) — run snapshots
 *   persist to the shared storage, but the components are registered on the
 *   instance in Phase 8 (Studio) where a canonical, non-BYK graph is used.
 * - Phase 4: `xauusdConversation` agent (streaming).
 * - Phase 7: `mutationWorkflows` (suspend/resume approvals).
 *
 * Until a component is registered, `resolveMastra*` throws a typed
 * `MastraComponentNotRegisteredError` so callers fail closed instead of
 * silently falling through to another path.
 */

import type { Mastra } from '@mastra/core';
import type { Agent } from '@mastra/core/agent';
import type { AnyWorkflow } from '@mastra/core/workflows';
import { MASTRA_CAPABILITIES, type MastraCapabilityId } from '../mastra/capabilities';

export interface MastraComponentRegistration {
  /** Which primitive implements this capability. */
  kind: 'agent' | 'workflow';
  /** Registration key on the Mastra instance (`agents` / `workflows` record key). */
  key: string;
  /** Build phase that registers the component (documentation / test gate). */
  phase: 0 | 2 | 4 | 7;
}

/**
 * Single source of truth for what implements each capability. Adding a
 * capability to `MASTRA_CAPABILITIES` without a mapping here fails the
 * registry integrity test.
 */
export const MASTRA_COMPONENT_REGISTRY: Record<MastraCapabilityId, MastraComponentRegistration> = {
  'xauusd-research': { kind: 'workflow', key: 'xauusdResearch', phase: 2 },
  'xauusd-conversation': { kind: 'agent', key: 'xauusdConversation', phase: 4 },
  'symbol-research': { kind: 'workflow', key: 'symbolResearch', phase: 2 },
  'mutation-workflows': { kind: 'workflow', key: 'mutationWorkflows', phase: 7 },
};

export type MastraCapabilityRegistrationId = keyof typeof MASTRA_COMPONENT_REGISTRY;

export class MastraComponentNotRegisteredError extends Error {
  readonly capabilityId: string;
  readonly registration: MastraComponentRegistration;

  constructor(capabilityId: string, registration: MastraComponentRegistration) {
    super(
      `Mastra component for capability "${capabilityId}" (${registration.kind} "${registration.key}") ` +
        `is not registered yet — expected in build phase ${registration.phase}.`,
    );
    this.name = 'MastraComponentNotRegisteredError';
    this.capabilityId = capabilityId;
    this.registration = registration;
  }
}

export class MastraComponentKindMismatchError extends Error {
  constructor(capabilityId: string, expected: 'agent' | 'workflow', actual: 'agent' | 'workflow') {
    super(
      `Mastra capability "${capabilityId}" maps to a ${actual}, but ${expected} resolution was requested.`,
    );
    this.name = 'MastraComponentKindMismatchError';
  }
}

/** Every registered capability id must have a component mapping. */
export function assertMastraRegistryComplete(): void {
  const missing = Object.keys(MASTRA_CAPABILITIES).filter(
    (id) => !(id in MASTRA_COMPONENT_REGISTRY),
  );
  if (missing.length > 0) {
    throw new Error(
      `Mastra capability ids without a component registration: ${missing.join(', ')}`,
    );
  }
}

export function mastraRegistrationFor(capabilityId: string): MastraComponentRegistration | null {
  return MASTRA_COMPONENT_REGISTRY[capabilityId as MastraCapabilityId] ?? null;
}

/** Resolve the agent implementing a capability, failing closed when absent. */
export function resolveMastraAgent(
  mastra: Mastra,
  capabilityId: string,
): Agent {
  const registration = mastraRegistrationFor(capabilityId);
  if (!registration) throw new Error(`Unknown Mastra capability id: ${capabilityId}`);
  if (registration.kind !== 'agent') {
    throw new MastraComponentKindMismatchError(capabilityId, 'agent', registration.kind);
  }
  const agents = mastra.listAgents();
  const agent = agents[registration.key as keyof typeof agents];
  if (!agent) {
    throw new MastraComponentNotRegisteredError(capabilityId, registration);
  }
  return agent as Agent;
}

/** Resolve the workflow implementing a capability, failing closed when absent. */
export function resolveMastraWorkflow(
  mastra: Mastra,
  capabilityId: string,
): AnyWorkflow {
  const registration = mastraRegistrationFor(capabilityId);
  if (!registration) throw new Error(`Unknown Mastra capability id: ${capabilityId}`);
  if (registration.kind !== 'workflow') {
    throw new MastraComponentKindMismatchError(capabilityId, 'workflow', registration.kind);
  }
  const workflows = mastra.listWorkflows();
  const workflow = workflows[registration.key as keyof typeof workflows];
  if (!workflow) {
    throw new MastraComponentNotRegisteredError(capabilityId, registration);
  }
  return workflow as AnyWorkflow;
}
