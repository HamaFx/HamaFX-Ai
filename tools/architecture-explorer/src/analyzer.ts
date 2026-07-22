// SPDX-License-Identifier: Apache-2.0

// Relationship analyzer — builds the edge graph from extracted file data.
// Detects imports, dependencies, tool registrations, API routes,
// table relationships, agent hierarchies, and more.

import * as path from 'node:path';
import type { ArchNode, EdgeType } from './types.js';
import type { ParsedFile, ImportInfo } from './types.js';
import type { ScannedFile } from './scanner.js';
import { GraphModel } from './graph-model.js';

export class Analyzer {
  private graph = new GraphModel();
  private nodeByPath = new Map<string, string>(); // path → nodeId
  private nodeByName = new Map<string, string>(); // name → nodeId
  private pkgNodeIds = new Map<string, string>(); // package name → nodeId
  private moduleNodeIds = new Map<string, string>(); // file path → nodeId

  analyze(
    scannedFiles: ScannedFile[],
    parsedFiles: Map<string, ParsedFile>,
    packageNames: Set<string>,
  ): GraphModel {
    this.graph.clear();
    this.nodeByPath.clear();
    this.nodeByName.clear();
    this.pkgNodeIds.clear();
    this.moduleNodeIds.clear();

    // 1. Create package nodes
    for (const pkgName of packageNames) {
      const id = this.graph.addNode({
        type: 'package',
        name: pkgName,
        pkg: pkgName,
        path: pkgName.replace('@hamafx/', 'packages/').replace('tool:', 'tools/'),
        description: `Package: ${pkgName}`,
      });
      this.pkgNodeIds.set(pkgName, id);
    }

    // 2. Create module nodes for all TypeScript files
    for (const file of scannedFiles) {
      if (!['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx'].includes(file.ext)) continue;
      const parsed = parsedFiles.get(file.absolutePath);
      if (!parsed) continue;

      const nodeType = determineNodeType(file, parsed);
      const id = this.graph.addNode({
        type: nodeType,
        name: getDisplayName(file, parsed),
        pkg: file.pkg,
        path: file.relativePath,
        description: getNodeDescription(file, parsed),
        metadata: getNodeMetadata(file, parsed),
      });

      this.nodeByPath.set(file.relativePath, id);
      this.moduleNodeIds.set(file.relativePath, id);

      // Also index by tool/agent name for cross-referencing
      if (parsed.toolName) this.nodeByName.set(parsed.toolName, id);
      if (parsed.agentName) this.nodeByName.set(parsed.agentName, id);
      if (parsed.isApiRoute && parsed.routePath) {
        this.nodeByName.set(`${parsed.httpMethod ?? 'GET'} ${parsed.routePath}`, id);
      }
    }

    // 3. Create nodes for database tables
    for (const [, parsed] of parsedFiles) {
      if (!parsed.isDrizzleSchema || parsed.tableDefs.length === 0) continue;
      const schemaNodeId = this.moduleNodeIds.get(parsed.relativePath);
      for (const table of parsed.tableDefs) {
        const tableId = this.graph.addNode({
          type: 'table',
          name: table.name,
          pkg: parsed.pkg,
          path: parsed.relativePath,
          description: `Database table: ${table.name} (${table.columns.length} columns)`,
          metadata: {
            columns: table.columns,
            schemaFile: parsed.relativePath,
          },
        });
        this.nodeByName.set(table.name, tableId);
        this.nodeByPath.set(`${parsed.relativePath}#${table.name}`, tableId);

        // Link table to its schema file
        if (schemaNodeId) {
          this.graph.addEdge({
            source: tableId,
            target: schemaNodeId,
            type: 'belongs_to',
            metadata: { relationship: 'defined in' },
          });
        }
      }
    }

    // 4. Create nodes for API routes as separate entities
    for (const [, parsed] of parsedFiles) {
      if (!parsed.isApiRoute || !parsed.routePath) continue;
      const routeNodeId = this.graph.addNode({
        type: 'api_route',
        name: `${parsed.httpMethod ?? 'GET'} ${parsed.routePath}`,
        pkg: parsed.pkg,
        path: parsed.relativePath,
        description: `API Route: ${parsed.httpMethod ?? 'GET'} ${parsed.routePath}`,
        metadata: {
          httpMethod: parsed.httpMethod,
          routePath: parsed.routePath,
          exports: parsed.exports.map((e) => e.name),
        },
      });
      this.nodeByName.set(`${parsed.httpMethod ?? 'GET'} ${parsed.routePath}`, routeNodeId);

      // Link route to its handler file
      const handlerId = this.moduleNodeIds.get(parsed.relativePath);
      if (handlerId) {
        this.graph.addEdge({
          source: routeNodeId,
          target: handlerId,
          type: 'belongs_to',
          metadata: { relationship: 'handled by' },
        });
      }
    }

    // 5. Build edges from imports and dependencies
    for (const [, parsed] of parsedFiles) {
      const sourceId = this.moduleNodeIds.get(parsed.relativePath);
      if (!sourceId) continue;

      for (const imp of parsed.imports) {
        const edgeType = determineEdgeType(imp, parsed);
        const targetId = this.resolveImportTarget(imp, parsed);

        if (targetId) {
          this.graph.addEdge({
            source: sourceId,
            target: targetId,
            type: edgeType,
            metadata: {
              symbols: imp.symbols,
              isTypeOnly: imp.isTypeOnly,
              source: imp.source,
            },
          });
        }
      }

      // Link modules to their package
      const pkgId = this.pkgNodeIds.get(parsed.pkg);
      if (pkgId) {
        this.graph.addEdge({
          source: sourceId,
          target: pkgId,
          type: 'belongs_to',
          metadata: {},
        });
      }
    }

    // 6. Build tool → tool registry edges
    for (const [, parsed] of parsedFiles) {
      if (!parsed.isAiTool || !parsed.toolName) continue;
      const toolId = this.moduleNodeIds.get(parsed.relativePath);
      const registryId = this.nodeByName.get('toolRegistry') || this.moduleNodeIds.get('packages/ai/src/tools/registry.ts');
      if (toolId && registryId) {
        this.graph.addEdge({
          source: toolId,
          target: registryId,
          type: 'registers',
          metadata: { toolName: parsed.toolName },
        });
      }
    }

    // 7. Build agent hierarchy edges
    for (const [, parsed] of parsedFiles) {
      if (!parsed.isAgent) continue;
      const agentId = this.moduleNodeIds.get(parsed.relativePath);
      for (const cls of parsed.classes) {
        if (cls.extendsName) {
          const baseId = this.nodeByName.get(cls.extendsName);
          if (baseId && agentId) {
            this.graph.addEdge({
              source: agentId,
              target: baseId,
              type: 'extends',
              metadata: { className: cls.name },
            });
          }
        }
      }
    }

    // 8. Build inter-package dependency edges
    for (const scanned of scannedFiles) {
      if (scanned.name !== 'package.json') continue;
      // Package-level deps handled via import analysis above
    }

    return this.graph;
  }

  getGraph(): GraphModel {
    return this.graph;
  }

  private resolveImportTarget(imp: ImportInfo, sourceFile: ParsedFile): string | undefined {
    const src = imp.source;

    // Direct path resolution
    const candidates = [
      src,
      `${src}.ts`,
      `${src}.tsx`,
      `${src}/index.ts`,
      `${src}/index.tsx`,
      `${src}/route.ts`,
    ];

    for (const candidate of candidates) {
      const id = this.moduleNodeIds.get(candidate);
      if (id) return id;
    }

    // Try matching by the end of the path
    for (const [path, id] of this.moduleNodeIds) {
      if (path.endsWith(`/${src}`) || path.endsWith(`/${src}.ts`) || path.endsWith(`/${src}.tsx`)) {
        return id;
      }
    }

    // Try package-level resolution
    if (src.startsWith('@hamafx/')) {
      const pkgId = this.pkgNodeIds.get(src);
      if (pkgId) return pkgId;
    }

    // Try node_modules packages
    const pkgName = src.startsWith('@')
      ? src.split('/').slice(0, 2).join('/')
      : src.split('/')[0]!;

    const pkgId = this.pkgNodeIds.get(pkgName);
    if (pkgId) return pkgId;

    return undefined;
  }
}

function determineNodeType(file: ScannedFile, parsed: ParsedFile): 'module' | 'api_route' | 'component' | 'tool' | 'agent' {
  if (parsed.isApiRoute) return 'api_route';
  if (parsed.isAiTool) return 'tool';
  if (parsed.isAgent) return 'agent';
  if (parsed.isComponent) return 'component';
  return 'module';
}

function getDisplayName(file: ScannedFile, parsed: ParsedFile): string {
  if (parsed.isApiRoute && parsed.routePath) {
    return `${parsed.httpMethod ?? 'GET'} ${parsed.routePath}`;
  }
  if (parsed.toolName) return parsed.toolName;
  if (parsed.agentName) return parsed.agentName;
  if (parsed.exports.length > 0) {
    const mainExport = parsed.exports.find((e) => e.isDefault) || parsed.exports[0]!;
    return `${path.basename(file.relativePath, file.ext)}/${mainExport.name}`;
  }
  return path.basename(file.relativePath, file.ext);
}

function getNodeDescription(file: ScannedFile, parsed: ParsedFile): string {
  if (parsed.toolDescription) return parsed.toolDescription;
  if (parsed.isApiRoute) return `API ${parsed.httpMethod ?? 'handler'} at ${parsed.routePath ?? file.relativePath}`;
  if (parsed.isAgent) return `Multi-agent specialist: ${parsed.agentName ?? file.name}`;
  if (parsed.isComponent) return `React component: ${path.basename(file.relativePath, file.ext)}`;
  if (parsed.isDrizzleSchema) return `Database schema (${parsed.tableDefs.length} tables)`;
  return `Module: ${file.relativePath}`;
}

function getNodeMetadata(file: ScannedFile, parsed: ParsedFile): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    exports: parsed.exports.map((e) => e.name),
    functions: parsed.functions.map((f) => f.name),
    size: file.size,
  };
  if (parsed.toolName) meta.toolName = parsed.toolName;
  if (parsed.agentName) meta.agentName = parsed.agentName;
  if (parsed.routePath) meta.routePath = parsed.routePath;
  if (parsed.httpMethod) meta.httpMethod = parsed.httpMethod;
  if (parsed.tableDefs.length > 0) meta.tableCount = parsed.tableDefs.length;
  return meta;
}

function determineEdgeType(imp: ImportInfo, parsed: ParsedFile): EdgeType {
  const src = imp.source;

  // Tool registrations
  if (src.includes('registry') || src.includes('toolRegistry')) return 'registers';

  // Depends on for external packages
  if (!src.startsWith('.') && !src.startsWith('@hamafx')) return 'depends_on';

  // Internal imports
  if (imp.isTypeOnly) return 'imports';

  // Check for special relationships
  if (src.includes('/schema/')) return 'reads_from';
  if (src.includes('/persistence/')) return 'writes_to';
  if (src.includes('/tools/')) return 'calls';
  if (src.includes('/agents/')) return 'extends';

  return 'imports';
}
