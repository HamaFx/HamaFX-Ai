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

// Structured logger for the worker. JSON output by default so journald +
// Sentry breadcrumbs can index by tag. Plain-text output in `development`
// for ergonomic local dev.
//
// We deliberately avoid pulling in pino / winston — the worker stays free
// of large deps. Three log levels (info / warn / error) cover the entire
// surface; journald handles rotation.
//
// OBS-09 (Phase 5.3): Aligned field shape with the shared pino logger.
// The shared logger emits `{level, time, msg, ...meta}` (pino default).
// We now emit `{ts, level, msg, service, ...meta}` — `ts` is kept for
// backward compatibility with existing journald parsers, and redaction
// paths have been added to match the pino logger's redact config.

const REDACT_KEYS = new Set([
  'authorization',
  'cookie',
  'password',
  'hashedPassword',
  'email',
  'token',
  'keys',
  'aiApiKeys',
  'apiKey',
  'secret',
  'accessToken',
  'refreshToken',
]);

function redactMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (REDACT_KEYS.has(k) || REDACT_KEYS.has(k.toLowerCase())) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

type Level = 'info' | 'warn' | 'error';

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  /** Returns a child logger that merges `tags` into every line. */
  with(tags: Record<string, unknown>): Logger;
}

export interface LoggerOptions {
  /** 'worker' | 'worker:signalr' | 'worker:job:embedding-backfill' | … */
  service: string;
  /** Commit SHA of the running build — surfaced on every line. */
  commit?: string;
  /** Force JSON output even in NODE_ENV=development (used by tests). */
  forceJson?: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function emit(level: Level, msg: string, meta: Record<string, unknown>, pretty: boolean): void {
  // OBS-09 (Phase 5.3): Redact sensitive keys before emitting
  const safeMeta = redactMeta(meta);
  if (pretty) {
    const tags = Object.entries(safeMeta)
      .filter(([k]) => k !== 'service')
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(' ');
    const service = String(safeMeta['service'] ?? '');
    const prefix = `[${level}]${service ? ` ${service}` : ''}`;
    const line = `${nowIso()} ${prefix} ${msg}${tags ? ` ${tags}` : ''}`;
    // eslint-disable-next-line no-console
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info'](line);
    return;
  }
  const line = { ts: nowIso(), level, msg, ...safeMeta };
  // eslint-disable-next-line no-console
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info'](
    JSON.stringify(line),
  );
}

function makeLogger(baseTags: Record<string, unknown>, pretty: boolean): Logger {
  function log(level: Level, msg: string, meta: Record<string, unknown> = {}): void {
    emit(level, msg, { ...baseTags, ...meta }, pretty);
  }
  return {
    info: (msg, meta) => log('info', msg, meta),
    warn: (msg, meta) => log('warn', msg, meta),
    error: (msg, meta) => log('error', msg, meta),
    with: (extraTags) => makeLogger({ ...baseTags, ...extraTags }, pretty),
  };
}

export function createLogger(opts: LoggerOptions): Logger {
  const baseTags: Record<string, unknown> = { service: opts.service };
  if (opts.commit) baseTags['commit'] = opts.commit;
  // Phase 3 hardening §12 — defence in depth. The systemd unit sets
  // `NODE_ENV=production`, but if a future operator forgets to do
  // that for a new unit we still want JSON output under journald.
  // systemd exports `JOURNAL_STREAM=<dev>:<inode>` for any service
  // whose stdout/stderr is connected to journald, which covers every
  // unit in `infra/cron-vm/units/`.
  const underJournald = Boolean(process.env.JOURNAL_STREAM);
  const pretty =
    !opts.forceJson && !underJournald && process.env.NODE_ENV !== 'production';
  return makeLogger(baseTags, pretty);
}
