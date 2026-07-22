// SPDX-License-Identifier: Apache-2.0

// Git history scanner — extracts architecture evolution data from git log.
// Maps file changes to graph nodes for animated playback and version comparison.

import { execSync } from 'node:child_process';
import * as path from 'node:path';
import type { GitHistory, GitCommit } from './types.js';

interface GitHistoryOptions {
  rootDir: string;
  /** Maximum number of commits to include. Default: 500. */
  maxCommits?: number;
  /** Only include commits after this date (ISO format). */
  since?: string;
}

/**
 * Scans the git history of a project and builds time-series data
 * mapping commits to files and graph nodes.
 */
export function scanGitHistory(opts: GitHistoryOptions): GitHistory | null {
  const { rootDir, maxCommits = 500, since } = opts;

  // Check if git is available and this is a git repo
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      cwd: rootDir,
      stdio: 'pipe',
      timeout: 5000,
    });
  } catch {
    console.warn('⚠️  Not a git repository or git not available — skipping history scan.');
    return null;
  }

  try {
    const sinceArg = since ? `--since="${since}"` : '';
    const logOutput = execSync(
      `git log --name-only --format="COMMIT:%H|%h|%aI|%an|%s" ${sinceArg} -n ${maxCommits}`,
      { cwd: rootDir, maxBuffer: 50 * 1024 * 1024, timeout: 30000 },
    ).toString('utf-8');

    return parseGitLog(logOutput, rootDir);
  } catch (err) {
    console.warn(`⚠️  Failed to scan git history: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function parseGitLog(raw: string, rootDir: string): GitHistory {
  const commits: GitCommit[] = [];
  const fileChanges: Record<string, string[]> = {};
  let current: GitCommit | null = null;

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      current = null;
      continue;
    }

    if (trimmed.startsWith('COMMIT:')) {
      const parts = trimmed.slice(7).split('|');
      if (parts.length >= 5) {
        current = {
          hash: parts[0]!,
          shortHash: parts[1]!,
          date: parts[2]!,
          author: parts[3]!,
          message: parts.slice(4).join('|'),
          files: [],
        };
        commits.push(current);
      }
    } else if (current) {
      // Normalize the file path relative to root
      const absPath = path.resolve(rootDir, trimmed);
      const relPath = path.relative(rootDir, absPath);
      current.files.push(relPath);
      // Track file→commit mapping
      if (!fileChanges[relPath]) fileChanges[relPath] = [];
      fileChanges[relPath].push(current.hash);
    }
  }

  // Map file changes to nodes (deferred to json-generator which has node data)
  const nodeChanges: Record<string, string[]> = {};

  return { commits, fileChanges, nodeChanges };
}

/**
 * Builds a time-series of active node counts per commit for playback.
 * Returns array of { date, hash, message, activeNodes } sorted chronologically.
 */
export function buildEvolutionTimeline(
  history: GitHistory,
  nodeIdByPath: Map<string, string>,
): { date: string; hash: string; shortHash: string; message: string; activeNodeCount: number; touchedNodes: string[] }[] {
  // Commits are in reverse-chronological order from git log
  // We need oldest-first for playback
  const reversed = [...history.commits].reverse();

  const touchedNodesByCommit = new Map<string, Set<string>>();
  for (const commit of history.commits) {
    const touched = new Set<string>();
    for (const file of commit.files) {
      const nodeId = nodeIdByPath.get(file);
      if (nodeId) touched.add(nodeId);
      // Also try matching by directory prefix for partial path matches
      if (!nodeId) {
        for (const [p, nid] of nodeIdByPath) {
          if (file.includes(p) || p.endsWith(file)) {
            touched.add(nid);
          }
        }
      }
    }
    touchedNodesByCommit.set(commit.hash, touched);
  }

  // Accumulate active nodes over time (nodes that exist up to that commit)
  const allSeen = new Set<string>();
  return reversed.map((c) => {
    const touched = touchedNodesByCommit.get(c.hash) ?? new Set();
    touched.forEach((n) => allSeen.add(n));
    return {
      date: c.date,
      hash: c.hash,
      shortHash: c.shortHash,
      message: c.message,
      activeNodeCount: allSeen.size,
      touchedNodes: [...touched],
    };
  });
}

/**
 * Creates a mapping from file paths to node IDs by matching node paths
 * against git-tracked files. Only full paths are mapped to avoid collisions
 * with common filenames like "index.ts" across packages.
 * Fuzzy matching is done at lookup time in buildEvolutionTimeline.
 */
export function buildNodePathMap(
  nodeIds: string[],
  getNodePath: (id: string) => string | undefined,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const nodeId of nodeIds) {
    const nodePath = getNodePath(nodeId);
    if (nodePath) {
      map.set(nodePath, nodeId);
    }
  }
  return map;
}
