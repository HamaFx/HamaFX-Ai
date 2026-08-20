import { ALL_SYMBOLS, type ToolName } from '@kestrel/shared';

export type MastraCapabilityMode = 'single' | 'quick' | 'standard' | 'full' | 'auto';
export type MastraEvidencePolicy = 'required' | 'optional' | 'none';
export type MastraCapabilityScope = 'read-only' | 'user-scoped' | 'admin';

export interface MastraCapability {
  readonly id: string;
  readonly version: string;
  readonly allowedSymbols: readonly string[];
  readonly allowedModes: readonly MastraCapabilityMode[];
  readonly scope: MastraCapabilityScope;
  readonly readOnly: boolean;
  readonly tools: readonly string[];
  readonly requiresConfirmation: boolean;
  readonly supportsStreaming: boolean;
  readonly supportsAbort: boolean;
  readonly maxSteps: number;
  readonly maxDurationMs: number;
  readonly evidencePolicy: MastraEvidencePolicy;
}

/**
 * Capability registry for staged migration.
 *
 * Keep capabilities narrow. A route must opt into a capability explicitly;
 * adding a tool to the registry must not silently make it available to every
 * Mastra agent.
 */
export const MASTRA_CAPABILITIES = {
  'xauusd-conversation': {
    id: 'xauusd-conversation',
    version: 'poc-4',
    allowedSymbols: ['XAUUSD'],
    allowedModes: ['single', 'auto'],
    scope: 'read-only',
    readOnly: true,
    tools: [
      'get-xauusd-market-structure',
      'get-xauusd-session-levels',
      'analyze-xauusd-technical',
      'get-xauusd-correlation',
      'get-xauusd-intermarket',
      'forecast-xauusd-volatility',
      'get-xauusd-news',
      'get-xauusd-calendar',
      'get-xauusd-social-sentiment',
      'get-xauusd-fundamental-context',
      'get-xauusd-seasonality',
      'get-xauusd-cot',
      'get-xauusd-intermarket-resonance',
      'search-untrusted-web',
      'search-untrusted-knowledge',
    ],
    requiresConfirmation: false,
    supportsStreaming: false,
    supportsAbort: true,
    maxSteps: 3,
    maxDurationMs: 55_000,
    evidencePolicy: 'required',
  },
  'symbol-research': {
    id: 'symbol-research',
    version: 'mode-1',
    allowedSymbols: ALL_SYMBOLS,
    allowedModes: ['single', 'quick', 'standard', 'full'],
    scope: 'read-only',
    readOnly: true,
    tools: [
      'collect-symbol-research-packet',
      'get-symbol-seasonality',
      'get-symbol-cot',
      'get-symbol-intermarket-resonance',
      'search-untrusted-web',
      'search-untrusted-knowledge',
    ],
    requiresConfirmation: false,
    supportsStreaming: false,
    supportsAbort: true,
    maxSteps: 5,
    maxDurationMs: 55_000,
    evidencePolicy: 'required',
  },
  'mutation-workflows': {
    id: 'mutation-workflows',
    version: 'approval-1',
    allowedSymbols: ALL_SYMBOLS,
    allowedModes: ['single', 'quick', 'standard', 'full', 'auto'],
    scope: 'user-scoped',
    readOnly: false,
    tools: ['set_alert', 'log_journal', 'share_snapshot', 'run_system_action'],
    requiresConfirmation: true,
    supportsStreaming: false,
    supportsAbort: true,
    maxSteps: 1,
    maxDurationMs: 15_000,
    evidencePolicy: 'none',
  },
  'xauusd-research': {
    id: 'xauusd-research',
    version: 'poc-4',
    allowedSymbols: ['XAUUSD'],
    allowedModes: ['single', 'auto'],
    scope: 'read-only',
    readOnly: true,
    tools: [
      'get_xauusd_research_packet',
      'get_xauusd_price',
      'get_xauusd_candles',
      'get_xauusd_indicators',
    ],
    requiresConfirmation: false,
    // The current route emits an SSE-compatible completed response, but the
    // underlying Mastra generation is not token-streamed yet.
    supportsStreaming: false,
    supportsAbort: true,
    maxSteps: 1,
    maxDurationMs: 55_000,
    evidencePolicy: 'required',
  },
} as const satisfies Record<string, MastraCapability>;

export type MastraCapabilityId = keyof typeof MASTRA_CAPABILITIES;

export type MastraCapabilityRejectionReason =
  | 'unknown-capability'
  | 'unsupported-symbol'
  | 'unsupported-mode'
  | 'model-override'
  | 'mutation-request'
  | 'confirmation-required'
  | 'mutations-disabled';

export interface MastraCapabilityRequest {
  capabilityId: string;
  symbol: string;
  mode: MastraCapabilityMode;
  hasModelOverride?: boolean;
  mutationRequested?: boolean;
  confirmed?: boolean;
}

export type MastraCapabilityDecision =
  | {
      allowed: true;
      capability: MastraCapability;
    }
  | {
      allowed: false;
      capability: MastraCapability | null;
      reason: MastraCapabilityRejectionReason;
    };

/** Resolve a capability without allowing unknown IDs to fall through. */
export function getMastraCapability(capabilityId: string): MastraCapability | null {
  return MASTRA_CAPABILITIES[capabilityId as MastraCapabilityId] ?? null;
}

/**
 * Apply the server-side capability boundary before model execution.
 *
 * This policy intentionally does not inspect model output. Symbol, mode,
 * mutation, and confirmation permissions are properties of the request and
 * route, not decisions delegated to the model.
 */
export function evaluateMastraCapability(
  request: MastraCapabilityRequest,
): MastraCapabilityDecision {
  const capability = getMastraCapability(request.capabilityId);
  if (!capability) {
    return { allowed: false, capability: null, reason: 'unknown-capability' };
  }

  if (!capability.allowedSymbols.includes(request.symbol)) {
    return { allowed: false, capability, reason: 'unsupported-symbol' };
  }

  if (!capability.allowedModes.includes(request.mode)) {
    return { allowed: false, capability, reason: 'unsupported-mode' };
  }

  if (request.hasModelOverride) {
    return { allowed: false, capability, reason: 'model-override' };
  }

  if (request.mutationRequested && capability.readOnly) {
    return { allowed: false, capability, reason: 'mutation-request' };
  }

  if (
    request.mutationRequested &&
    !capability.readOnly &&
    process.env.ENABLE_MASTRA_MUTATIONS !== 'true'
  ) {
    return { allowed: false, capability, reason: 'mutations-disabled' };
  }

  if (capability.requiresConfirmation && !request.confirmed) {
    return { allowed: false, capability, reason: 'confirmation-required' };
  }

  return { allowed: true, capability };
}

/**
 * Type-level assertion for the current XAUUSD capability tool list.
 * The legacy tool-name union is intentionally not used here because Mastra
 * tool IDs are distinct from legacy AI SDK tool names.
 */
export type MastraCapabilityToolName =
  ToolName | (typeof MASTRA_CAPABILITIES)[MastraCapabilityId]['tools'][number];
