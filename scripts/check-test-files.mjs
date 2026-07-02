import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const packages = [
  { name: 'apps/web', path: join(root, 'apps/web') },
  { name: 'apps/worker', path: join(root, 'apps/worker') },
  { name: 'packages/ai', path: join(root, 'packages/ai') },
  { name: 'packages/data', path: join(root, 'packages/data') },
  { name: 'packages/db', path: join(root, 'packages/db') },
  { name: 'packages/indicators', path: join(root, 'packages/indicators') },
  { name: 'packages/shared', path: join(root, 'packages/shared') },
  { name: 'packages/test-utils', path: join(root, 'packages/test-utils') },
];

let failed = false;

// Phase 7 task 7.13 — also flag files with zero real assertions.
// We read each test file and check for at least one `it(`, `test(`, or
// `it.todo(` call that isn't commented out. Files with only `.skip` are
// also flagged.
const ASSERTION_RE = /^\s*(?:it|test)\.(?:todo|skip|only|concurrent)\s*\(|^\s*(?:it|test)\s*\(/;

function countAssertions(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  let count = 0;
  let allSkip = true;
  let hasAny = false;
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
    if (ASSERTION_RE.test(line)) {
      count++;
      hasAny = true;
      if (!line.includes('.skip')) {
        allSkip = false;
      }
    }
  }
  return { count, hasAny, allSkip };
}

for (const pkg of packages) {
  const pkgJsonPath = join(pkg.path, 'package.json');
  if (!existsSync(pkgJsonPath)) {
    console.warn(`⚠  Missing package.json for ${pkg.name}, skipping.`);
    continue;
  }

  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
  const testScript = pkgJson.scripts?.test ?? '';

  if (testScript.startsWith('echo ') || !testScript) {
    // Packages that explicitly declare no tests are fine
    continue;
  }

  const testDir = join(pkg.path, 'test');
  const srcTestFiles = findTestFiles(join(pkg.path, 'src'));
  const testTestFiles = findTestFiles(testDir);
  const allTestFiles = [...srcTestFiles, ...testTestFiles];

  if (allTestFiles.length === 0) {
    console.error(`❌ ${pkg.name} has ZERO test files but test script is "${testScript}".`);
    failed = true;
    continue;
  }

  // Phase 7 task 7.13 — check each file for real assertions
  const zeroAssertionFiles = [];
  const allSkipFiles = [];
  for (const file of allTestFiles) {
    const { count, hasAny, allSkip } = countAssertions(file);
    if (!hasAny) {
      zeroAssertionFiles.push(file);
    } else if (allSkip) {
      allSkipFiles.push(file);
    }
  }

  if (zeroAssertionFiles.length > 0) {
    console.error(`❌ ${pkg.name} has ${zeroAssertionFiles.length} test file(s) with ZERO assertions:`);
    for (const f of zeroAssertionFiles) {
      console.error(`   ${f.replace(root + '/', '')}`);
    }
    failed = true;
  }

  if (allSkipFiles.length > 0) {
    console.warn(`⚠  ${pkg.name} has ${allSkipFiles.length} test file(s) with all-skipped assertions:`);
    for (const f of allSkipFiles) {
      console.warn(`   ${f.replace(root + '/', '')}`);
    }
  }

  if (zeroAssertionFiles.length === 0) {
    console.log(`✓ ${pkg.name}: ${allTestFiles.length} test file(s), all have assertions`);
  }
}

if (failed) {
  console.error('\n❌ Some packages have missing or empty test files. Add tests or update the test script.');
  process.exit(1);
} else {
  console.log('\n✓ All packages with test scripts have test files with real assertions.');
}

function findTestFiles(dir) {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findTestFiles(full));
    } else if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) {
      files.push(full);
    }
  }
  return files;
}
