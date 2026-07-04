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

// Mobile-friendly segmented control for the 8 supported timeframes.
// Thin wrapper over the shared <Segmented> primitive so all segment-style
// controls in the app stay consistent.

import { TIMEFRAMES, type Timeframe } from '@hamafx/shared';

import { Segmented } from '@/components/ui/segmented';

interface TimeframePickerProps {
  value: Timeframe;
  onChange: (tf: Timeframe) => void;
  /**
   * Subset to render — defaults to the full 8. Useful if a future view only
   * supports intraday timeframes.
   */
  options?: readonly Timeframe[];
}

export function TimeframePicker({ value, onChange, options = TIMEFRAMES }: TimeframePickerProps) {
  return (
    <Segmented<Timeframe>
      label="Timeframe"
      srLabel
      value={value}
      onChange={onChange}
      role="tablist"
      variant="accent"
      groupId="tf-indicator"
      options={options.map((tf) => ({ value: tf, label: tf }))}
    />
  );
}
