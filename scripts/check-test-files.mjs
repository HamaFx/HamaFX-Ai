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

  if (srcTestFiles.length === 0 && testTestFiles.length === 0) {
    console.error(`❌ ${pkg.name} has ZERO test files but test script is "${testScript}".`);
    failed = true;
  } else {
    console.log(`✓ ${pkg.name}: ${srcTestFiles.length + testTestFiles.length} test file(s)`);
  }
}

if (failed) {
  console.error('\n❌ Some packages are missing tests. Add test files or update the test script.');
  process.exit(1);
} else {
  console.log('\n✓ All packages with test scripts have at least one test file.');
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
