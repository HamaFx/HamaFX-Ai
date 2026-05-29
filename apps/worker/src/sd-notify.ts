// Minimal sd_notify(3) client.
//
// Talks to systemd via the `systemd-notify` CLI tool, which is part of
// the systemd package and ships on every host that actually has a
// running PID 1 of systemd. We do this instead of speaking the unix
// datagram protocol directly because Node's `dgram` module doesn't
// natively support `AF_UNIX` sockets — getting it to work requires a
// native binding and we'd rather not pull one in for half a dozen
// syscalls per minute.
//
// `notifyWatchdog()` is throttled to once per 30 s so the tick rate
// (1 Hz × 3 symbols) doesn't fork a child process on every callback.
//
// References:
//   - https://www.freedesktop.org/software/systemd/man/sd_notify.html
//   - hamafx-worker.service uses `Type=notify` + `WatchdogSec=120`; the
//     bootstrap sends `READY=1` once the SignalR consumer is connected,
//     and the tick handler sends `WATCHDOG=1` to keep the timer alive.
//
// Phase 2 hardening §1.

import { execFile } from 'node:child_process';

function isAvailable(): boolean {
  // The systemd-notify CLI looks at $NOTIFY_SOCKET to find the running
  // service manager. If that env var is absent we're either running
  // outside systemd (dev / test / non-Linux) or the unit didn't pass
  // `NotifyAccess=main`. Either way, sd_notify is a no-op and we
  // shouldn't fork a child process.
  return Boolean(process.env.NOTIFY_SOCKET);
}

function sendMessage(message: string): void {
  if (!isAvailable()) return;
  // Fire and forget. systemd-notify exits with 0 when the message was
  // queued and prints to stderr on failure. We don't care either way:
  // a missed notification means the watchdog times out, which is the
  // exact behaviour we want when the worker is genuinely hung.
  execFile('systemd-notify', [message], { timeout: 1_000 }, () => undefined);
}

let lastWatchdogAt = 0;
const WATCHDOG_THROTTLE_MS = 30_000;

/**
 * Tell systemd the worker is alive. Throttled to once per 30 s so the
 * tick rate (~1 Hz × 3 symbols) doesn't fork `systemd-notify` on every
 * callback. Pair with `WatchdogSec=120` in the unit file so a 4×
 * safety margin lets us miss a couple of pings without being killed,
 * but a genuine hang (no ticks for 2 minutes) triggers a restart.
 */
export function notifyWatchdog(): void {
  const now = Date.now();
  if (now - lastWatchdogAt < WATCHDOG_THROTTLE_MS) return;
  lastWatchdogAt = now;
  sendMessage('WATCHDOG=1');
}

/** Tell systemd the worker has finished bootstrapping. Send once. */
export function notifyReady(): void {
  sendMessage('READY=1');
}

/** Tell systemd the worker is stopping. */
export function notifyStopping(): void {
  sendMessage('STOPPING=1');
}

/**
 * Send a free-form status string (rendered by `systemctl status`).
 * Useful for surfacing the SignalR connection state at a glance.
 */
export function notifyStatus(status: string): void {
  const safe = status.replace(/[\r\n]/g, ' ').slice(0, 200);
  sendMessage(`STATUS=${safe}`);
}
