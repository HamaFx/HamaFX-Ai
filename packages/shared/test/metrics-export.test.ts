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

import { describe, expect, it, vi } from 'vitest';
import { uncompress as snappyUncompress } from 'snappyjs';

import {
  buildMetricsUrl,
  exportMetricsToOtlp,
  exportMetricsToRemoteWrite,
  flushMetrics,
  grafanaOtlpConfigFromEnv,
  grafanaRemoteWriteConfigFromEnv,
  parseSnapshotKey,
  snapshotToOtlpJson,
  snapshotToPromRemoteWrite,
} from '../src/metrics-export';
import { metrics } from '../src/metrics';
import type { MetricsSnapshot } from '../src/metrics';

function snapshot(): MetricsSnapshot {
  return {
    counters: { chat_turn_total: 3 },
    histograms: {
      // Observations {100, 500} — cumulative bucket counts follow.
      total_latency_ms: {
        count: 2,
        sum: 600,
        avg: 300,
        min: 100,
        max: 500,
        buckets: [0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2],
      },
    },
  };
}

describe('grafanaOtlpConfigFromEnv', () => {
  it('returns null when either credential is missing', () => {
    expect(grafanaOtlpConfigFromEnv({})).toBeNull();
    expect(grafanaOtlpConfigFromEnv({ GRAFANA_CLOUD_OTLP_ENDPOINT: 'https://x/otlp' })).toBeNull();
    expect(grafanaOtlpConfigFromEnv({ GRAFANA_CLOUD_API_KEY: 'key' })).toBeNull();
  });

  it('trims and returns a config when both values are present', () => {
    expect(grafanaOtlpConfigFromEnv({
      GRAFANA_CLOUD_OTLP_ENDPOINT: ' https://x/otlp ',
      GRAFANA_CLOUD_API_KEY: ' key ',
    })).toEqual({ endpoint: 'https://x/otlp', apiKey: 'key' });
  });
});

describe('buildMetricsUrl', () => {
  it('appends the OTLP metrics path', () => {
    expect(buildMetricsUrl('https://host/otlp')).toBe('https://host/otlp/v1/metrics');
    expect(buildMetricsUrl('https://host/otlp/')).toBe('https://host/otlp/v1/metrics');
  });

  it('leaves an already-complete metrics URL untouched', () => {
    expect(buildMetricsUrl('https://host/otlp/v1/metrics')).toBe('https://host/otlp/v1/metrics');
  });
});

describe('snapshotToOtlpJson', () => {
  it('maps counters to monotonic cumulative sums and histograms to OTLP histograms + gauges', () => {
    const payload = snapshotToOtlpJson(snapshot(), 'kestrel', '1700000000000000000') as {
      resourceMetrics: Array<{
        resource: { attributes: Array<{ key: string; value: { stringValue: string } }> };
        scopeMetrics: Array<{ scope: { name: string }; metrics: Array<Record<string, unknown>> }>;
      }>;
    };

    expect(payload.resourceMetrics[0]?.resource.attributes).toContainEqual({
      key: 'service.name',
      value: { stringValue: 'kestrel' },
    });
    const metrics = payload.resourceMetrics[0]?.scopeMetrics[0]?.metrics ?? [];
    const names = metrics.map((m) => m.name).sort();
    expect(names).toEqual([
      'chat_turn_total',
      'total_latency_ms',
      'total_latency_ms_avg',
      'total_latency_ms_max',
      'total_latency_ms_min',
    ]);

    const counter = metrics.find((m) => m.name === 'chat_turn_total') as {
      sum: { isMonotonic: boolean; aggregationTemporality: number; dataPoints: Array<{ asInt: string }> };
    };
    expect(counter.sum.isMonotonic).toBe(true);
    expect(counter.sum.aggregationTemporality).toBe(2);
    expect(counter.sum.dataPoints[0]?.asInt).toBe('3');

    const hist = metrics.find((m) => m.name === 'total_latency_ms') as {
      histogram: {
        aggregationTemporality: number;
        dataPoints: Array<{
          count: string;
          sum: number;
          bucketCounts: string[];
          explicitBounds: number[];
        }>;
      };
    };
    expect(hist.histogram.aggregationTemporality).toBe(2);
    expect(hist.histogram.dataPoints[0]?.count).toBe('2');
    expect(hist.histogram.dataPoints[0]?.sum).toBe(600);
    // Cumulative buckets: 100 and 500 land in le=100/500, both in le=1000.
    expect(hist.histogram.dataPoints[0]?.explicitBounds).toHaveLength(16);
    expect(hist.histogram.dataPoints[0]?.bucketCounts[5]).toBe('1'); // le=100
    expect(hist.histogram.dataPoints[0]?.bucketCounts[7]).toBe('1'); // le=500
    expect(hist.histogram.dataPoints[0]?.bucketCounts[8]).toBe('2'); // le=1000
  });
});

describe('exportMetricsToOtlp + flushMetrics', () => {
  it('posts JSON with the bearer token to the metrics endpoint', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    await exportMetricsToOtlp(snapshot(), {
      endpoint: 'https://host/otlp',
      apiKey: 'secret',
    }, fetchFn as unknown as typeof fetch, '1700000000000000000');

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe('https://host/otlp/v1/metrics');
    expect(init.headers.authorization).toBe('Bearer secret');
    expect(JSON.parse(init.body).resourceMetrics).toHaveLength(1);
  });

  it('throws on a non-2xx response', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    await expect(exportMetricsToOtlp(snapshot(), {
      endpoint: 'https://host/otlp',
      apiKey: 'bad',
    }, fetchFn as unknown as typeof fetch)).rejects.toThrow('HTTP 401');
  });

  it('flushMetrics no-ops when credentials are absent', async () => {
    const fetchFn = vi.fn();
    await flushMetrics({}, fetchFn as unknown as typeof fetch);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('flushMetrics swallows transport errors (fail-closed)', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(flushMetrics({
      GRAFANA_CLOUD_OTLP_ENDPOINT: 'https://host/otlp',
      GRAFANA_CLOUD_API_KEY: 'key',
    }, fetchFn as unknown as typeof fetch)).resolves.toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Prometheus remote-write transport                                         */
/*                                                                             */
/* A small wire-format decoder backs these tests so the hand-rolled protobuf   */
/* encoder is verified against the real on-the-wire bytes, not just itself.   */
/* --------------------------------------------------------------------------- */

interface RwLabel { name: string; value: string }

interface RwSample { value: number; timestampMs: number }

interface RwSeries { labels: RwLabel[]; samples: RwSample[] }

function readVarint(bytes: Uint8Array, pos: { i: number }): number {
  let result = 0n;
  let shift = 0n;
  for (;;) {
    const byte = bytes[pos.i];
    if (byte === undefined) throw new Error('varint past end of buffer');
    pos.i += 1;
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return Number(result);
    shift += 7n;
  }
}

function parseLabels(bytes: Uint8Array): RwLabel[] {
  // A Label message is `field 1 = name string, field 2 = value string`.
  const decoded = new TextDecoder();
  const labels: RwLabel[] = [];
  const pos = { i: 0 };
  while (pos.i < bytes.length) {
    const tag = readVarint(bytes, pos);
    const field = tag >> 3;
    const wire = tag & 7;
    if (wire !== 2) throw new Error(`unexpected label field wire ${wire}`);
    const len = readVarint(bytes, pos);
    const text = decoded.decode(bytes.subarray(pos.i, pos.i + len));
    pos.i += len;
    if (field === 1) labels.push({ name: text, value: '' });
    else if (field === 2 && labels.length > 0) labels[labels.length - 1]!.value = text;
  }
  return labels;
}

function parseSamples(bytes: Uint8Array): RwSample[] {
  const samples: RwSample[] = [];
  const pos = { i: 0 };
  while (pos.i < bytes.length) {
    const tag = readVarint(bytes, pos);
    const field = tag >> 3;
    const wire = tag & 7;
    if (field === 1 && wire === 1) {
      const view = new DataView(bytes.buffer, bytes.byteOffset + pos.i, 8);
      samples.push({ value: view.getFloat64(0, true), timestampMs: 0 });
      pos.i += 8;
    } else if (field === 2 && wire === 0) {
      samples[samples.length - 1]!.timestampMs = readVarint(bytes, pos);
    } else {
      throw new Error(`unexpected sample field ${field}/${wire}`);
    }
  }
  return samples;
}

function parseTimeSeries(bytes: Uint8Array): RwSeries {
  const labels: RwLabel[] = [];
  const samples: RwSample[] = [];
  const pos = { i: 0 };
  while (pos.i < bytes.length) {
    const tag = readVarint(bytes, pos);
    const field = tag >> 3;
    const wire = tag & 7;
    if (field === 1 && wire === 2) {
      const len = readVarint(bytes, pos);
      labels.push(...parseLabels(bytes.subarray(pos.i, pos.i + len)));
      pos.i += len;
    } else if (field === 2 && wire === 2) {
      const len = readVarint(bytes, pos);
      samples.push(...parseSamples(bytes.subarray(pos.i, pos.i + len)));
      pos.i += len;
    } else {
      throw new Error(`unexpected timeseries field ${field}/${wire}`);
    }
  }
  return { labels, samples };
}

function parseWriteRequest(buffer: Uint8Array): RwSeries[] {
  const bytes = snappyUncompress(buffer);
  const series: RwSeries[] = [];
  const pos = { i: 0 };
  while (pos.i < bytes.length) {
    const tag = readVarint(bytes, pos);
    const field = tag >> 3;
    const wire = tag & 7;
    if (field === 1 && wire === 2) {
      const len = readVarint(bytes, pos);
      series.push(parseTimeSeries(bytes.subarray(pos.i, pos.i + len)));
      pos.i += len;
    } else {
      throw new Error(`unexpected write-request field ${field}/${wire}`);
    }
  }
  return series;
}

describe('grafanaRemoteWriteConfigFromEnv', () => {
  it('returns null when any required value is missing', () => {
    expect(grafanaRemoteWriteConfigFromEnv({})).toBeNull();
    expect(grafanaRemoteWriteConfigFromEnv({
      GRAFANA_CLOUD_RW_ENDPOINT: 'https://x/api/prom/push',
    })).toBeNull();
    expect(grafanaRemoteWriteConfigFromEnv({
      GRAFANA_CLOUD_RW_ENDPOINT: 'https://x/api/prom/push',
      GRAFANA_CLOUD_METRICS_INSTANCE_ID: '42',
    })).toBeNull();
  });

  it('returns a config when endpoint, instance id and api key are present', () => {
    expect(grafanaRemoteWriteConfigFromEnv({
      GRAFANA_CLOUD_RW_ENDPOINT: ' https://x/api/prom/push ',
      GRAFANA_CLOUD_METRICS_INSTANCE_ID: ' 3508468 ',
      GRAFANA_CLOUD_API_KEY: ' glc_x ',
    })).toEqual({
      endpoint: 'https://x/api/prom/push',
      instanceId: '3508468',
      apiKey: 'glc_x',
    });
  });
});

describe('snapshotToPromRemoteWrite', () => {
  it('encodes a valid snappy protobuf request with labels and samples', () => {
    const ts = 1_700_000_000_000; // ms
    const series = parseWriteRequest(snapshotToPromRemoteWrite(snapshot(), 'kestrel', ts));

    // 1 counter + 5 summary fields + 16 bucket bounds + +Inf = 23 series.
    expect(series).toHaveLength(23);
    const names = series.map((s) => s.labels.find((l) => l.name === '__name__')?.value);
    const unique = [...new Set(names)].sort();
    expect(unique).toContain('chat_turn_total');
    expect(unique).toContain('total_latency_ms_avg');
    expect(unique).toContain('total_latency_ms_count');
    expect(unique).toContain('total_latency_ms_max');
    expect(unique).toContain('total_latency_ms_min');
    expect(unique).toContain('total_latency_ms_sum');
    expect(unique).toContain('total_latency_ms_bucket');

    for (const s of series) {
      expect(s.labels).toContainEqual({ name: 'job', value: 'kestrel' });
      expect(s.samples).toHaveLength(1);
      expect(s.samples[0]!.timestampMs).toBe(ts);
    }

    const counter = series.find((s) =>
      s.labels.some((l) => l.name === '__name__' && l.value === 'chat_turn_total'))!;
    expect(counter.samples[0]!.value).toBe(3);

    const sum = series.find((s) =>
      s.labels.some((l) => l.name === '__name__' && l.value === 'total_latency_ms_sum'))!;
    expect(sum.samples[0]!.value).toBe(600);

    // Bucket series follow the Prometheus convention: cumulative `le` labels.
    const bucket = (le: string) => series.find((s) =>
      s.labels.some((l) => l.name === '__name__' && l.value === 'total_latency_ms_bucket') &&
      s.labels.some((l) => l.name === 'le' && l.value === le))!;
    expect(bucket('100').samples[0]!.value).toBe(1);
    expect(bucket('500').samples[0]!.value).toBe(1);
    expect(bucket('1000').samples[0]!.value).toBe(2);
    expect(bucket('+Inf').samples[0]!.value).toBe(2);
  });

  it('splits tagged registry keys into proper name + labels (regression: literal {k=v} in __name__)', () => {
    const ts = 1_700_000_000_000;
    const series = parseWriteRequest(snapshotToPromRemoteWrite({
      counters: { 'chat_turn_total{result=ok}': 7 },
      histograms: {},
    }, 'kestrel', ts));

    expect(series).toHaveLength(1);
    const s = series[0]!;
    expect(s.labels).toContainEqual({ name: '__name__', value: 'chat_turn_total' });
    expect(s.labels).toContainEqual({ name: 'result', value: 'ok' });
    expect(s.labels).toContainEqual({ name: 'job', value: 'kestrel' });
    expect(s.samples[0]!.value).toBe(7);
  });

  it('returns an empty buffer for an empty snapshot', () => {
    expect(parseSnapshotKey('plain_name')).toEqual({ name: 'plain_name', labels: [] });
    expect(parseSnapshotKey('chat_turn_total{result=ok}')).toEqual({
      name: 'chat_turn_total',
      labels: [['result', 'ok']],
    });
    expect(snapshotToPromRemoteWrite({ counters: {}, histograms: {} }, 'kestrel').length).toBe(0);
  });
});

describe('exportMetricsToRemoteWrite + flushMetrics', () => {
  it('posts snappy protobuf with basic auth to the push endpoint', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    await exportMetricsToRemoteWrite(snapshot(), {
      endpoint: 'https://metrics.example/api/prom/push/',
      instanceId: '3508468',
      apiKey: 'glc_secret',
    }, fetchFn as unknown as typeof fetch, 1_700_000_000_000);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: Buffer },
    ];
    expect(url).toBe('https://metrics.example/api/prom/push');
    expect(init.headers['content-type']).toBe('application/x-protobuf');
    expect(init.headers['content-encoding']).toBe('snappy');
    const expected = Buffer.from('3508468:glc_secret').toString('base64');
    expect(init.headers.authorization).toBe(`Basic ${expected}`);
    // Same 23-series encoding as snapshotToPromRemoteWrite (buckets included).
    expect(parseWriteRequest(init.body)).toHaveLength(23);
  });

  it('does not POST when the snapshot is empty', async () => {
    const fetchFn = vi.fn();
    await exportMetricsToRemoteWrite({ counters: {}, histograms: {} }, {
      endpoint: 'https://metrics.example/api/prom/push',
      instanceId: '42',
      apiKey: 'glc_x',
    }, fetchFn as unknown as typeof fetch);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('flushMetrics pushes over remote write when only RW is configured', async () => {
    metrics.increment('chat_turn_total', { by: 2 });
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    await flushMetrics({
      GRAFANA_CLOUD_RW_ENDPOINT: 'https://x/api/prom/push',
      GRAFANA_CLOUD_METRICS_INSTANCE_ID: '3508468',
      GRAFANA_CLOUD_API_KEY: 'glc_x',
    }, fetchFn as unknown as typeof fetch);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url] = fetchFn.mock.calls[0] as [string];
    expect(url).toContain('/api/prom/push');
  });

  it('flushMetrics pushes over both transports when both are configured', async () => {
    metrics.increment('chat_turn_total', { by: 2 });
    metrics.observe('total_latency_ms', 250);
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    await flushMetrics({
      GRAFANA_CLOUD_OTLP_ENDPOINT: 'https://host/otlp',
      GRAFANA_CLOUD_RW_ENDPOINT: 'https://x/api/prom/push',
      GRAFANA_CLOUD_METRICS_INSTANCE_ID: '3508468',
      GRAFANA_CLOUD_API_KEY: 'glc_x',
    }, fetchFn as unknown as typeof fetch);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    const urls = (fetchFn.mock.calls as Array<[string]>).map(([url]) => url);
    expect(urls).toContain('https://host/otlp/v1/metrics');
    expect(urls).toContain('https://x/api/prom/push');
  });

  it('flushMetrics swallows remote-write errors (fail-closed)', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(flushMetrics({
      GRAFANA_CLOUD_RW_ENDPOINT: 'https://x/api/prom/push',
      GRAFANA_CLOUD_METRICS_INSTANCE_ID: '3508468',
      GRAFANA_CLOUD_API_KEY: 'glc_x',
    }, fetchFn as unknown as typeof fetch)).resolves.toBeUndefined();
  });

  it('counts transport failures so the flush SLI can surface outages', async () => {
    const before = metrics.snapshot().counters['metrics_flush_failed_total'] ?? 0;
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));
    // One failing transport each — both must be counted without throwing.
    await flushMetrics({
      GRAFANA_CLOUD_RW_ENDPOINT: 'https://x/api/prom/push',
      GRAFANA_CLOUD_METRICS_INSTANCE_ID: '3508468',
      GRAFANA_CLOUD_API_KEY: 'glc_x',
    }, fetchFn as unknown as typeof fetch);
    await flushMetrics({
      GRAFANA_CLOUD_OTLP_ENDPOINT: 'https://host/otlp',
      GRAFANA_CLOUD_API_KEY: 'glc_x',
    }, fetchFn as unknown as typeof fetch);
    const after = metrics.snapshot().counters['metrics_flush_failed_total'] ?? 0;
    expect(after - before).toBe(2);
  });
});
