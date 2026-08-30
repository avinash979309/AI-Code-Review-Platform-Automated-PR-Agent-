/**
 * AST analyzer: extracts functions, classes, imports, exports, and complexity
 * from a parsed Babel AST. Uses @babel/traverse for structured traversal.
 */
import traverse from '@babel/traverse';
import type { File } from '@babel/types';
import { countNodes } from './parser.js';

export interface FunctionInfo {
  name: string | null;
  startLine: number;
  endLine: number;
  params: string[];
  async: boolean;
}

export interface ClassInfo {
  name: string | null;
  startLine: number;
  endLine: number;
  methods: string[];
}

export interface ImportInfo {
  source: string;
  specifiers: string[];
  isDefault: boolean;
  isNamespace: boolean;
}

export interface ExportInfo {
  name: string;
  type: 'named' | 'default' | 'namespace';
}

export interface ComplexityInfo {
  cyclomaticComplexity: number;
  maxNestingDepth: number;
  branchCount: number;
}

export interface ASTAnalysis {
  nodeCount: number;
  functions: FunctionInfo[];
  classes: ClassInfo[];
  imports: ImportInfo[];
  exports: ExportInfo[];
  complexity: ComplexityInfo;
}

function getParamName(param: unknown): string {
  if (!param || typeof param !== 'object') return '?';
  const p = param as Record<string, unknown>;
  if (p['type'] === 'Identifier') return String(p['name'] ?? '?');
  if (p['type'] === 'AssignmentPattern') return getParamName(p['left']);
  if (p['type'] === 'RestElement') return `...${getParamName(p['argument'])}`;
  if (p['type'] === 'ObjectPattern') return '{...}';
  if (p['type'] === 'ArrayPattern') return '[...]';
  if (p['type'] === 'TSParameterProperty') return getParamName(p['parameter']);
  return '?';
}

export function analyzeAST(ast: File): ASTAnalysis {
  const functions: FunctionInfo[] = [];
  const classes: ClassInfo[] = [];
  const imports: ImportInfo[] = [];
  const exports: ExportInfo[] = [];

  let cyclomaticComplexity = 1; // baseline
  let branchCount = 0;
  let maxNestingDepth = 0;
  let currentDepth = 0;

  traverse(ast, {
    // --- Functions ---
    FunctionDeclaration(path) {
      const node = path.node;
      functions.push({
        name: node.id?.name ?? null,
        startLine: node.loc?.start.line ?? 0,
        endLine: node.loc?.end.line ?? 0,
        params: node.params.map(getParamName),
        async: node.async,
      });
    },
    FunctionExpression(path) {
      const node = path.node;
      // Named function expression or assigned to variable
      const parent = path.parent;
      let name: string | null = node.id?.name ?? null;
      if (!name && parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier') {
        name = parent.id.name;
      }
      if (!name && parent.type === 'ObjectProperty' && parent.key.type === 'Identifier') {
        name = parent.key.name;
      }
      functions.push({
        name,
        startLine: node.loc?.start.line ?? 0,
        endLine: node.loc?.end.line ?? 0,
        params: node.params.map(getParamName),
        async: node.async,
      });
    },
    ArrowFunctionExpression(path) {
      const node = path.node;
      const parent = path.parent;
      let name: string | null = null;
      if (parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier') {
        name = parent.id.name;
      }
      if (parent.type === 'ObjectProperty' && parent.key.type === 'Identifier') {
        name = parent.key.name;
      }
      functions.push({
        name,
        startLine: node.loc?.start.line ?? 0,
        endLine: node.loc?.end.line ?? 0,
        params: node.params.map(getParamName),
        async: node.async,
      });
    },

    // --- Classes ---
    ClassDeclaration(path) {
      const node = path.node;
      const methods: string[] = [];
      for (const member of node.body.body) {
        if (member.type === 'ClassMethod' || member.type === 'ClassPrivateMethod') {
          const key = member.key;
          if (key.type === 'Identifier') methods.push(key.name);
          else if (key.type === 'StringLiteral') methods.push(key.value);
        }
      }
      classes.push({
        name: node.id?.name ?? null,
        startLine: node.loc?.start.line ?? 0,
        endLine: node.loc?.end.line ?? 0,
        methods,
      });
    },
    ClassExpression(path) {
      const node = path.node;
      const parent = path.parent;
      let name: string | null = node.id?.name ?? null;
      if (!name && parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier') {
        name = parent.id.name;
      }
      const methods: string[] = [];
      for (const member of node.body.body) {
        if (member.type === 'ClassMethod' || member.type === 'ClassPrivateMethod') {
          const key = member.key;
          if (key.type === 'Identifier') methods.push(key.name);
        }
      }
      classes.push({
        name,
        startLine: node.loc?.start.line ?? 0,
        endLine: node.loc?.end.line ?? 0,
        methods,
      });
    },

    // --- Imports ---
    ImportDeclaration(path) {
      const node = path.node;
      const specifiers: string[] = [];
      let isDefault = false;
      let isNamespace = false;
      for (const s of node.specifiers) {
        if (s.type === 'ImportDefaultSpecifier') {
          specifiers.push(s.local.name);
          isDefault = true;
        } else if (s.type === 'ImportNamespaceSpecifier') {
          specifiers.push(`* as ${s.local.name}`);
          isNamespace = true;
        } else if (s.type === 'ImportSpecifier') {
          const imported = s.imported.type === 'Identifier' ? s.imported.name : s.imported.value;
          specifiers.push(imported);
        }
      }
      imports.push({
        source: node.source.value,
        specifiers,
        isDefault,
        isNamespace,
      });
    },

    // --- Exports ---
    ExportNamedDeclaration(path) {
      const node = path.node;
      if (node.declaration) {
        const decl = node.declaration;
        if (decl.type === 'FunctionDeclaration' && decl.id) {
          exports.push({ name: decl.id.name, type: 'named' });
        } else if (decl.type === 'ClassDeclaration' && decl.id) {
          exports.push({ name: decl.id.name, type: 'named' });
        } else if (decl.type === 'VariableDeclaration') {
          for (const v of decl.declarations) {
            if (v.id.type === 'Identifier') {
              exports.push({ name: v.id.name, type: 'named' });
            }
          }
        }
      }
      for (const s of node.specifiers) {
        if (s.type === 'ExportSpecifier') {
          const exported = s.exported.type === 'Identifier' ? s.exported.name : s.exported.value;
          exports.push({ name: exported, type: 'named' });
        }
      }
    },
    ExportDefaultDeclaration() {
      exports.push({ name: 'default', type: 'default' });
    },
    ExportAllDeclaration() {
      exports.push({ name: '*', type: 'namespace' });
    },

    // --- Complexity (cyclomatic) ---
    IfStatement() { cyclomaticComplexity++; branchCount++; },
    ConditionalExpression() { cyclomaticComplexity++; branchCount++; },
    LogicalExpression(path) {
      if (path.node.operator === '&&' || path.node.operator === '||') {
        cyclomaticComplexity++;
        branchCount++;
      }
    },
    SwitchCase(path) {
      if (path.node.test !== null) { cyclomaticComplexity++; branchCount++; }
    },
    WhileStatement() { cyclomaticComplexity++; },
    DoWhileStatement() { cyclomaticComplexity++; },
    ForStatement() { cyclomaticComplexity++; },
    ForInStatement() { cyclomaticComplexity++; },
    ForOfStatement() { cyclomaticComplexity++; },
    CatchClause() { cyclomaticComplexity++; },

    // --- Nesting depth ---
    BlockStatement: {
      enter() {
        currentDepth++;
        if (currentDepth > maxNestingDepth) maxNestingDepth = currentDepth;
      },
      exit() { currentDepth--; },
    },
  });

  const nodeCount = countNodes(ast);

  return {
    nodeCount,
    functions,
    classes,
    imports,
    exports,
    complexity: { cyclomaticComplexity, maxNestingDepth, branchCount },
  };
}
