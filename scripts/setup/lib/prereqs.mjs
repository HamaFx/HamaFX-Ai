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
 * Machine prerequisites: Node, package manager, Git, Docker.
 * Every check is a pure function of the environment so the module is
 * testable; the wizard step calls them and renders the results.
 */

import { execFileSync, execSync } from 'node:child_process';

export const MIN_NODE_MAJOR = 20;

export function hasBin(cmd) {
  try {
    if (process.platform === 'win32') execFileSync('where', [cmd], { stdio: 'ignore' });
    else execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getVersion(cmd, flag = '--version') {
  try {
    return execFileSync(cmd, [flag], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

export function getNodeInfo() {
  const version = getVersion('node') ?? '';
  const major = Number(version.match(/v?(\d+)/)?.[1] ?? 0);
  return { version, major, ok: major >= MIN_NODE_MAJOR };
}

export function getPackageManager() {
  if (hasBin('pnpm')) return { command: 'pnpm', prefix: [] };
  if (hasBin('corepack')) return { command: 'corepack', prefix: ['pnpm'] };
  return null;
}

export function packageManagerLabel(manager) {
  return manager?.command === 'corepack' ? 'corepack pnpm' : 'pnpm';
}

export function getGitInfo() {
  const version = getVersion('git');
  return { present: Boolean(version), version };
}

function canUseDocker() {
  if (!hasBin('docker')) return false;
  try {
    execFileSync('docker', ['compose', 'version'], { stdio: 'ignore', timeout: 5_000 });
    execFileSync('docker', ['info'], { stdio: 'ignore', timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

export function getDockerInfo() {
  const installed = hasBin('docker');
  return { installed, ready: installed && canUseDocker(), version: getVersion('docker') };
}

/** Poll until Docker becomes usable (e.g. Docker Desktop starting up). */
export async function waitForDocker(timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (canUseDocker()) return true;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
  }
  return false;
}
