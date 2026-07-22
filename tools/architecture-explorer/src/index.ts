// SPDX-License-Identifier: Apache-2.0

// Architecture Explorer — main entry point.
//
// Usage: npx ts-node src/index.ts [--out <output.html>] [--root <project-root>]
//
// Scans the HamaFX-Ai monorepo, extracts architecture information,
// builds a graph model, and generates a self-contained HTML explorer.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { scanProject, getTsFiles, getRouteFiles, getSchemaFiles, getToolFiles, getAgentFiles, getComponentFiles, type ScannedFile } from './scanner.js';
import { extractFile, parsePackageJson } from './extractor.js';
import { Analyzer } from './analyzer.js';
import { GraphModel } from './graph-model.js';
import { generateArchitectureJson } from './json-generator.js';
import { generateHtml } from './html-generator.js';
import { generateKnowledgeArtifacts } from './knowledge-generator.js';
import type { ParsedFile, ScanOptions } from './types.js';

function parseArgs(): ScanOptions {
  const args = process.argv.slice(2);
  const opts: ScanOptions = {
    rootDir: path.resolve(process.cwd(), '..', '..'),
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--out':
        opts.outputPath = args[++i];
        break;
      case '--root':
        opts.rootDir = path.resolve(args[++i]!);
        break;
      case '--verbose':
      case '-v':
        opts.verbose = true;
        break;
      case '--help':
      case '-h':
        console.log(`
HamaFX-Ai Architecture Explorer

Usage: npx ts-node src/index.ts [options]

Options:
  --out <path>    Output HTML file path (default: ../../docs/architecture-explorer.html)
  --root <path>   Project root directory (default: ../../)
  --verbose, -v   Verbose output
  --help, -h      Print this help

Outputs a self-contained HTML file that renders an interactive
architecture graph of the HamaFX-Ai monorepo.
`);
        process.exit(0);
        break;
    }
  }

  return opts;
}

async function main(): Promise<void> {
  const opts = parseArgs();

  console.log('🏗️  HamaFX-Ai Architecture Explorer');
  console.log(`   Root: ${opts.rootDir}`);
  console.log('');

  // 1. Scan the project
  console.log('📂 Scanning project files...');
  const scanResult = scanProject(opts);
  console.log(`   Found ${scanResult.files.length} files across ${scanResult.packageNames.size} packages`);

  // 2. Extract architectural information
  console.log('🔍 Extracting architecture information...');
  const parsedFiles = new Map<string, ParsedFile>();
  let tsCount = 0;
  let routeCount = 0;
  let schemaCount = 0;
  let toolCount = 0;
  let agentCount = 0;
  let componentCount = 0;

  for (const file of scanResult.files) {
    if (['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs'].includes(file.ext)) {
      const parsed = extractFile(file, opts.rootDir);
      parsedFiles.set(file.absolutePath, parsed);
      tsCount++;

      if (parsed.isApiRoute) routeCount++;
      if (parsed.isDrizzleSchema) schemaCount++;
      if (parsed.isAiTool) toolCount++;
      if (parsed.isAgent) agentCount++;
      if (parsed.isComponent) componentCount++;
    }
  }

  console.log(`   Parsed ${tsCount} TypeScript files`);
  console.log(`   Found ${routeCount} API routes, ${schemaCount} schema files, ${toolCount} tools, ${agentCount} agents, ${componentCount} components`);

  // 3. Build the graph model
  console.log('🔗 Building relationship graph...');
  const analyzer = new Analyzer();
  const graph = analyzer.analyze(scanResult.files, parsedFiles, scanResult.packageNames);
  console.log(`   Graph: ${graph.getNodeCount()} nodes, ${graph.getEdgeCount()} edges`);

  // 4. Generate the architecture JSON
  console.log('📊 Generating architecture model...');
  const model = generateArchitectureJson(graph, scanResult.packageNames, opts.rootDir);
  console.log(`   Model complete with ${Object.keys(model.views).length} views`);
  console.log(`   Analysis: ${model.analysis.summary.totalCycles} cycles, ${model.analysis.summary.hotspotCount} hotspots, ${model.analysis.summary.deadOrOrphanCount} dead/orphans`);

  // 5. Generate the HTML
  console.log('🎨 Generating interactive HTML explorer...');
  const html = generateHtml(model);

  // 6. Write output
  const outputPath = opts.outputPath
    ? path.resolve(opts.outputPath)
    : path.resolve(opts.rootDir, 'docs', 'architecture-explorer.html');

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, html, 'utf-8');
  const stats = fs.statSync(outputPath);

  console.log('');
  console.log('✅ Architecture explorer generated!');
  console.log(`   HTML: ${outputPath} (${(stats.size / 1024).toFixed(1)} KB)`);
  console.log(`   Nodes: ${graph.getNodeCount()} | Edges: ${graph.getEdgeCount()} | Views: ${Object.keys(model.views).length}`);

  // 7. Write the JSON model
  const jsonPath = outputPath.replace('.html', '.json');
  fs.writeFileSync(jsonPath, JSON.stringify(model, null, 2), 'utf-8');
  console.log(`   JSON: ${jsonPath} (${(fs.statSync(jsonPath).size / 1024).toFixed(1)} KB)`);

  // 8. Generate AI knowledge artifacts
  console.log('🧠 Generating AI knowledge artifacts...');
  const knowledge = generateKnowledgeArtifacts(model, graph, parsedFiles);

  const artifactDir = path.resolve(opts.rootDir, 'docs', 'knowledge');
  if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });

  const artifacts: [string, object | string][] = [
    ['architecture.json', knowledge.architecture],
    ['features.json', knowledge.features],
    ['dependencies.json', knowledge.dependencies],
    ['api.json', knowledge.api],
    ['database.json', knowledge.database],
    ['ai.json', knowledge.ai],
    ['flows.json', knowledge.flows],
    ['knowledge.md', knowledge.markdown],
  ];

  for (const [filename, content] of artifacts) {
    const filePath = path.join(artifactDir, filename);
    const data = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    fs.writeFileSync(filePath, data, 'utf-8');
    console.log(`   ${filename}: ${(fs.statSync(filePath).size / 1024).toFixed(1)} KB`);
  }

  // Print summary
  console.log('');
  console.log('📋 Node type breakdown:');
  const nodeTypes = new Map<string, number>();
  for (const node of graph.getAllNodes()) {
    nodeTypes.set(node.type, (nodeTypes.get(node.type) ?? 0) + 1);
  }
  for (const [type, count] of [...nodeTypes.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${type}: ${count}`);
  }

  // Print edge type breakdown
  console.log('');
  console.log('📋 Edge type breakdown:');
  const edgeTypes = new Map<string, number>();
  for (const edge of graph.getAllEdges()) {
    edgeTypes.set(edge.type, (edgeTypes.get(edge.type) ?? 0) + 1);
  }
  for (const [type, count] of [...edgeTypes.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${type}: ${count}`);
  }
}

main().catch((err) => {
  console.error('❌ Failed:', err instanceof Error ? err.message : String(err));
  if (process.argv.includes('--verbose') || process.argv.includes('-v')) {
    console.error(err);
  }
  process.exit(1);
});
