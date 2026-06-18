// scripts/dev.ts — Unified local development entrypoint.
//
// Starts Next.js dev server + optional worker with embedded scheduler.
// Uses PGlite (embedded Postgres) if no DATABASE_URL is set.
//
// Usage: pnpm dev:local

import { spawn, type ChildProcess } from 'node:child_process';

const processes: ChildProcess[] = [];

function cleanup() {
  console.log('\nShutting down...');
  for (const p of processes) {
    p.kill('SIGTERM');
  }
  // Force kill after 5 seconds
  setTimeout(() => {
    for (const p of processes) {
      if (!p.killed) p.kill('SIGKILL');
    }
    process.exit(0);
  }, 5000);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

async function main() {
  console.log('🚀 HamaFX-Ai local development mode\n');

  // Check if we're using PGlite or remote Postgres
  const hasDbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (hasDbUrl) {
    console.log(`📦 Database: remote Postgres`);
  } else {
    console.log('📦 Database: embedded PGlite (.hamafx/data/)');
    console.log('   (Run with docker compose up for full pgvector support)\n');
  }

  // Start Next.js dev server
  console.log('▶  Starting Next.js on http://localhost:3000');
  const nextDev = spawn('pnpm', ['--filter', '@hamafx/web', 'dev'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      // Tell the app to use local DB mode (PGlite fallback)
      HAMAFX_LOCAL_DEV: '1',
    },
  });
  processes.push(nextDev);

  // Wait for child processes
  await new Promise<void>((resolve) => {
    nextDev.on('exit', (code) => {
      console.log(`\nNext.js exited with code ${code}`);
      cleanup();
      resolve();
    });
  });
}

main().catch((err) => {
  console.error('Dev server failed:', err);
  process.exit(1);
});