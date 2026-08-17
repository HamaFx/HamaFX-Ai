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

/**
 * Dependency-free OTLP/HTTP metrics exporter.
 *
 * Pushes a `MetricsSnapshot` to a Grafana Cloud (or any OTLP-HTTP) endpoint
 * using a single `fetch` POST. There is intentionally no OpenTelemetry SDK
 * dependency here — the in-process registry in `metrics.ts` is already
 * vendor-neutral, and a raw OTLP JSON POST is enough to satisfy Grafana Cloud
 * metrics ingestion.
 *
 * Fail-closed by design (matching `initLangfuse`): when the Grafana env vars
 * are absent, or the POST fails, nothing is thrown to the caller. The app runs
 * exactly as before; metrics simply stay in-process.
 */

import { compress as snappyCompress } from 'snappyjs';
import { metrics, type MetricsSnapshot } from './metrics';

/** Env var names (single source of truth for docs + callers). */
export const GRAFANA_OTLP_ENDPOINT_ENV = 'GRAFANA_CLOUD_OTLP_ENDPOINT' as const;
export const GRAFANA_OTLP_API_KEY_ENV = 'GRAFANA_CLOUD_API_KEY' as const;

/** Prometheus remote-write transport (fallback when the OTLP gateway can't map the stack). */
export const GRAFANA_RW_ENDPOINT_ENV = 'GRAFANA_CLOUD_RW_ENDPOINT' as const;
export const GRAFANA_RW_INSTANCE_ID_ENV = 'GRAFANA_CLOUD_METRICS_INSTANCE_ID' as const;

/** OTLP aggregation-temporality enum value for cumulative metrics. */
const AGGREGATION_TEMPORALITY_CUMULATIVE = 2;

export interface GrafanaOtlpConfig {
  /** Full OTLP base URL, e.g. `https://otlp-gateway-…-…-….grafana.net/otlp`. */
  endpoint: string;
  /** Grafana Cloud token with `metrics:write` scope. */
  apiKey: string;
  /** OTLP resource `service.name` label. Defaults to `kestrel`. */
  serviceName?: string;
}

/**
 * Read Grafana Cloud OTLP config from the environment. Returns `null` when
 * either value is missing so callers can skip the push entirely.
 */
export function grafanaOtlpConfigFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): GrafanaOtlpConfig | null {
  const endpoint = (env[GRAFANA_OTLP_ENDPOINT_ENV] ?? '').trim();
  const apiKey = (env[GRAFANA_OTLP_API_KEY_ENV] ?? '').trim();
  if (!endpoint || !apiKey) return null;
  return { endpoint, apiKey };
}

/** Append the metrics path unless the endpoint already targets it. */
export function buildMetricsUrl(endpoint: string): string {
  const base = endpoint.replace(/\/+$/, '');
  if (base.endsWith('/v1/metrics')) return base;
  return `${base}/v1/metrics`;
}

interface OtlpKeyValue {
  key: string;
  value: { stringValue: string };
}

interface OtlpNumberDataPoint {
  timeUnixNano: string;
  asInt?: string;
  asDouble?: number;
}

function intPoint(value: number, nowNs: string): OtlpNumberDataPoint {
  return { asInt: String(Math.round(value)), timeUnixNano: nowNs };
}

function doublePoint(value: number, nowNs: string): OtlpNumberDataPoint {
  return { asDouble: value, timeUnixNano: nowNs };
}

/** Convert the in-process snapshot into an OTLP `ExportMetricsServiceRequest`. */
export function snapshotToOtlpJson(
  snapshot: MetricsSnapshot,
  serviceName: string,
  nowNs: string,
): unknown {
  const metricsOut: unknown[] = [];

  for (const [name, value] of Object.entries(snapshot.counters)) {
    metricsOut.push({
      name,
      sum: {
        dataPoints: [intPoint(value, nowNs)],
        aggregationTemporality: AGGREGATION_TEMPORALITY_CUMULATIVE,
        isMonotonic: true,
      },
    });
  }

  // Histogram summaries are emitted as per-field gauges (count/sum/avg/min/max)
  // so no value is dropped and Grafana can query each directly.
  for (const [name, summary] of Object.entries(snapshot.histograms)) {
    metricsOut.push(
      { name: `${name}_count`, gauge: { dataPoints: [intPoint(summary.count, nowNs)] } },
      { name: `${name}_sum`, gauge: { dataPoints: [doublePoint(summary.sum, nowNs)] } },
      { name: `${name}_avg`, gauge: { dataPoints: [doublePoint(summary.avg, nowNs)] } },
      { name: `${name}_min`, gauge: { dataPoints: [doublePoint(summary.min, nowNs)] } },
      { name: `${name}_max`, gauge: { dataPoints: [doublePoint(summary.max, nowNs)] } },
    );
  }

  const resourceAttributes: OtlpKeyValue[] = [
    { key: 'service.name', value: { stringValue: serviceName } },
  ];

  return {
    resourceMetrics: [
      {
        resource: { attributes: resourceAttributes },
        scopeMetrics: [
          {
            scope: { name: 'kestrel' },
            metrics: metricsOut,
          },
        ],
      },
    ],
  };
}

/**
 * POST one snapshot to the configured OTLP endpoint. Throws on transport or
 * non-2xx errors so the fail-closed `flushMetrics` wrapper can swallow them.
 */
export async function exportMetricsToOtlp(
  snapshot: MetricsSnapshot,
  config: GrafanaOtlpConfig,
  fetchFn: typeof fetch = fetch,
  nowNs: string = String(BigInt(Date.now()) * 1_000_000n),
): Promise<void> {
  const url = buildMetricsUrl(config.endpoint);
  const body = JSON.stringify(snapshotToOtlpJson(snapshot, config.serviceName ?? 'kestrel', nowNs));
  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body,
  });
  if (!response.ok) {
    throw new Error(`OTLP metrics push failed: HTTP ${response.status}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Prometheus remote-write transport (protobuf + snappy)                      */
/*                                                                             */
/* Some Grafana Cloud stacks cannot map OTLP-gateway auth to the tenant (the  */
/* "legacy auth cannot be upgraded because the host is not found" platform   */
/* bug). The hosted-Metrics remote-write door (`/api/prom/push`) always       */
/* accepts the same `metrics:write` Cloud API key via Basic auth, so this     */
/* transport is the dependable path for those stacks.                         */
/* --------------------------------------------------------------------------- */

export interface GrafanaRemoteWriteConfig {
  /** Full push URL, e.g. `https://prometheus-prod-…-….grafana.net/api/prom/push`. */
  endpoint: string;
  /** Hosted-Metrics instance ID — the Basic auth username. */
  instanceId: string;
  /** Grafana Cloud token with `metrics:write` scope. */
  apiKey: string;
  /** Prometheus `job` label. Defaults to `kestrel`. */
  job?: string;
}

/** Remote-write config from env; `null` when any value is missing. */
export function grafanaRemoteWriteConfigFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): GrafanaRemoteWriteConfig | null {
  const endpoint = (env[GRAFANA_RW_ENDPOINT_ENV] ?? '').trim();
  const instanceId = (env[GRAFANA_RW_INSTANCE_ID_ENV] ?? '').trim();
  const apiKey = (env[GRAFANA_OTLP_API_KEY_ENV] ?? '').trim();
  if (!endpoint || !instanceId || !apiKey) return null;
  return { endpoint, instanceId, apiKey };
}

/* Protobuf helpers — the remote-write wire format is tiny, so the encoder is
 * hand-rolled instead of pulling in a protobuf runtime. */

function protoVarint(value: number, out: number[]): void {
  let v = value >>> 0;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
}

function protoVarint64(value: number, out: number[]): void {
  // ms-since-epoch timestamps overflow 32-bit math, so encode via BigInt.
  let v = BigInt(Math.trunc(value));
  while (v >= 0x80n) {
    out.push(Number(v & 0x7fn) | 0x80);
    v >>= 7n;
  }
  out.push(Number(v));
}

function protoBytes(tag: number, data: Uint8Array, out: number[]): void {
  protoVarint((tag << 3) | 2, out);
  protoVarint(data.length, out);
  for (let i = 0; i < data.length; i++) out.push(data[i]!);
}

function protoDouble(tag: number, value: number, out: number[]): void {
  protoVarint((tag << 3) | 1, out);
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, true);
  for (let i = 0; i < 8; i++) out.push(view.getUint8(i));
}

const ASCII = new TextEncoder();

function encodeLabel(name: string, value: string, out: number[]): void {
  protoBytes(1, ASCII.encode(name), out);
  protoBytes(2, ASCII.encode(value), out);
}

function encodeSample(value: number, timestampMs: number, out: number[]): void {
  protoDouble(1, value, out); // Sample.value (double, wire type 1)
  protoVarint(2 << 3, out); // Sample.timestamp tag
  protoVarint64(timestampMs, out);
}

/**
 * Convert a snapshot into a snappy-compressed Prometheus remote-write
 * request body from `prometheus.WriteRequest` (timeseries → labels/samples).
 * Counters keep their cumulative value; histogram fields are emitted as
 * `{name}_count/_sum/_avg/_min/_max` gauges (matching the OTLP transport so
 * dashboards can query either backend with the same metric names). Returns an
 * empty buffer when the snapshot has nothing to report.
 */
export function snapshotToPromRemoteWrite(
  snapshot: MetricsSnapshot,
  job: string,
  timestampMs: number = Date.now(),
): Buffer {
  /** Metrics to emit, each with its cumulative sample value(s). */
  const pending: Array<{
    name: string;
    samples: Array<{ value: number; timestampMs: number }>;
  }> = [];

  for (const [name, value] of Object.entries(snapshot.counters)) {
    pending.push({ name, samples: [{ value, timestampMs }] });
  }
  for (const [name, summary] of Object.entries(snapshot.histograms)) {
    pending.push(
      { name: `${name}_count`, samples: [{ value: summary.count, timestampMs }] },
      { name: `${name}_sum`, samples: [{ value: summary.sum, timestampMs }] },
      { name: `${name}_avg`, samples: [{ value: summary.avg, timestampMs }] },
      { name: `${name}_min`, samples: [{ value: summary.min, timestampMs }] },
      { name: `${name}_max`, samples: [{ value: summary.max, timestampMs }] },
    );
  }

  if (pending.length === 0) return Buffer.alloc(0);

  const request: number[] = [];
  for (const metric of pending) {
    const ts: number[] = [];
    // Each label pair is its own Label message, wrapped in TimeSeries field 1.
    for (const [name, value] of [['__name__', metric.name], ['job', job ?? 'kestrel']] as const) {
      const labelMsg: number[] = [];
      encodeLabel(name, value, labelMsg);
      protoBytes(1, Uint8Array.from(labelMsg), ts);
    }
    for (const sample of metric.samples) {
      const sampleMsg: number[] = [];
      encodeSample(sample.value, sample.timestampMs, sampleMsg);
      protoBytes(2, Uint8Array.from(sampleMsg), ts);
    }
    protoBytes(1, Uint8Array.from(ts), request);
  }
  return snappyCompress(Uint8Array.from(request));
}

/**
 * POST one snapshot to the metrics remote-write endpoint. Throws on
 * transport or non-2xx errors so the fail-closed `flushMetrics` can swallow.
 */
export async function exportMetricsToRemoteWrite(
  snapshot: MetricsSnapshot,
  config: GrafanaRemoteWriteConfig,
  fetchFn: typeof fetch = fetch,
  timestampMs: number = Date.now(),
): Promise<void> {
  const body = snapshotToPromRemoteWrite(snapshot, config.job ?? 'kestrel', timestampMs);
  if (body.length === 0) return; // nothing to report
  const url = config.endpoint.replace(/\/+$/, '');
  const basic = Buffer.from(`${config.instanceId}:${config.apiKey}`).toString('base64');
  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-protobuf',
      'content-encoding': 'snappy',
      'user-agent': 'kestrel-metrics-exporter',
      authorization: `Basic ${basic}`,
    },
    body: body as BodyInit,
  });
  if (!response.ok) {
    throw new Error(`Prometheus remote-write push failed: HTTP ${response.status}`);
  }
}

/**
 * Push the process-wide registry to Grafana Cloud over every configured
 * transport (OTLP JSON + Prometheus remote write). Never throws and no-ops
 * when no credentials are present — safe to call at stream end, on a timer,
 * or in a shutdown hook.
 */
export async function flushMetrics(
  env: Readonly<Record<string, string | undefined>> = process.env,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const otlp = grafanaOtlpConfigFromEnv(env);
  const remoteWrite = grafanaRemoteWriteConfigFromEnv(env);
  if (!otlp && !remoteWrite) return;
  const snapshot = metrics.snapshot();
  if (otlp) {
    try {
      await exportMetricsToOtlp(snapshot, otlp, fetchFn);
    } catch {
      // Fail-closed: an observability outage must never fail the request —
      // but count it so the flush-failure SLI can surface the outage.
      metrics.increment('metrics_flush_failed_total');
    }
  }
  if (remoteWrite) {
    try {
      await exportMetricsToRemoteWrite(snapshot, remoteWrite, fetchFn);
    } catch {
      metrics.increment('metrics_flush_failed_total');
    }
  }
}
