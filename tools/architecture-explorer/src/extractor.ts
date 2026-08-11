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
const DESTRUCTURED_EXPORT_RE = /export\s+(?:const|let|var)\s*\{([^}]+)\}\s*=/g;
const EXPORT_DEFAULT_RE = /export\s+default\s+(?:function|class|const|let|var)?\s*(\w+)?/g;
const CLASS_RE = /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?\s*\{/g;
const FUNCTION_RE = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
const ASYNC_FUNCTION_RE = /export\s+async\s+function\s+(\w+)/g;

const TABLE_RE = /export\s+const\s+(\w+)\s*=\s*pgTable\s*\(\s*(?:'([^']+)')?\s*,/g;
const HTTP_METHOD_RE = /export\s+(?:const\s+)?(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s*[=:]|export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g;
const DESTRUCTURED_HANDLER_EXPORT_RE = /export\s+const\s*\{([^}]+)\}\s*=\s*[^;]+/g;
const REEXPORT_HANDLER_RE = /export\s*\{([^}]+)\}(?:\s*from\s+['"][^'"]+['"])?\s*;/g;
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);
const TOOL_REGISTER_RE = /toolRegistry\.register\s*\(\s*['"](\w+)['"]/;
const TOOL_EXPORT_RE = /export\s+const\s+(\w+Tool)\s*[=:]/;
const AGENT_CLASS_RE = /export\s+class\s+(\w*Agent)\s+extends\s+(\w+)/;
const AGENT_NAME_RE = /readonly\s+name:\s*AgentName\s*=\s*['"](\w+)['"]/;

const canonicalToolNamesByRoot = new Map<string, Set<string>>();
const registeredToolNamesByRoot = new Map<string, Map<string, string>>();

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
    httpMethods: [],
    isDrizzleSchema: false,
    tableDefs: [],
    isAiTool: false,
    isAgent: false,
    isComponent: false,
  };

  if (file.relativePath.includes('/api/') && file.name === 'route.ts') {
    result.isApiRoute = true;
    result.routePath = deriveRoutePath(file.relativePath);
    result.httpMethods = extractHttpMethods(content);
  }

  if (file.relativePath.includes('/schema/') && file.ext === '.ts') {
    result.isDrizzleSchema = true;
    result.tableDefs = extractTables(content);
  }

  if (
    file.relativePath.includes('/tools/') &&
    file.name !== 'index.ts' &&
    file.name !== 'registry.ts' &&
    file.name !== 'by-domain.ts' &&
    file.name !== 'with-telemetry.ts' &&
    file.name !== 'mutation-guard.ts'
  ) {
    const toolExportMatch = content.match(TOOL_EXPORT_RE);
    if (toolExportMatch) {
      result.isAiTool = true;
      result.toolName = resolveCanonicalToolName(toolExportMatch[1]!, rootDir);
      result.toolDescription = extractToolDescription(content);
    }

    if (!result.isAiTool) {
      const registerMatch = content.match(TOOL_REGISTER_RE);
      if (registerMatch) {
        result.isAiTool = true;
        result.toolName = resolveCanonicalToolName(registerMatch[1]!, rootDir);
        result.toolDescription = extractToolDescription(content);
      }
    }
  }

  if (file.relativePath.includes('/agents/') && file.name.endsWith('-agent.ts')) {
    const agentMatch = content.match(AGENT_CLASS_RE);
    if (agentMatch) {
      result.isAgent = true;
      result.agentName = agentMatch[1]!;
    }
    const nameMatch = content.match(AGENT_NAME_RE);
    if (nameMatch && !result.agentName) result.agentName = nameMatch[1]!;
  }

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
    httpMethods: [],
    isDrizzleSchema: false,
    tableDefs: [],
    isAiTool: false,
    isAgent: false,
    isComponent: false,
  };
}

function extractImports(content: string, relPath: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  let match: RegExpExecArray | null;

  const namedRe = new RegExp(NAMED_IMPORT_RE.source, 'g');
  while ((match = namedRe.exec(content)) !== null) {
    const symbols = match[1]!.split(',').map((symbol) => {
      const trimmed = symbol.trim();
      const asIndex = trimmed.lastIndexOf(' as ');
      return asIndex >= 0 ? trimmed.substring(asIndex + 4).trim() : trimmed;
    });
    imports.push({
      source: normalizeImportPath(match[2]!, relPath),
      symbols,
      isDefault: false,
      isTypeOnly: false,
    });
  }

  const typeRe = new RegExp(TYPE_IMPORT_RE.source, 'g');
  while ((match = typeRe.exec(content)) !== null) {
    const symbols = match[1]!.split(',').map((symbol) => {
      const trimmed = symbol.trim();
      const asIndex = trimmed.lastIndexOf(' as ');
      return asIndex >= 0 ? trimmed.substring(asIndex + 4).trim() : trimmed;
    });
    imports.push({
      source: normalizeImportPath(match[2]!, relPath),
      symbols,
      isDefault: false,
      isTypeOnly: true,
    });
  }

  const defaultRe = new RegExp(DEFAULT_IMPORT_RE.source, 'g');
  while ((match = defaultRe.exec(content)) !== null) {
    imports.push({
      source: normalizeImportPath(match[2]!, relPath),
      symbols: [match[1]!],
      isDefault: true,
      isTypeOnly: false,
    });
  }

  const namespaceRe = new RegExp(NAMESPACE_IMPORT_RE.source, 'g');
  while ((match = namespaceRe.exec(content)) !== null) {
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
  if (!importPath.startsWith('.') && !importPath.startsWith('@kestrel')) return importPath;
  if (importPath.startsWith('@kestrel')) return importPath;

  const resolved = path.join(path.dirname(currentRelPath), importPath).replace(/\\/g, '/');
  return resolved.replace(/\.(ts|tsx|js|jsx|mjs|mts)$/, '').replace(/\/index$/, '');
}

function extractExports(content: string): ExportInfo[] {
  const exports: ExportInfo[] = [];
  const seen = new Set<string>();
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

  const destructuredRe = new RegExp(DESTRUCTURED_EXPORT_RE.source, 'g');
  while ((match = destructuredRe.exec(content)) !== null) {
    for (const exported of match[1]!.split(',')) {
      const name = exported.trim().split(/\s*:\s*/)[0]?.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      exports.push({ name, kind: 'const', isDefault: false });
    }
  }

  const reexportRe = new RegExp(REEXPORT_HANDLER_RE.source, 'g');
  while ((match = reexportRe.exec(content)) !== null) {
    for (const exported of match[1]!.split(',')) {
      const name = exported.trim().split(/\s+as\s+/).pop()?.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      exports.push({ name, kind: 'const', isDefault: false });
    }
  }

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
        ? match[3].split(',').map((name) => name.trim()).filter(Boolean)
        : [],
      methods: [],
    });
  }
  return classes;
}

function extractFunctions(content: string): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  const asyncRe = new RegExp(ASYNC_FUNCTION_RE.source, 'g');
  while ((match = asyncRe.exec(content)) !== null) {
    if (seen.has(match[1]!)) continue;
    seen.add(match[1]!);
    functions.push({ name: match[1]!, isAsync: true, isExported: true });
  }

  const functionRe = new RegExp(FUNCTION_RE.source, 'g');
  while ((match = functionRe.exec(content)) !== null) {
    if (seen.has(match[1]!)) continue;
    seen.add(match[1]!);
    functions.push({
      name: match[1]!,
      isAsync: content.substring(Math.max(0, match.index - 10), match.index).includes('async'),
      isExported: content.substring(Math.max(0, match.index - 20), match.index).includes('export'),
    });
  }

  return functions;
}

function extractTables(content: string): TableInfo[] {
  const tables: TableInfo[] = [];
  let match: RegExpExecArray | null;
  const tableRe = new RegExp(TABLE_RE.source, 'g');
  while ((match = tableRe.exec(content)) !== null) {
    const varName = match[1]!;
    const tableName = match[2] || varName;
    const columns: string[] = [];
    const block = content.substring(match.index + match[0].length, Math.min(match.index + match[0].length + 5000, content.length));
    const columnRe = /^\s*(\w+)\s*:/gm;
    let columnMatch: RegExpExecArray | null;
    while ((columnMatch = columnRe.exec(block)) !== null) {
      const columnName = columnMatch[1]!;
      if (!['type', 'enum', 'notNull', 'default', 'primaryKey', 'unique', 'references'].includes(columnName)) {
        columns.push(columnName);
      }
    }
    tables.push({ name: tableName, columns });
  }
  return tables;
}

function extractHttpMethods(content: string): string[] {
  const methods = new Set<string>();
  let match: RegExpExecArray | null;
  const methodRe = new RegExp(HTTP_METHOD_RE.source, 'g');
  while ((match = methodRe.exec(content)) !== null) {
    const method = match[1] ?? match[2];
    if (method) methods.add(method);
  }

  for (const pattern of [DESTRUCTURED_HANDLER_EXPORT_RE, REEXPORT_HANDLER_RE]) {
    const exportRe = new RegExp(pattern.source, 'g');
    while ((match = exportRe.exec(content)) !== null) {
      for (const exported of match[1]!.split(',')) {
        const parts = exported.trim().split(/\s+as\s+|\s*:\s*/);
        const candidates = pattern === REEXPORT_HANDLER_RE ? parts.reverse() : parts;
        const method = candidates[0]?.trim();
        if (method && HTTP_METHODS.has(method)) methods.add(method);
      }
    }
  }

  return methods.size > 0 ? [...methods] : ['GET'];
}

function deriveRoutePath(filePath: string): string {
  const apiIndex = filePath.indexOf('/api/');
  if (apiIndex < 0) return filePath;

  let route = filePath.substring(apiIndex).replace(/\/route\.(ts|tsx)$/, '');
  route = route.replace(/\[\.\.\.(\w+)\]/g, ':$1*');
  route = route.replace(/\[(\w+)\]/g, ':$1');
  return route || '/';
}

function canonicalizeToolName(name: string): string {
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

function resolveCanonicalToolName(name: string, rootDir: string): string {
  const canonicalToolNames = getCanonicalToolNames(rootDir);
  const registeredName = getRegisteredToolNames(rootDir).get(name);
  if (registeredName) return registeredName;

  const normalizedName = canonicalizeToolName(name.replace(/Tool$/, ''));
  if (canonicalToolNames.has(normalizedName)) return normalizedName;
  const compactName = normalizedName.replaceAll('_', '');
  return [...canonicalToolNames].find(
    (canonicalName) => canonicalName.replaceAll('_', '') === compactName,
  ) ?? normalizedName;
}

function getCanonicalToolNames(rootDir: string): Set<string> {
  const cached = canonicalToolNamesByRoot.get(rootDir);
  if (cached) return cached;

  let names = new Set<string>();
  try {
    const source = fs.readFileSync(path.join(rootDir, 'packages/shared/src/ai/tool-names.ts'), 'utf-8');
    names = new Set([...source.matchAll(/[\'"]([a-z0-9_]+)[\'"]/g)].map((match) => match[1]!));
  } catch {
    // Partial scans may omit the shared canonical list.
  }
  canonicalToolNamesByRoot.set(rootDir, names);
  return names;
}

function getRegisteredToolNames(rootDir: string): Map<string, string> {
  const cached = registeredToolNamesByRoot.get(rootDir);
  if (cached) return cached;

  const registrations = new Map<string, string>();
  for (const category of ['market', 'analysis', 'journal', 'system']) {
    try {
      const source = fs.readFileSync(path.join(rootDir, 'packages/ai/src/tools', `${category}.ts`), 'utf-8');
      const registrationRe = /\[['"]([^'"\]]+)["'],\s*(\w+Tool)\s*\]/g;
      for (const match of source.matchAll(registrationRe)) {
        registrations.set(match[2]!, match[1]!);
      }
    } catch {
      // Category files are optional for partial scans.
    }
  }
  registeredToolNamesByRoot.set(rootDir, registrations);
  return registrations;
}

function extractToolDescription(content: string): string {
  const descriptionMatch = content.match(/description:\s*['"]([^'"]{10,200})['"]/);
  if (descriptionMatch) return descriptionMatch[1]!.trim();

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
