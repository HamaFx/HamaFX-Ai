// Structured logger for the worker. JSON output by default so journald +
// Sentry breadcrumbs can index by tag. Plain-text output in `development`
// for ergonomic local dev.
//
// We deliberately avoid pulling in pino / winston — the worker stays free
// of large deps. Three log levels (info / warn / error) cover the entire
// surface; journald handles rotation.

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
  if (pretty) {
    const tags = Object.entries(meta)
      .filter(([k]) => k !== 'service')
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(' ');
    const service = String(meta['service'] ?? '');
    const prefix = `[${level}]${service ? ` ${service}` : ''}`;
    const line = `${nowIso()} ${prefix} ${msg}${tags ? ` ${tags}` : ''}`;
    // eslint-disable-next-line no-console
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info'](line);
    return;
  }
  const line = { ts: nowIso(), level, msg, ...meta };
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
  const pretty = !opts.forceJson && process.env.NODE_ENV !== 'production';
  return makeLogger(baseTags, pretty);
}
