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
 * Process helpers: spawning install/launch commands, health polling,
 * opening the browser, and validating docker compose configs.
 */

import { execFileSync, spawn } from 'node:child_process';

import { hasBin } from './prereqs.mjs';
import { info } from './ui.mjs';

/** Spawn a child process and resolve when it exits. */
export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: options.stdio ?? 'inherit',
      env: options.env,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

/** Validate that a docker compose file parses. Returns { ok, error }. */
export function checkComposeConfig(cwd) {
  try {
    execFileSync('docker', ['compose', 'config', '--quiet'], { cwd, stdio: 'pipe' });
    return { ok: true, error: null };
  } catch (err) {
    const stderr = err?.stderr?.toString?.() ?? String(err?.message ?? err);
    return { ok: false, error: stderr };
  }
}

/** Poll an HTTP endpoint until it responds OK. */
export async function waitForApp(url, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // server still starting
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
  }
  return false;
}

/** Open a URL in the platform browser; prints the URL on headless boxes. */
export function openBrowser(io, url) {
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else if (hasBin('xdg-open')) {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      info(io, `Open this address in your browser: ${url}`);
    }
  } catch {
    info(io, `Open this address in your browser: ${url}`);
  }
}

/** Mask a sensitive value for display: "abcd••••••wxyz". */
export function maskKey(key) {
  if (!key || key.length < 8) return key;
  return key.slice(0, 4) + '•'.repeat(Math.min(20, key.length - 8)) + key.slice(-4);
}
