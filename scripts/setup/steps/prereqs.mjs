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

import {
  getDockerInfo,
  getGitInfo,
  getNodeInfo,
  getPackageManager,
  MIN_NODE_MAJOR,
  packageManagerLabel,
} from '../lib/prereqs.mjs';
import { fail, ok, paint } from '../lib/ui.mjs';

export const title = 'Checking what is available on this computer';

export function run(ctx) {
  const { io } = ctx;
  const node = getNodeInfo();
  const pnpm = getPackageManager();
  const git = getGitInfo();
  const docker = getDockerInfo();

  if (node.ok) ok(io, `Node.js ${paint(node.version ?? '', 'dim')}`);
  else
    fail(
      io,
      `Node.js ${MIN_NODE_MAJOR}+ is required${node.version ? ` (found ${node.version})` : ''}`,
    );

  if (pnpm) ok(io, `${packageManagerLabel(pnpm)} available`);
  else
    io.line(
      `  ${paint('○', 'gray')} pnpm ${paint('not found (only needed for Simple mode)', 'dim')}`,
    );

  if (git.present) ok(io, `Git ${paint(git.version ?? '', 'dim')}`);
  else
    io.line(
      `  ${paint('○', 'gray')} Git ${paint('not found (not needed when using a downloaded folder)', 'dim')}`,
    );

  if (docker.ready) ok(io, `Docker ${paint(docker.version ?? '', 'dim')} is running`);
  else if (docker.installed) {
    io.line(
      `  ${paint('⚠', 'yellow')} Docker is installed but not running — start Docker Desktop for Full mode`,
    );
  } else {
    io.line(
      `  ${paint('○', 'gray')} Docker ${paint('not found (needed only for Full mode)', 'dim')}`,
    );
  }

  ctx.prereqs = { node, pnpm, git, docker };

  if (!node.ok) {
    io.line();
    fail(io, `Node.js ${MIN_NODE_MAJOR} or newer is required. Install it, then run setup again.`);
    io.line(`    ${paint('Install:', 'dim')} https://nodejs.org/`);
    return 'abort';
  }
  return 'ok';
}
