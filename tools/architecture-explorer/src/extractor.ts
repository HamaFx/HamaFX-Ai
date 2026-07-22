// SPDX-License-Identifier: Apache-2.0

// File extractor — parses TypeScript/JSON/Markdown files to extract
// architectural information: imports, exports, classes, functions,
// API routes, database tables, AI tools, agents, and components.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ParsedFile, ImportInfo, ExportInfo, ClassInfo, FunctionInfo, TableInfo } from './types.js';
import type { ScannedFile } from './scanner.js';

const IMPORT_RE = /import\s+(?:type\s+)?(?:(?:\{[^}]*\})|(?:\*\s+as\s+\w+)|(?:\w+))\s+from\s+['"]([^'"]+)['"]/g;
const NAMED_IMPORT_RE = /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
const DEFAULT_IMPORT_RE = /import\s+(?:type\s+)?(\w+)\s+from\s+['"]([^'"]+)['"]/g;
const NAMESPACE_IMPORT_RE = /import\s+(?:type\s+)?\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
const TYPE_IMPORT_RE = /import\s+type\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;

const EXPORT_RE = /export\s+(?:const|let|var|function|class|interface|type|enum|async\s+function)\s+(\w+)/g;
const EXPORT_DEFAULT_RE = /export\s+default\s+(?:function|class|const|let|var)?\s*(\w+)?/g;
const CLASS_RE = /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?\s*\{/g;
const FUNCTION_RE = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
const ASYNC_FUNCTION_RE = /export\s+async\s+function\s+(\w+)/g;

const TABLE_RE = /export\s+const\s+(\w+)\s*=\s*pgTable\s*\(\s*(?:'([^']+)')?\s*,/g;
const HTTP_METHOD_RE = /export\s+const\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s*[=:]/g;
const TOOL_REGISTER_RE = /toolRegistry\.register\s*\(\s*['"](\w+)['"]/;
const TOOL_EXPORT_RE = /export\s+const\s+(\w+Tool)\s*[=:]/;
const TOOL_REGISTER_ARRAY_RE = /\['(\w+)',\s*(\w+Tool)\]/g;
const AGENT_CLASS_RE = /export\s+class\s+(\w*Agent)\s+extends\s+(\w+)/;
const AGENT_NAME_RE = /readonly\s+name:\s*AgentName\s*=\s*['"](\w+)['"]/;

/** Read and parse a single source file. */
export function extractFile(file: ScannedFile, rootDir: string): ParsedFile {
  let content: string;
  try {
    content = fs.readFileSync(file.absolutePath, 'utf-8');
  } catch {
    return emptyParsedFile(file);
  }

  const result: ParsedFile = {
    path: file.absolutePath,
    relativePath: file.relativePath,
    pkg: file.pkg,
    imports: extractImports(content, file.relativePath),
    exports: extractExports(content),
    classes: extractClasses(content),
    functions: extractFunctions(content),
    isApiRoute: false,
    isDrizzleSchema: false,
    tableDefs: [],
    isAiTool: false,
    isAgent: false,
    isComponent: false,
  };

  // API route detection
  if (file.relativePath.includes('/api/') && file.name === 'route.ts') {
    result.isApiRoute = true;
    result.routePath = deriveRoutePath(file.relativePath);
    result.httpMethod = extractHttpMethod(content);
  }

  // Drizzle schema detection
  if (file.relativePath.includes('/schema/') && file.ext === '.ts') {
    result.isDrizzleSchema = true;
    result.tableDefs = extractTables(content);
  }

  // AI tool detection — check for tool export or registration
  if (file.relativePath.includes('/tools/') && file.name !== 'index.ts' && file.name !== 'registry.ts' && file.name !== 'by-domain.ts' && file.name !== 'with-telemetry.ts' && file.name !== 'mutation-guard.ts') {
    // Check for direct tool export
    const toolExportMatch = content.match(TOOL_EXPORT_RE);
    if (toolExportMatch) {
      result.isAiTool = true;
      // Derive tool name from the export name (e.g., getPriceTool → get_price)
      const exportName = toolExportMatch[1]!.replace('Tool', '');
      result.toolName = exportName.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
      result.toolDescription = extractToolDescription(content);
    }
    // Check for registration in category files
    if (!result.isAiTool) {
      const registerMatch = content.match(TOOL_REGISTER_RE);
      if (registerMatch) {
        result.isAiTool = true;
        result.toolName = registerMatch[1]!;
        result.toolDescription = extractToolDescription(content);
      }
    }
  }

  // Agent detection
  if (file.relativePath.includes('/agents/') && file.name.endsWith('-agent.ts')) {
    const agentMatch = content.match(AGENT_CLASS_RE);
    if (agentMatch) {
      result.isAgent = true;
      result.agentName = agentMatch[1]!;
    }
    const nameMatch = content.match(AGENT_NAME_RE);
    if (nameMatch && !result.agentName) {
      result.agentName = nameMatch[1]!;
    }
  }

  // Component detection
  if (file.ext === '.tsx' && file.relativePath.includes('/components/')) {
    result.isComponent = true;
  }

  return result;
}

function emptyParsedFile(file: ScannedFile): ParsedFile {
  return {
    path: file.absolutePath,
    relativePath: file.relativePath,
    pkg: file.pkg,
    imports: [],
    exports: [],
    classes: [],
    functions: [],
    isApiRoute: false,
    isDrizzleSchema: false,
    tableDefs: [],
    isAiTool: false,
    isAgent: false,
    isComponent: false,
  };
}

function extractImports(content: string, relPath: string): ImportInfo[] {
  const imports: ImportInfo[] = [];

  // Named imports
  let match: RegExpExecArray | null;
  const namedRe = new RegExp(NAMED_IMPORT_RE.source, 'g');
  while ((match = namedRe.exec(content)) !== null) {
    const symbols = match[1]!.split(',').map((s) => {
      const trimmed = s.trim();
      const asIdx = trimmed.lastIndexOf(' as ');
      return asIdx >= 0 ? trimmed.substring(asIdx + 4).trim() : trimmed;
    });
    imports.push({
      source: normalizeImportPath(match[2]!, relPath),
      symbols,
      isDefault: false,
      isTypeOnly: false,
    });
  }

  // Type-only imports
  const typeRe = new RegExp(TYPE_IMPORT_RE.source, 'g');
  while ((match = typeRe.exec(content)) !== null) {
    const symbols = match[1]!.split(',').map((s) => {
      const trimmed = s.trim();
      const asIdx = trimmed.lastIndexOf(' as ');
      return asIdx >= 0 ? trimmed.substring(asIdx + 4).trim() : trimmed;
    });
    imports.push({
      source: normalizeImportPath(match[2]!, relPath),
      symbols,
      isDefault: false,
      isTypeOnly: true,
    });
  }

  // Default imports
  const defaultRe = new RegExp(DEFAULT_IMPORT_RE.source, 'g');
  while ((match = defaultRe.exec(content)) !== null) {
    imports.push({
      source: normalizeImportPath(match[2]!, relPath),
      symbols: [match[1]!],
      isDefault: true,
      isTypeOnly: false,
    });
  }

  // Namespace imports
  const nsRe = new RegExp(NAMESPACE_IMPORT_RE.source, 'g');
  while ((match = nsRe.exec(content)) !== null) {
    imports.push({
      source: normalizeImportPath(match[2]!, relPath),
      symbols: [match[1]!],
      isDefault: false,
      isTypeOnly: false,
    });
  }

  return imports;
}

function normalizeImportPath(importPath: string, currentRelPath: string): string {
  // Keep external packages as-is
  if (!importPath.startsWith('.') && !importPath.startsWith('@hamafx')) {
    return importPath;
  }

  // Resolve relative paths to package-relative paths
  if (importPath.startsWith('@hamafx')) {
    return importPath;
  }

  const currentDir = path.dirname(currentRelPath);
  const resolved = path.join(currentDir, importPath);
  const normalized = resolved.replace(/\\/g, '/');

  // Strip extensions and /index
  return normalized.replace(/\.(ts|tsx|js|jsx|mjs|mts)$/, '').replace(/\/index$/, '');
}

function extractExports(content: string): ExportInfo[] {
  const exports: ExportInfo[] = [];
  const seen = new Set<string>();

  // Named exports
  let match: RegExpExecArray | null;
  const namedRe = new RegExp(EXPORT_RE.source, 'g');
  while ((match = namedRe.exec(content)) !== null) {
    const name = match[1]!;
    if (seen.has(name)) continue;
    seen.add(name);

    const beforeExport = content.substring(0, match.index);
    const kind = beforeExport.includes('function') || beforeExport.includes('async function')
      ? 'function' as const
      : beforeExport.includes('class')
        ? 'class' as const
        : beforeExport.includes('interface')
          ? 'interface' as const
          : beforeExport.includes('type')
            ? 'type' as const
            : 'const' as const;

    exports.push({ name, kind, isDefault: false });
  }

  // Default exports
  const defaultRe = new RegExp(EXPORT_DEFAULT_RE.source, 'g');
  while ((match = defaultRe.exec(content)) !== null) {
    const name = match[1] || 'default';
    if (seen.has(name)) continue;
    seen.add(name);
    exports.push({ name, kind: 'default', isDefault: true });
  }

  return exports;
}

function extractClasses(content: string): ClassInfo[] {
  const classes: ClassInfo[] = [];
  let match: RegExpExecArray | null;
  const classRe = new RegExp(CLASS_RE.source, 'g');
  while ((match = classRe.exec(content)) !== null) {
    classes.push({
      name: match[1]!,
      extendsName: match[2] || undefined,
      implementsNames: match[3]
        ? match[3].split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      methods: [],
    });
  }
  return classes;
}

function extractFunctions(content: string): FunctionInfo[] {
  const funcs: FunctionInfo[] = [];
  const seen = new Set<string>();

  // Async exported functions
  let match: RegExpExecArray | null;
  const asyncRe = new RegExp(ASYNC_FUNCTION_RE.source, 'g');
  while ((match = asyncRe.exec(content)) !== null) {
    if (seen.has(match[1]!)) continue;
    seen.add(match[1]!);
    funcs.push({ name: match[1]!, isAsync: true, isExported: true });
  }

  // Regular exported functions
  const funcRe = new RegExp(FUNCTION_RE.source, 'g');
  while ((match = funcRe.exec(content)) !== null) {
    if (seen.has(match[1]!)) continue;
    seen.add(match[1]!);
    funcs.push({
      name: match[1]!,
      isAsync: content.substring(Math.max(0, match.index - 10), match.index).includes('async'),
      isExported: content.substring(Math.max(0, match.index - 20), match.index).includes('export'),
    });
  }

  return funcs;
}

function extractTables(content: string): TableInfo[] {
  const tables: TableInfo[] = [];
  let match: RegExpExecArray | null;
  const tableRe = new RegExp(TABLE_RE.source, 'g');
  while ((match = tableRe.exec(content)) !== null) {
    const varName = match[1]!;
    const tableName = match[2] || varName;

    // Extract columns by finding the object keys in the table definition
    const columns: string[] = [];
    const startIdx = match.index + match[0].length;
    const block = content.substring(startIdx, Math.min(startIdx + 5000, content.length));
    const colRe = /^\s*(\w+)\s*:/gm;
    let colMatch: RegExpExecArray | null;
    while ((colMatch = colRe.exec(block)) !== null) {
      const colName = colMatch[1]!;
      if (!['type', 'enum', 'notNull', 'default', 'primaryKey', 'unique', 'references'].includes(colName)) {
        columns.push(colName);
      }
    }

    tables.push({ name: tableName, columns });
  }
  return tables;
}

function extractHttpMethod(content: string): string | undefined {
  const methods: string[] = [];
  let match: RegExpExecArray | null;
  const methodRe = new RegExp(HTTP_METHOD_RE.source, 'g');
  while ((match = methodRe.exec(content)) !== null) {
    methods.push(match[1]!);
  }
  return methods.join(',') || undefined;
}

function deriveRoutePath(filePath: string): string {
  // e.g., apps/web/src/app/api/chat/threads/[id]/route.ts → /api/chat/threads/:id
  const apiIdx = filePath.indexOf('/api/');
  if (apiIdx < 0) return filePath;

  let route = filePath.substring(apiIdx);
  // Remove /route.ts or /route.tsx
  route = route.replace(/\/route\.(ts|tsx)$/, '');
  // Convert [param] to :param
  route = route.replace(/\[(\w+)\]/g, ':$1');
  // Convert [...param] to :param*
  route = route.replace(/\[\.\.\.(\w+)\]/g, ':$1*');

  return route || '/';
}

function extractToolDescription(content: string): string {
  // Try to find a JSDoc comment or description string near the tool registration
  const descMatch = content.match(/description:\s*['"]([^'"]{10,200})['"]/);
  if (descMatch) return descMatch[1]!;

  const jsDocMatch = content.match(/\/\*\*\s*\n?\s*\*\s*([^\n*]{10,200})/);
  if (jsDocMatch) return jsDocMatch[1]!.trim();

  return '(no description)';
}

/** Parse a package.json to extract dependencies and metadata. */
export function parsePackageJson(pkgPath: string): {
  name: string;
  dependencies: string[];
  devDependencies: string[];
  scripts: string[];
} | null {
  try {
    const content = fs.readFileSync(pkgPath, 'utf-8');
    const json = JSON.parse(content) as {
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    return {
      name: json.name ?? path.basename(path.dirname(pkgPath)),
      dependencies: Object.keys(json.dependencies ?? {}),
      devDependencies: Object.keys(json.devDependencies ?? {}),
      scripts: Object.keys(json.scripts ?? {}),
    };
  } catch {
    return null;
  }
}
