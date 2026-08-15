// SPDX-License-Identifier: Apache-2.0

import type { ProviderId } from '@kestrel/shared';

/**
 * The persisted chat-model format. The model id is intentionally kept intact:
 * OpenRouter and other gateways use slash-containing model ids.
 */
export function toChatModelValue(providerId: ProviderId | string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

/** Qualified display/telemetry id used by model metadata. */
export function toQualifiedModelId(providerId: ProviderId | string, modelId: string): string {
  return `${providerId}/${modelId}`;
}

/**
 * Accept the current canonical value plus legacy/provider-qualified values.
 * The legacy aliases keep existing saved selections highlighted after the
 * identifier format was corrected.
 */
export function modelSelectionMatches(
  selection: string | null | undefined,
  providerId: ProviderId | string,
  modelId: string,
): boolean {
  if (!selection) return false;

  const candidates = new Set([
    toChatModelValue(providerId, modelId),
    toQualifiedModelId(providerId, modelId),
  ]);

  // Vertex telemetry uses google-vertex while its persisted provider id is
  // vertex. Older UI paths also used this prefix for display.
  if (providerId === 'vertex') {
    candidates.add(`google-vertex/${modelId}`);
  }

  // Before slash-containing model ids were preserved, the settings endpoint
  // stripped the first segment. Recognize that old value only as a UI alias;
  // new writes always use the exact model id above.
  const slash = modelId.indexOf('/');
  if (slash > 0) {
    const legacyBare = modelId.slice(slash + 1);
    candidates.add(toChatModelValue(providerId, legacyBare));
    candidates.add(toQualifiedModelId(providerId, legacyBare));
  }

  return candidates.has(selection);
}

export function modelLabelFromSelection(selection: string | null | undefined): string {
  if (!selection) return 'Model';
  const separator = selection.indexOf(':');
  const modelId =
    separator >= 0 ? selection.slice(separator + 1) : selection.split('/').slice(1).join('/');
  return modelId || 'Model';
}
