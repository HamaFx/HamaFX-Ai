/**
 * Copyright 2026 Kestrel
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

import { describe, expect, it } from 'vitest';

import {
  METRIC_NAMES,
  MetricsRegistry,
  isMetricName,
  metrics,
} from '../src/metrics';

describe('metrics registry', () => {
  it('exposes the AI + worker SLI metric names', () => {
    expect(METRIC_NAMES).toEqual(expect.arrayContaining([
      'chat_request_total',
      'tool_call_total',
      'provider_fallback_total',
      'budget_release_failed_total',
      'ttft_ms',
      'turn_cost_usd',
    ]));
    expect(isMetricName('ttft_ms')).toBe(true);
    expect(isMetricName('not_a_metric')).toBe(false);
  });

  it('increments counters and flattens them into the snapshot', () => {
    const registry = new MetricsRegistry();
    registry.increment('chat_request_total');
    registry.increment('chat_request_total', { by: 4 });
    registry.increment('tool_call_total', { tags: { tool: 'compute_risk' } });

    const snap = registry.snapshot();
    expect(snap.counters['chat_request_total']).toBe(5);
    expect(snap.counters['tool_call_total{tool=compute_risk}']).toBe(1);
  });

  it('accumulates histogram observations with min/max/avg', () => {
    const registry = new MetricsRegistry();
    registry.observe('ttft_ms', 100);
    registry.observe('ttft_ms', 300);
    registry.observe('ttft_ms', 200);

    const summary = registry.snapshot().histograms['ttft_ms'];
    expect(summary).toEqual({ count: 3, sum: 600, avg: 200, min: 100, max: 300 });
  });

  it('keeps tagged series independent and stable across observation order', () => {
    const registry = new MetricsRegistry();
    registry.observe('total_latency_ms', 10, { tags: { mode: 'quick' } });
    registry.observe('total_latency_ms', 40, { tags: { mode: 'full' } });
    registry.observe('total_latency_ms', 20, { tags: { mode: 'quick' } });

    const snap = registry.snapshot();
    expect(snap.histograms['total_latency_ms{mode=quick}']).toMatchObject({ count: 2, min: 10, max: 20 });
    expect(snap.histograms['total_latency_ms{mode=full}']).toMatchObject({ count: 1, min: 40, max: 40 });
  });

  it('ignores non-finite histogram observations', () => {
    const registry = new MetricsRegistry();
    registry.observe('ttft_ms', Number.NaN);
    registry.observe('ttft_ms', Number.POSITIVE_INFINITY);
    expect(registry.snapshot().histograms['ttft_ms']).toBeUndefined();
  });

  it('resets cleanly between runs', () => {
    const registry = new MetricsRegistry();
    registry.increment('chat_turn_total');
    registry.reset();
    expect(registry.snapshot().counters).toEqual({});
    expect(registry.snapshot().histograms).toEqual({});
  });

  it('exports a process-wide default singleton', () => {
    metrics.increment('chat_request_total');
    expect(metrics.snapshot().counters['chat_request_total']).toBeGreaterThanOrEqual(1);
    metrics.reset();
  });
});
