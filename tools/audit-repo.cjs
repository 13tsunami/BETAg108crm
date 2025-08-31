#!/usr/bin/env node
/* Plain Node.js auditor: пишет tools/audit-report.md */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');

const root = process.cwd();
const outDir = path.join(root, 'tools');
const outFile = path.join(outDir, 'audit-report.md');

const IGNORED_DIRS = new Set(['node_modules','.next','.git','dist','build','.turbo','.vercel','.vscode','.idea']);
const TEXT_EXT = new Set(['.ts','.tsx','.js','.jsx','.mjs','.cjs','.json','.md','.css','.scss','.sass','.prisma','.sql','.env','.yml','.yaml']);
console.log('[audit] start');            // <— ДО первой функции

async function walk(dir, base = dir, acc = []) {
  const items = await fsp.readdir(dir, { withFileTypes: true });
  for (const ent of items) {
    if (IGNORED_DIRS.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    const rel = path.relative(base, full).replace(/\\/g,'/');
    if (ent.isDirectory()) {
      acc.push({ path: full, rel, isDir: true });
      await walk(full, base, acc);
    } else {
      const st = await fsp.stat(full);
      acc.push({ path: full, rel, isDir: false, size: st.size });
    }
  }
  return acc;
}

function shortTree(entries) {
  const importantTop = new Set(['app','components','lib','prisma','styles','tools','public']);
  const rels = entries.map(e => e.rel);
  const top = [...new Set(rels.map(r => r.split('/')[0]).filter(Boolean))]
    .filter(d => importantTop.has(d) || !d.includes('/'))
    .sort();
  const lines = [];
  for (const td of top) {
    lines.push(td + '/');
    const childrenOf = (p) => rels.filter(r => r.startsWith(p + '/')).map(r => r.slice(p.length + 1));
    if (td === 'app') {
      const appChildren = childrenOf('app')
        .filter(r => r.split('/').length <= 3)
        .filter(r => /(page|layout|route)\.(t|j)sx?$/.test(r) || r.endsWith('/'))
        .sort();
      const seen = new Set();
      for (const it of appChildren) { lines.push('  ' + it); const s0 = it.split('/')[0]; if (s0) seen.add(s0); }
      for (const d of [...seen].sort()) {
        const nested = rels
          .filter(r => r.startsWith(`app/${d}/`))
          .filter(r => r.split('/').length <= 4)
          .filter(r => /(page|layout|route)\.(t|j)sx?$/.test(r) || r.endsWith('/'))
          .map(r => '    ' + r.slice(4))
          .sort();
        lines.push(...nested);
      }
    } else if (td === 'prisma') {
      for (const f of childrenOf('prisma').filter(r => r.split('/').length <= 2).sort()) lines.push('  ' + f);
    } else {
      for (const f of childrenOf(td).filter(r => r.split('/').length <= 2).sort()) lines.push('  ' + f);
    }
  }
  return lines.join('\n');
}

async function readTextSafe(file) {
  const ext = path.extname(file).toLowerCase();
  if (!TEXT_EXT.has(ext)) return '';
  try { return await fsp.readFile(file, 'utf8'); } catch { return ''; }
}

function findPages(entries) {
  const re = (rx) => entries.filter(e => !e.isDir && rx.test(e.rel));
  return {
    pages:   re(/app\/.*\/page\.(t|j)sx?$/),
    layouts: re(/app\/.*\/layout\.(t|j)sx?$/),
    routes:  re(/app\/.*\/route\.(t|j)sx?$/),
  };
}

function checkSearchParamsSignature(src) {
  const typeOk = /SearchParams\s*=\s*Promise<Record<string,\s*string\s*\|\s*string\[\]\s*\|\s*undefined\s*>>/m.test(src);
  const awaitUsage = /export\s+default\s+async\s+function\s+\w+\s*\(\s*{?\s*searchParams\s*}?:\s*SearchParams\s*\)\s*{[\s\S]*?await\s+searchParams/m.test(src);
  return { typeOk, awaitUsage };
}

function detectUseClient(src) { return /^\s*['"]use client['"]\s*;?/.test(src); }
function findServerActionFiles(entries) {
  return entries.filter(e => !e.isDir && /(actions|action)\.(t|j)s$/.test(path.basename(e.rel)));
}
function extractActionExports(src) {
  const useServer = /^\s*['"]use server['"]\s*;?/m.test(src);
  const exported = [];
  const reExp = /export\s+async\s+function\s+([A-Za-z0-9_]+)\s*\([\s\S]*?\)\s*:\s*Promise<void>/g;
  let m;
  while ((m = reExp.exec(src))) exported.push({ name: m[1], promiseVoid: true });
  const reAny = /export\s+async\s+function\s+([A-Za-z0-9_]+)\s*\(/g;
  while ((m = reAny.exec(src))) if (!exported.find(e => e.name === m[1])) exported.push({ name: m[1], promiseVoid: false });
  return { useServer, exported };
}

function parsePrismaModels(schema) {
  const models = [];
  const re = /model\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\n\}/g;
  let m;
  while ((m = re.exec(schema))) {
    const name = m[1], body = m[2];
    const fields = [], indexes = [];
    for (const raw of body.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('//')) continue;
      if (line.startsWith('@@')) { indexes.push(line); continue; }
      if (line.startsWith('@')) continue;
      const fm = /^([A-Za-z0-9_]+)\s+([A-Za-z0-9_\[\]]+)(.*)$/.exec(line);
      if (fm) fields.push({ name: fm[1], type: fm[2], attrs: fm[3].trim() });
    }
    models.push({ name, fields, indexes });
  }
  return models;
}

(async function main() {
  const entries = await walk(root, root);
  const tree = shortTree(entries);

  const { pages } = findPages(entries);
  const pageInfo = [];
  for (const p of pages) {
    const src = await readTextSafe(p.path);
    const sig = checkSearchParamsSignature(src);
    pageInfo.push({ rel: p.rel, hasUseClient: detectUseClient(src), sigTypeOk: sig.typeOk, sigAwaitOk: sig.awaitUsage,
      usesClientHooks: /\buse(SearchParams|Router|State|Effect|Memo|Callback)\b/.test(src) });
  }

  const actionFiles = findServerActionFiles(entries);
  const actionInfo = [];
  for (const f of actionFiles) {
    const src = await readTextSafe(f.path);
    const ex = extractActionExports(src);
    actionInfo.push({ rel: f.rel, useServer: ex.useServer, exported: ex.exported });
  }

  const prismaPath = entries.find(e => e.rel === 'prisma/schema.prisma')?.path;
  const prismaText = prismaPath ? await readTextSafe(prismaPath) : '';
  const prismaModels = prismaText ? parsePrismaModels(prismaText) : [];
  const focus = new Set(['Task','TaskAssignee','Note','User']);
  const prismaSpot = prismaModels.filter(m => focus.has(m.name));

  const md = [];
  md.push('# Аудит репозитория (Next.js 15 + Prisma)');
  md.push('');
  md.push('Генерация: ' + new Date().toISOString());
  md.push('');
  md.push('## Краткое дерево проекта');
  md.push('```');
  md.push(tree);
  md.push('```');
  md.push('');
  md.push('## Страницы App Router и контракт searchParams');
  for (const p of pageInfo.sort((a,b)=>a.rel.localeCompare(b.rel))) {
    const flags = [];
    if (p.hasUseClient) flags.push('use client');
    if (p.usesClientHooks) flags.push('hooks(client)');
    md.push(`- ${p.rel} — ${p.sigTypeOk?'searchParams: OK':'searchParams: MISMATCH'}, ${p.sigAwaitOk?'await used':'await MISSING'}${flags.length?'; '+flags.join(', '):''}`);
  }
  md.push('');
  md.push('## Server actions');
  for (const a of actionInfo.sort((x,y)=>x.rel.localeCompare(y.rel))) {
    const exp = a.exported.map(e => `${e.name}${e.promiseVoid?': Promise<void>':': ?'}`).join(', ');
    md.push(`- ${a.rel} ${a.useServer ? '— use server' : '— !NO use server'}; экспорт: ${exp || 'нет'}`);
  }
  md.push('');
  md.push('## Prisma: модели (коротко)');
  if (!prismaModels.length) {
    md.push('_schema.prisma не найден_');
  } else {
    md.push(prismaModels.map(m => `- ${m.name} (${m.fields.length} полей, ${m.indexes.length} индексов)`).join('\n'));
    for (const m of prismaSpot) {
      md.push('');
      md.push(`### ${m.name}`);
      md.push(m.fields.map(f => `- ${f.name}: ${f.type} ${f.attrs}`.trim()).join('\n'));
      if (m.indexes.length) { md.push(''); md.push('Индексы:'); md.push(m.indexes.join('\n')); }
    }
    const task = prismaModels.find(m => m.name === 'Task');
    const ta = prismaModels.find(m => m.name === 'TaskAssignee');
    const hasReviewFlag = !!task?.fields.find(f => f.name === 'reviewRequired');
    const hasSubmitted = !!ta?.fields.find(f => f.name === 'status') /* проверка enum упрощена */;
    const metaOk = ['submittedAt','reviewedAt','reviewedById'].every(x => ta?.fields.find(f => f.name === x));
    const hasTaskAtt = prismaModels.some(m => m.name === 'TaskAttachment');
    const hasSubAtt  = prismaModels.some(m => m.name === 'AssigneeSubmissionAttachment');
    md.push('');
    md.push('## Готовность к review-flow');
    md.push(`- Task.reviewRequired: ${hasReviewFlag ? 'да' : 'нет'}`);
    md.push(`- TaskAssignee.status включает submitted: ${hasSubmitted ? 'проверьте enum/строку' : 'нет поля status'}`);
    md.push(`- submittedAt/reviewedAt/reviewedById: ${metaOk ? 'да' : 'нет'}`);
    md.push(`- Модели вложений: TaskAttachment=${hasTaskAtt?'да':'нет'}, AssigneeSubmissionAttachment=${hasSubAtt?'да':'нет'}`);
  }

  await fsp.mkdir(outDir, { recursive: true });
  await fsp.writeFile(outFile, md.join('\n') + '\n', 'utf8');
  console.log('[audit] before write');     // <— перед записью отчёта

  process.stdout.write(`✔ Отчёт создан: ${path.relative(root, outFile)}${os.EOL}`);
})().catch(err => {
  console.error('Ошибка аудита:', err);
  process.exit(1);
});
