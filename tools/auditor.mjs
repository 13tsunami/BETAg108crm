#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Next15 CRM Auditor — single-file edition
 * Node >= 20 required. Depends only on built-ins and the "typescript" package (already present in your repo).
 * Run: node tools/auditor.mjs --root .
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import url from 'node:url';
import * as ts from 'typescript';

const CWD = process.cwd();
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function arg(name, def = null) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : def;
}

const ROOT = path.resolve(arg('--root', '.'));
const APP_DIR = path.join(ROOT, 'app');
const LIB_DIR = path.join(ROOT, 'lib');
const COMP_DIR = path.join(ROOT, 'components');
const PRISMA_SCHEMA = path.join(ROOT, 'prisma', 'schema.prisma');
const OUT_DIR = path.join(ROOT, 'tools', 'auditor-out');

function toPosix(p) { return p.split(path.sep).join('/'); }
function isSub(p, base) {
  const rel = path.relative(base, p);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}
async function walk(dir, exts = null) {
  const out = [];
  async function rec(d) {
    let ents;
    try { ents = await fsp.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.next' || e.name === '.git' || e.name === 'dist') continue;
        await rec(p);
      } else {
        if (!exts) out.push(p);
        else if (exts.some(x => p.endsWith(x))) out.push(p);
      }
    }
  }
  await rec(dir);
  return out;
}
function routeFromAppPath(appRoot, filePath) {
  const rel = toPosix(path.relative(appRoot, filePath));
  const dir = toPosix(path.dirname(rel));
  const segs = dir.split('/').filter(s => !(s.startsWith('(') && s.endsWith(')')));
  const r = '/' + segs.join('/');
  return r.replace(/\/+/g, '/');
}
function readTextSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}
function firstDirectiveLiteral(sf) {
  const stmts = sf.statements;
  if (!stmts.length) return null;
  const first = stmts[0];
  if (ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression)) {
    return first.expression.text;
  }
  return null;
}
function exportDefaultFunctionNode(sf) {
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword) && st.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      return st;
    }
    if (ts.isExportAssignment(st)) {
      const expr = st.expression;
      if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) return expr;
    }
  }
  return null;
}
function findSearchParamsInfo(sf, checker) {
  const fn = exportDefaultFunctionNode(sf);
  if (!fn) return { has: false, typeText: null, isAsync: false };
  const isAsync = !!fn.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword);
  const params = ('parameters' in fn) ? fn.parameters : [];
  if (!params?.length) return { has: false, typeText: null, isAsync };
  const p0 = params[0];
  let has = false, typeText = null;
  // pattern: ({ searchParams }: { searchParams: Promise<...> })
  if (ts.isObjectBindingPattern(p0.name)) {
    for (const el of p0.name.elements) {
      if (el.name.getText() === 'searchParams') has = true;
    }
    if (p0.type) typeText = p0.type.getText();
  } else {
    if (p0.type) {
      const tt = p0.type.getText();
      if (/searchParams\s*:/.test(tt)) { has = true; typeText = tt; }
    }
  }
  return { has, typeText, isAsync };
}
function searchParamsTypeOk(tt) {
  if (!tt) return false;
  const norm = tt.replace(/\s+/g, '');
  const ok1 = /searchParams:Promise<Record<string,(string\|string\[\]\|undefined)>>/i.test(norm);
  const ok2 = /^Promise<Record<string,(string\|string\[\]\|undefined)>>$/i.test(norm);
  return ok1 || ok2;
}
function usesClientHooksOnServer(sf) {
  const dir = firstDirectiveLiteral(sf);
  if (dir === 'use client') return false;
  const t = sf.getFullText();
  return /\buse(SearchParams|Router|State|Effect|Memo|Callback|Ref)\b/.test(t);
}
function fileEnvVars(text) {
  const set = new Set();
  const re = /process\.env\.([A-Z0-9_]+)/g;
  let m;
  while ((m = re.exec(text))) set.add(m[1]);
  return [...set].sort();
}
function exportHttpMethods(sf) {
  const methods = new Set();
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      const nm = st.name?.getText() || '';
      if (['GET','POST','PUT','PATCH','DELETE','OPTIONS','HEAD'].includes(nm)) methods.add(nm);
    }
  }
  return [...methods];
}
function hasUseServer(sf) {
  const txt = sf.getFullText();
  return /^(['"])use server\1/m.test(txt);
}
function exportedFunctions(sf) {
  const out = [];
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.modifiers?.some(m => m.kind===ts.SyntaxKind.ExportKeyword)) {
      out.push({ name: st.name?.getText() || 'default', node: st });
    }
    if (ts.isVariableStatement(st) && st.modifiers?.some(m => m.kind===ts.SyntaxKind.ExportKeyword)) {
      for (const d of st.declarationList.declarations) {
        const init = d.initializer;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          const nm = (d.name && ts.isIdentifier(d.name)) ? d.name.text : 'anonymous';
          out.push({ name: nm, node: init });
        }
      }
    }
  }
  return out;
}
function fnReturnTypeText(fn) {
  if ('type' in fn && fn.type) return fn.type.getText();
  return null;
}
function textHasRedirect(text) { return /(^|\W)redirect\(/.test(text); }
function textHasRevalidate(text) { return /(^|\W)revalidatePath\(/.test(text); }
function textHasAuth(text) { return /\bauth\(\)/.test(text) || /\bauth\(/.test(text); }
function textHasRolePredicates(text) { return /\b(can[A-Z]\w*|has[A-Z]\w*|normalizeRole)\b/.test(text); }
function textHasForbidden(text) { return /\bforbidden\b|403|redirect\(['"]\/signin|redirect\(['"]\/\)/i.test(text); }
function getImports(sf) {
  const out = [];
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st)) {
      const spec = st.moduleSpecifier.getText().replace(/^['"]|['"]$/g, '');
      out.push({ from: toPosix(sf.fileName), to: spec });
    }
  }
  return out;
}
function resolveImport(fromFile, spec) {
  if (spec.startsWith('.') || spec.startsWith('/')) {
    const base = path.dirname(fromFile);
    const abs = path.resolve(base, spec);
    const candidates = [
      abs, abs+'.ts', abs+'.tsx', abs+'.js', abs+'.jsx',
      path.join(abs, 'index.ts'), path.join(abs, 'index.tsx'),
      path.join(abs, 'page.tsx'), path.join(abs, 'route.ts')
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  }
  return null; // external or unresolved
}
function inferComponentName(sf) {
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name) return st.name.text;
  }
  return path.basename(sf.fileName);
}
function collectJsxActionsAndFetches(sf, checker) {
  const res = { jsxActions: [], fetchCalls: [], routerPushes: [] };
  function visit(node) {
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText();
      if (['action','formAction','onSubmit','onClick'].includes(name) && node.initializer) {
        let expr = null;
        if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
          expr = node.initializer.expression;
        } else if (ts.isStringLiteral(node.initializer)) {
          // ignore plain strings
        }
        if (expr) {
          // Try to resolve symbol/file of referenced function
          let targetName = null, targetFile = null;
          if (ts.isIdentifier(expr)) {
            targetName = expr.text;
            const sym = checker.getSymbolAtLocation(expr);
            if (sym) {
              for (const d of sym.declarations ?? []) {
                targetFile = d.getSourceFile().fileName;
                break;
              }
            }
          } else if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)) {
            targetName = expr.expression.text;
            const sym = checker.getSymbolAtLocation(expr.expression);
            if (sym) {
              for (const d of sym.declarations ?? []) {
                targetFile = d.getSourceFile().fileName;
                break;
              }
            }
          }
          res.jsxActions.push({
            file: toPosix(sf.fileName),
            where: name,
            targetName,
            targetFile: targetFile ? toPosix(targetFile) : null,
            snippet: expr.getText().slice(0, 200)
          });
        }
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'fetch') {
      const a0 = node.arguments[0];
      if (a0 && ts.isStringLiteral(a0)) {
        const urlStr = a0.text;
        if (urlStr.startsWith('/api/') || urlStr.startsWith('http')) {
          res.fetchCalls.push({
            file: toPosix(sf.fileName),
            url: urlStr,
            method: (node.arguments[1] && ts.isObjectLiteralExpression(node.arguments[1])) ?
              node.arguments[1].properties.find(p => ts.isPropertyAssignment(p) && p.name?.getText() === 'method')?.initializer?.getText() ?? null : null,
            snippet: node.getText().slice(0, 200)
          });
        }
      }
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const pp = node.expression;
      if (pp.name.getText() === 'push' && ts.isIdentifier(pp.expression) && pp.expression.getText().toLowerCase().includes('router')) {
        const a0 = node.arguments[0];
        if (a0 && ts.isStringLiteral(a0)) {
          res.routerPushes.push({
            file: toPosix(sf.fileName),
            to: a0.text,
            snippet: node.getText().slice(0, 200)
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return res;
}
function parsePrismaSchema(text) {
  const models = [];
  const enums = [];
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.startsWith('model ')) {
      const name = line.slice(6).split(/\s+/)[0];
      i++;
      const fields = [];
      const modelAttrs = [];
      while (i < lines.length && !lines[i].trim().startsWith('}')) {
        const raw = lines[i].trim();
        if (!raw || raw.startsWith('//')) { i++; continue; }
        if (raw.startsWith('@@')) modelAttrs.push(raw);
        else {
          const parts = raw.split(/\s+/);
          const fname = parts[0];
          const ftype = parts[1] ?? '';
          const attrs = parts.slice(2);
          fields.push({ name: fname, type: ftype, attrs });
        }
        i++;
      }
      models.push({ name, fields, modelAttrs });
    } else if (line.startsWith('enum ')) {
      const name = line.slice(5).split(/\s+/)[0];
      i++;
      const values = [];
      while (i < lines.length && !lines[i].trim().startsWith('}')) {
        const raw = lines[i].trim();
        if (raw && !raw.startsWith('//')) values.push(raw.replace(/,/, ''));
        i++;
      }
      enums.push({ name, values });
    }
    i++;
  }
  // derive ER edges
  const edges = [];
  for (const m of models) {
    for (const f of m.fields) {
      const t = f.type.replace(/\?|\[\]/g,'');
      if (models.some(mm => mm.name === t) && /@relation/.test(f.attrs.join(' '))) {
        edges.push({ from: m.name, to: t, field: f.name });
      }
    }
  }
  return { models, enums, edges };
}
async function detectEnvFiles(root) {
  const names = ['.env', '.env.local', '.env.production', '.env.development', '.env.test'];
  const out = [];
  for (const n of names) {
    const p = path.join(root, n);
    if (fs.existsSync(p)) out.push(p);
  }
  return out;
}
function scanDockerfiles(root) {
  const df = path.join(root, 'Dockerfile');
  const dc = path.join(root, 'docker-compose.yml');
  return { dockerfile: fs.existsSync(df) ? readTextSafe(df) : '', compose: fs.existsSync(dc) ? readTextSafe(dc) : '' };
}
function requiredEnvProblems(allVars, envFilesText) {
  const req = ['DATABASE_URL','DIRECT_URL','NEXTAUTH_URL','NEXTAUTH_SECRET'];
  const nice = ['UPLOADS_DIR','MAX_FILE_SIZE_MB','MAX_FILES_PER_SUBMISSION','ALLOWED_EXT'];
  const found = new Set(allVars);
  const miss = req.filter(k => !found.has(k));
  const adv = nice.filter(k => !found.has(k));
  const envMentioned = envFilesText.some(t => /NEXTAUTH_URL|DATABASE_URL|DIRECT_URL/.test(t));
  return { missingRequired: miss, missingRecommended: adv, hasEnvFiles: envFilesText.length>0, envMentioned };
}
function nowIso() { return new Date().toISOString(); }

async function main() {
  const t0 = Date.now();
  await fsp.mkdir(OUT_DIR, { recursive: true });

  const codeFiles = [
    ...(fs.existsSync(APP_DIR) ? await walk(APP_DIR, ['.ts','.tsx','.js','.jsx']) : []),
    ...(fs.existsSync(LIB_DIR) ? await walk(LIB_DIR, ['.ts','.tsx']) : []),
    ...(fs.existsSync(COMP_DIR) ? await walk(COMP_DIR, ['.ts','.tsx']) : []),
  ].filter(p => !p.endsWith('.d.ts'));

  const program = ts.createProgram(codeFiles, {
    allowJs: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    jsx: ts.JsxEmit.ReactJSX,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    moduleResolution: ts.ModuleResolutionKind.Node10
  });
  const checker = program.getTypeChecker();

  const pages = [];
  const apiRoutes = [];
  const serverActions = [];
  const imports = [];
  const problems = [];
  const envVars = new Set();
  const redirects = [];
  const revalidates = [];
  const guards = [];
  const uiWiring = { jsxActions: [], fetchCalls: [], routerPushes: [] };

  for (const sf of program.getSourceFiles()) {
    const fn = toPosix(sf.fileName);
    if (!isSub(fn, ROOT) || fn.includes('node_modules') || fn.includes('/.next/')) continue;

    const text = sf.getFullText();
    for (const v of fileEnvVars(text)) envVars.add(v);

    const redCount = (text.match(/(^|\W)redirect\(/g) || []).length;
    if (redCount) redirects.push({ file: fn, calls: redCount });
    const revCount = (text.match(/(^|\W)revalidatePath\(/g) || []).length;
    if (revCount) revalidates.push({ file: fn, calls: revCount });

    imports.push(...getImports(sf));

    const isPage = fn.endsWith('/page.tsx') || fn.endsWith('/page.ts') || fn.endsWith('/page.jsx') || fn.endsWith('/page.js');
    const isRoute = fn.endsWith('/route.ts') || fn.endsWith('/route.tsx') || fn.endsWith('/route.js') || fn.endsWith('/route.jsx');

    if (isPage && isSub(fn, APP_DIR)) {
      const route = routeFromAppPath(APP_DIR, fn);
      const dir = firstDirectiveLiteral(sf);
      const isClient = dir === 'use client';
      const sp = findSearchParamsInfo(sf, checker);
      const badHooks = usesClientHooksOnServer(sf);
      const okType = sp.has ? searchParamsTypeOk(sp.typeText) : false;
      pages.push({
        file: fn, route, isClient, hasSearchParams: sp.has, searchParamsType: sp.typeText, searchParamsOk: okType, isAsync: sp.isAsync,
        usesClientHooksOnServer: badHooks
      });
      if (sp.has && !okType) problems.push(`searchParams type mismatch at ${fn}`);
      if (!isClient && badHooks) problems.push(`client hook on server component at ${fn}`);
      if (sp.has && !sp.isAsync) problems.push(`page with searchParams is not async at ${fn}`);
      // UI wiring extraction for TSX pages
      if (fn.endsWith('tsx') || fn.endsWith('jsx')) {
        const u = collectJsxActionsAndFetches(sf, checker);
        uiWiring.jsxActions.push(...u.jsxActions);
        uiWiring.fetchCalls.push(...u.fetchCalls);
        uiWiring.routerPushes.push(...u.routerPushes);
      }
    }

    if (isRoute && isSub(fn, APP_DIR)) {
      const route = routeFromAppPath(APP_DIR, fn);
      const methods = exportHttpMethods(sf);
      apiRoutes.push({ file: fn, route, methods });
      const hasAuthCall = textHasAuth(text);
      const rolePred = textHasRolePredicates(text);
      const forb = textHasForbidden(text);
      guards.push({ file: fn, kind: 'api-route', hasAuth: hasAuthCall, hasRolePredicate: rolePred, hasEarlyForbidden: forb });
      if (!hasAuthCall) problems.push(`API route without auth() guard at ${fn}`);
    }

    if (hasUseServer(sf)) {
      for (const { name, node } of exportedFunctions(sf)) {
        const rt = fnReturnTypeText(node);
        const r = node.getText();
        const hasRed = textHasRedirect(r);
        const hasRev = textHasRevalidate(r);
        serverActions.push({ file: fn, name, returnType: rt, hasRedirect: hasRed, hasRevalidatePath: hasRev });
        if (rt && !/^Promise<void>$/i.test(rt)) problems.push(`server action ${name} should return Promise<void> at ${fn}`);
        const hasAuthCall = textHasAuth(r);
        const rolePred = textHasRolePredicates(r);
        const forb = textHasForbidden(r);
        guards.push({ file: fn, kind: 'server-action', name, hasAuth: hasAuthCall, hasRolePredicate: rolePred, hasEarlyForbidden: forb });
        if (!hasAuthCall) problems.push(`server action ${name} without auth() at ${fn}`);
      }
    }
  }

  // Reachability graph
  const edges = [];
  for (const im of imports) {
    const resolved = resolveImport(path.resolve(ROOT, im.from.replace(/^file:\/\//,'')), im.to);
    if (resolved) edges.push({ from: toPosix(path.resolve(im.from)), to: toPosix(path.resolve(resolved)) });
  }
  const seeds = new Set(
    pages.map(p => p.file)
      .concat(apiRoutes.map(r => r.file))
      .concat(codeFiles.filter(f => /\/app\/(layout|template)\.(t|j)sx?$/.test(toPosix(f))))
      .map(p => toPosix(path.resolve(p)))
  );
  const allNodes = new Set(codeFiles.map(f => toPosix(path.resolve(f))));
  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e.to);
  }
  const reachable = new Set();
  const stack = [...seeds];
  while (stack.length) {
    const cur = stack.pop();
    if (reachable.has(cur)) continue;
    reachable.add(cur);
    const outs = adj.get(cur) || [];
    for (const n of outs) if (allNodes.has(n) && !reachable.has(n)) stack.push(n);
  }
  const unreachable = [...allNodes].filter(n => !reachable.has(n) && (n.includes('/lib/') || n.includes('/components/') || n.includes('/app/')));

  // Prisma schema
  const prismaText = readTextSafe(PRISMA_SCHEMA);
  const prisma = prismaText ? parsePrismaSchema(prismaText) : { models: [], enums: [], edges: [] };

  // .env and docker
  const envFiles = await detectEnvFiles(ROOT);
  const envFilesText = envFiles.map(readTextSafe);
  const envDiag = requiredEnvProblems([...envVars], envFilesText);
  const docker = scanDockerfiles(ROOT);
  const dockerNotes = [];
  if (docker.dockerfile && !/NODE_VERSION|FROM.*node:|ARG\s+NODE_VERSION/i.test(docker.dockerfile)) dockerNotes.push('Dockerfile: node version pin not detected');
  if (docker.compose && !/volumes?:\s*[\s\S]*uploads/i.test(docker.compose)) dockerNotes.push('docker-compose: uploads volume not detected');
  if (!/UPLOADS_DIR/.test(envFilesText.join('\n'))) dockerNotes.push('UPLOADS_DIR not declared in env files');

  // Review-flow sanity (static)
  const reviewFindings = [];
  for (const a of serverActions) {
    if (/submitForReview/i.test(a.name)) {
      // naive heuristic: require updateMany open=false and create with open=true and status=submitted
      const t = readTextSafe(a.file);
      const blk = extractFunctionBlock(t, a.name);
      if (blk && !/updateMany\([\s\S]*open:\s*true[\s\S]*open:\s*false/.test(blk)) reviewFindings.push(`submitForReview: no closing of previous open submissions in ${a.file}`);
      if (blk && !/create\([\s\S]*open:\s*true/.test(blk)) reviewFindings.push(`submitForReview: new Submission not marked open=true in ${a.file}`);
    }
    if (/approve(All|Submission)/i.test(a.name) || /rejectSubmission/i.test(a.name)) {
      const t = readTextSafe(a.file);
      const blk = extractFunctionBlock(t, a.name);
      if (blk && !/open:\s*false/.test(blk)) reviewFindings.push(`${a.name}: does not close open Submission in ${a.file}`);
    }
  }

  const report = {
    generatedAt: nowIso(),
    root: toPosix(ROOT),
    summary: {
      pages: pages.length,
      apiRoutes: apiRoutes.length,
      serverActions: serverActions.length,
      prismaModels: prisma.models.length,
      prismaEnums: prisma.enums.length
    },
    pages,
    apiRoutes,
    serverActions,
    guards,
    ui: uiWiring,
    imports,
    reachability: { unreachable },
    env: {
      referenced: [...envVars].sort(),
      files: envFiles.map(toPosix)
    },
    prisma,
    docker: { notes: dockerNotes },
    problems: [...new Set(problems.concat(
      envDiag.missingRequired.map(k => `missing required env: ${k}`),
      dockerNotes,
    ))],
    reviewFlowNotes: reviewFindings
  };

  await fsp.mkdir(OUT_DIR, { recursive: true });
  const jsonPath = path.join(OUT_DIR, 'audit-report.json');
  const mdPath = path.join(OUT_DIR, 'audit-report.md');
  await fsp.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  await fsp.writeFile(mdPath, renderMarkdown(report), 'utf8');

  console.log(`Audit done in ${((Date.now()-t0)/1000).toFixed(1)}s`);
  console.log(`JSON: ${toPosix(jsonPath)}`);
  console.log(`MD:   ${toPosix(mdPath)}`);
  console.log(`Problems: ${report.problems.length}`);
}

function extractFunctionBlock(text, fnName) {
  const re = new RegExp(`export\\s+(async\\s+)?function\\s+${fnName}\\s*\\([\\s\\S]*?\\)\\s*\\{([\\s\\S]*?)\\n\\}`, 'm');
  const m = text.match(re);
  return m ? m[0] : null;
}

function renderMarkdown(r) {
  const L = [];
  L.push(`# Audit report`);
  L.push(`Date: ${r.generatedAt}`);
  L.push(`Root: ${r.root}`);
  L.push('');
  L.push(`Pages: ${r.summary.pages}, API routes: ${r.summary.apiRoutes}, Server actions: ${r.summary.serverActions}`);
  L.push(`Prisma models: ${r.summary.prismaModels}, enums: ${r.summary.prismaEnums}`);
  if (r.problems.length) {
    L.push('');
    L.push(`## Problems`);
    for (const p of r.problems) L.push(`- ${p}`);
  }
  if (r.reviewFlowNotes?.length) {
    L.push('');
    L.push(`## Review-flow notes`);
    for (const p of r.reviewFlowNotes) L.push(`- ${p}`);
  }
  L.push('');
  L.push(`## API routes`);
  for (const ar of r.apiRoutes) L.push(`- ${ar.route} -> ${ar.methods.join(', ')} (${ar.file})`);
  L.push('');
  L.push(`## Pages`);
  for (const p of r.pages) {
    const sp = p.hasSearchParams ? (p.searchParamsOk ? 'ok' : 'mismatch') : 'none';
    L.push(`- ${p.route} (${p.file}) searchParams=${sp} async=${p.isAsync} client=${p.isClient}`);
  }
  L.push('');
  L.push(`## Server actions`);
  for (const a of r.serverActions) {
    L.push(`- ${a.name} (${a.file}) return=${a.returnType ?? 'inferred'} redirect=${a.hasRedirect} revalidate=${a.hasRevalidatePath}`);
  }
  L.push('');
  L.push(`## Guards`);
  for (const g of r.guards) {
    L.push(`- ${g.kind}${g.name ? ' '+g.name : ''} (${g.file}) auth=${g.hasAuth} rolePred=${g.hasRolePredicate} earlyForbidden=${g.hasEarlyForbidden}`);
  }
  L.push('');
  L.push(`## UI wiring`);
  for (const x of r.ui.jsxActions) {
    L.push(`- ${x.file} ${x.where} -> ${x.targetName ?? '?'} (${x.targetFile ?? '?'})`);
  }
  for (const f of r.ui.fetchCalls) {
    L.push(`- ${f.file} fetch ${f.url} ${f.method ? `method=${f.method}` : ''}`.trim());
  }
  for (const rp of r.ui.routerPushes) {
    L.push(`- ${rp.file} router.push(${rp.to})`);
  }
  L.push('');
  L.push(`## Reachability`);
  for (const u of r.reachability.unreachable) L.push(`- unreachable: ${u}`);
  L.push('');
  L.push(`## Env`);
  L.push(r.env.referenced.join(', ') || '(none)');
  L.push('');
  L.push(`## Prisma models`);
  for (const m of r.prisma.models) {
    L.push(`- ${m.name}`);
    for (const f of m.fields) L.push(`  - ${f.name}: ${f.type} ${f.attrs.join(' ')}`.trim());
    for (const at of m.modelAttrs) L.push(`  - ${at}`);
  }
  if (r.prisma.edges?.length) {
    L.push('');
    L.push(`## Prisma relations`);
    for (const e of r.prisma.edges) L.push(`- ${e.from} -> ${e.to} via ${e.field}`);
  }
  L.push('');
  L.push(`## Notes`);
  for (const n of r.docker.notes || []) L.push(`- ${n}`);
  return L.join('\n');
}

main().catch(err => { console.error(err); process.exit(1); });
