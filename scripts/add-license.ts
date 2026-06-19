import * as fs from 'fs';
import * as path from 'path';

const LICENSE_HEADER = `/**
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

`;

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(function(file) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (!fullPath.includes('node_modules') && !fullPath.includes('.next') && !fullPath.includes('dist') && !fullPath.includes('build') && !fullPath.includes('coverage')) {
        arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
      }
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
        arrayOfFiles.push(fullPath);
      }
    }
  });

  return arrayOfFiles;
}

async function main() {
  const rootDir = path.resolve(__dirname, '..');
  
  const files = getAllFiles(rootDir);

  let modifiedCount = 0;

  for (const fullPath of files) {
    if (fullPath.includes('scripts/add-license.ts')) continue;

    const content = fs.readFileSync(fullPath, 'utf8');

    // Skip if it already has the copyright header
    if (content.includes('Copyright 2026 HamaFX')) {
      continue;
    }

    // Handle files with 'use client' or 'use server' directives
    const lines = content.split('\n');
    let injectIndex = 0;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('"use client"') || lines[i].startsWith("'use client'") ||
          lines[i].startsWith('"use server"') || lines[i].startsWith("'use server'")) {
        injectIndex = i + 1;
      }
    }

    if (injectIndex > 0) {
      lines.splice(injectIndex, 0, '\n' + LICENSE_HEADER.trim());
      fs.writeFileSync(fullPath, lines.join('\n'));
    } else {
      fs.writeFileSync(fullPath, LICENSE_HEADER + content);
    }
    modifiedCount++;
  }

  console.log(`Successfully added license header to ${modifiedCount} files.`);
}

main().catch(console.error);
