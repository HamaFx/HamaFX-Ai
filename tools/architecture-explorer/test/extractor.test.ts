// SPDX-License-Identifier: Apache-2.0

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { extractFile } from '../src/extractor.js';
import type { ScannedFile } from '../src/scanner.js';

function sourceFile(rootDir: string, relativePath: string, content: string): ScannedFile {
  const absolutePath = join(rootDir, relativePath);
  mkdirSync(join(absolutePath, '..'), { recursive: true });
  writeFileSync(absolutePath, content, 'utf8');
  return {
    absolutePath,
    relativePath,
    name: relativePath.split('/').pop()!,
    ext: '.ts',
    pkg: '@hamafx/web',
    size: content.length,
  };
}

test('extracts destructured route methods and exports', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'hamafx-extractor-'));
  const parsed = extractFile(
    sourceFile(
      rootDir,
      'apps/web/src/app/api/auth/[...nextauth]/route.ts',
      "import { handlers } from '@/auth';\nexport const { GET, POST } = handlers;\n",
    ),
    rootDir,
  );

  assert.deepEqual(parsed.httpMethods, ['GET', 'POST']);
  assert.deepEqual(
    parsed.exports.map((entry) => entry.name).filter((name) => ['GET', 'POST'].includes(name)),
    ['GET', 'POST'],
  );
});

test('normalizes getCoTTool to the canonical get_cot name', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'hamafx-extractor-'));
  const toolNamesPath = join(rootDir, 'packages/shared/src/ai');
  const toolPath = join(rootDir, 'packages/ai/src/tools');
  mkdirSync(toolNamesPath, { recursive: true });
  mkdirSync(toolPath, { recursive: true });
  writeFileSync(join(toolNamesPath, 'tool-names.ts'), "export const TOOL_NAMES = ['get_cot'] as const;", 'utf8');
  const toolFile = join(toolPath, 'get-cot.ts');
  writeFileSync(toolFile, "export const getCoTTool = tool({ description: 'CoT data' });", 'utf8');

  const parsed = extractFile(
    {
      absolutePath: toolFile,
      relativePath: 'packages/ai/src/tools/get-cot.ts',
      name: 'get-cot.ts',
      ext: '.ts',
      pkg: '@hamafx/ai',
      size: 70,
    },
    rootDir,
  );

  assert.equal(parsed.toolName, 'get_cot');
});
