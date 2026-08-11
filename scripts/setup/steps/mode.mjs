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

import { getDockerInfo, waitForDocker } from '../lib/prereqs.mjs';
import { confirm, select } from '../lib/prompts.mjs';
import { box, info, note, paint, renderComparison, startSpinner, warn } from '../lib/ui.mjs';

export const title = 'Choose your setup mode';

export const hint = 'Simple = zero-Docker dev box · Full = complete self-hosted stack';

const LOCAL_FEATURES = [
  ['✓', 'Embedded Postgres (PGlite)', 'No Docker needed'],
  ['✓', 'Fast startup & hot reload', 'Best for development'],
  ['✓', 'Full web app + AI chat', '78 API routes'],
  ['✓', 'Auth, journal, alerts', 'Settings, onboarding'],
  ['✗', 'Vector search (RAG)', 'pgvector not in PGlite'],
  ['✗', 'Live market data', 'No worker process'],
  ['✗', 'Langfuse observability', 'Needs Docker'],
];

const DOCKER_FEATURES = [
  ['✓', 'Postgres 16 + pgvector', 'Full RAG & memory'],
  ['✓', 'Worker daemon', 'Live SignalR + crons'],
  ['✓', 'Langfuse UI', 'LLM observability'],
  ['✓', 'All features enabled', 'Production-ready'],
  ['!', 'Slower first start', 'Docker build ~3-5 min'],
  ['!', 'More resource usage', '~2GB RAM recommended'],
];

function featureRow([icon, feat, desc]) {
  const iconPainted =
    icon === '✓' ? paint('✓', 'green') : icon === '!' ? paint('!', 'yellow') : paint('✗', 'red');
  return `${iconPainted}  ${feat.padEnd(28)} ${paint(desc, 'dim')}`;
}

function printModeBoxes(io) {
  box(
    io,
    'Simple mode (lightweight)',
    [
      `${paint('Recommended for:', 'bold')} trying the app quickly`,
      '',
      ...LOCAL_FEATURES.map(featureRow),
      '',
      `${paint('What it does:', 'bold')} runs the app on this computer`,
    ],
    { color: 'cyan', minWidth: 54 },
  );
  io.line();
  box(
    io,
    'Full mode (Docker)',
    [
      `${paint('Recommended for:', 'bold')} a complete self-hosted install`,
      '',
      ...DOCKER_FEATURES.map(featureRow),
      '',
      `${paint('What it does:', 'bold')} runs the complete app automatically`,
    ],
    { color: 'teal', minWidth: 54 },
  );
  io.line();
}

function printByokNote(io, compact) {
  if (compact) {
    info(
      io,
      'BYOK: no server-level AI keys needed — add yours after registering (Settings → API Keys).',
    );
    return;
  }
  note(
    io,
    'Bring Your Own Key (BYOK)',
    [
      'No server-level AI keys are needed to start the app.',
      'After registering, add your AI provider key via the',
      'onboarding wizard or Settings → API Keys.',
      'Your key is encrypted at rest (AES-256-GCM).',
      'Supported: Gemini · Vertex · Anthropic · OpenAI · Groq ·',
      'Mistral · OpenRouter · xAI · DeepSeek · IAMHC API',
    ],
    'cyan',
  );
}

/** Compact two-column comparison used on the full-screen mode page. */
function printCompactComparison(io) {
  const lines = renderComparison({
    leftTitle: 'Simple — lightweight',
    left: [
      ['✓', 'PGlite embedded · no Docker'],
      ['✓', 'Fast startup · hot reload'],
      ['✓', 'Full web app + AI chat'],
      ['✗', 'No vector search (RAG)'],
      ['✗', 'No live market data'],
    ],
    rightTitle: 'Full — Docker stack',
    right: [
      ['✓', 'Postgres 16 + pgvector'],
      ['✓', 'Worker · live market data'],
      ['✓', 'Langfuse observability'],
      ['!', 'First build ~3–5 min'],
    ],
    width: 60,
  });
  for (const line of lines) io.line(`  ${line}`);
  io.line();
}

export async function run(ctx) {
  const { io, flags } = ctx;
  if (ctx.pageMode) printCompactComparison(io);
  else printModeBoxes(io);

  const docker = ctx.prereqs?.docker ?? getDockerInfo();
  const auto = flags.yes || flags.json || !io.isTTY;

  if (flags.mode) {
    let mode = flags.mode;
    if (mode === 'docker') {
      let ready = docker.ready;
      if (!ready && docker.installed) {
        const spinner = startSpinner(io, 'Waiting for Docker Desktop');
        ready = await waitForDocker();
        spinner.stop(ready ? 'Docker Desktop is ready' : null);
      }
      if (!ready) {
        warn(io, 'Docker Desktop is not running — Full mode is unavailable.');
        warn(io, 'Falling back to Simple mode.');
        mode = 'simple';
      }
    }
    ctx.answers.mode = mode;
    io.line();
    io.line(
      `  ${paint('→', 'green')} Selected: ${paint(
        mode === 'docker' ? 'Full mode (Docker)' : 'Simple mode',
        'bold',
        mode === 'docker' ? 'teal' : 'cyan',
      )} ${paint('(from --mode)', 'dim')}`,
    );
    printByokNote(io, ctx.pageMode);
    return 'ok';
  }

  let mode;
  if (!docker.ready && docker.installed) {
    const retry = await confirm(io, {
      message: 'Docker Desktop is not ready. Wait up to 60 seconds for it?',
      initial: true,
      auto,
    });
    if (retry === 'cancel') return 'abort';
    if (retry) {
      const spinner = startSpinner(io, 'Waiting for Docker Desktop');
      docker.ready = await waitForDocker();
      spinner.stop(docker.ready ? 'Docker Desktop is ready' : null);
    }
  }

  if (!docker.ready) {
    info(io, 'Full mode is unavailable because Docker Desktop is not running.');
    mode = 'simple';
  } else {
    const choice = await select(io, {
      message: 'Choose your setup mode',
      options: [
        {
          value: 'simple',
          label: 'Simple mode (lightweight)',
          description: 'Embedded PGlite · no Docker · fast startup',
        },
        {
          value: 'docker',
          label: 'Full mode (Docker)',
          description: 'Postgres + pgvector · worker · all features',
        },
      ],
      initialValue: 'docker',
      auto,
    });
    if (choice === 'cancel') return 'abort';
    mode = choice;
  }

  ctx.answers.mode = mode;
  io.line();
  io.line(
    `  ${paint('→', 'green')} Selected: ${paint(mode === 'docker' ? 'Full mode (Docker)' : 'Simple mode', 'bold', mode === 'docker' ? 'teal' : 'cyan')}`,
  );
  printByokNote(io, ctx.pageMode);
  return 'ok';
}
