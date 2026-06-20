'use client';

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

/**
 * <ProviderInfoDot> — small `ⓘ` icon next to a provider name.
 * Used by the onboarding wizard AND the api-keys card to surface
 * the provider's `bestFor` tag and capability flags in a tooltip.
 *
 * Phase C — UX_UPGRADE_PLAN.md item 16.
 *
 * Pure presentation; tooltip text is computed from the optional
 * fields on `ProviderMeta`. When the provider has no `bestFor` or
 * capability info, the icon still renders but the tooltip falls
 * back to a one-line description.
 *
 * Click on the dot is swallowed (stopPropagation) so the dot
 * inside a card-button does not trigger the parent card's select
 * handler.
 */

import { Info } from 'lucide-react';
import type { ReactElement } from 'react';

import { Tooltip } from '@/components/ui/tooltip';
import type { ProviderMeta } from '@hamafx/shared';

/**
 * Pure text-builder for the tooltip. Exported for unit tests so
 * the rendering logic can be asserted without rendering React.
 */
export function buildProviderTooltip(provider: ProviderMeta): string {
  const supports: string[] = [];
  if (provider.supports?.vision) supports.push('Vision');
  if (provider.supports?.embedding) supports.push('Embeddings');

  const lines: string[] = [];
  if (provider.bestFor) {
    lines.push(`Best for: ${provider.bestFor}`);
  }
  if (supports.length > 0) {
    lines.push(`Supports: ${supports.join(', ')}`);
  }
  if (lines.length === 0) {
    lines.push(provider.description);
  }
  return lines.join(' · ');
}

export function buildProviderAriaLabel(provider: ProviderMeta): string {
  return buildProviderTooltip(provider).split(' · ').join('. ');
}

export interface ProviderInfoDotProps {
  provider: ProviderMeta;
  /** Where the tooltip anchors. 'top' by default. */
  side?: 'top' | 'bottom';
  /** Extra className for the inner dot. */
  className?: string;
}

export function ProviderInfoDot({
  provider,
  side = 'top',
  className,
}: ProviderInfoDotProps): ReactElement {
  const label = buildProviderTooltip(provider);
  const ariaLabel = buildProviderAriaLabel(provider);

  return (
    <Tooltip label={label} side={side}>
      <span
        role="img"
        aria-label={ariaLabel}
        className={
          'text-fg-muted hover:text-fg inline-flex size-4 items-center justify-center rounded-full transition-colors' +
          (className ? ` ${className}` : '')
        }
        onClick={(e) => e.stopPropagation()}
      >
        <Info className="size-3" aria-hidden="true" />
      </span>
    </Tooltip>
  );
}
