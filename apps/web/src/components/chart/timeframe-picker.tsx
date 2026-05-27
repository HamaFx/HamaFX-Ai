'use client';

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
      variant="gradient"
      groupId="tf-indicator"
      options={options.map((tf) => ({ value: tf, label: tf }))}
    />
  );
}
