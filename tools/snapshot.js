// tools/snapshot.js
/* 
  Проектный снимок: строит дерево и JSON-индекс проекта Next.js (App Router).
  Запуск: node tools/snapshot.js [--include-env-names] [--max-bytes=16384]
*/

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'project-snapshot');
const MAX_BYTES = Number((process.argv.find(a => a.startsWith('--max-bytes=')) || '').split('=')[1] || 16384);
const INCLUDE_ENV_NAMES = process.argv.includes('--include-env-names');

const IGNORE_DIRS = new Set([
  'node_modules', '.next', '.turbo', '.vercel', '.git', '.cache', 'coverage', 'dist', 'build'
]);

const PAGE_FILES = new Set([
  'page.tsx', 'page.jsx',
  'layout.tsx', 'layout.jsx',
  'route.ts', 'route.js',
  'loading.tsx', 'loading.jsx',
  'error.tsx', 'error.jsx',
  'template.tsx', 'template.jsx',
  'default.tsx', 'default.jsx',
  'not-found.tsx', 'not-found.jsx'
]);

async function ensureOut() {
  await fsp.mkdir(OUT_DIR, { recursive: true });
}

function isTextFile(fp) {
  return /\.(tsx?|jsx?|css|md|json|yml|yaml|env|toml|prisma|sql|svg|html?)$/i.test(fp);
}

async function sha1OfFile(fp) {
  try {
    const h = crypto.createHash('sha1');
    const s = fs.createReadStream(fp);
    return await new Promise((res, rej) => {
      s.on('data', d => h.update(d));
      s.on('end', () => res(h.digest('hex')));
      s.on('error', rej);
    });
  } catch {
    return null;
  }
}

function appRouteFromFile(appDir, fileAbs) {
  // Преобразуем app/(group)/users/[id]/page.tsx -> /users/[id]
  const rel = path.relative(appDir, fileAbs).replaceAll(path.sep, '/');
  const parts = rel.split('/');
  // убираем файл
  parts.pop();
  const segments = parts.filter(seg => !(seg.startsWith('(') && seg.endsWith(')')));
  const route = '/' + segments.join('/');
  return route.replace(/\/+/g, '/');
}

function detectIsClient(fileText) {
  // 'use client' в начале файла?
  const head = fileText.slice(0, 512);
  return /['"]use client['"]/.test(head);
}

function detectHasUseServer(fileText) {
  return /['"]use server['"]/.test(fileText);
}

function detectExports(fileText) {
  const exp = {
    dynamic: /export\s+const\s+dynamic\s*=\s*['"`][^'"`]+['"`]/.test(fileText),
    revalidate: /export\s+const\s+revalidate\s*=/.test(fileText),
    generateMetadata: /export\s+async\s+function\s+generateMetadata|export\s+function\s+generateMetadata/.test(fileText),
    metadata: /export\s+const\s+metadata\s*=/.test(fileText),
  };
  return exp;
}

function detectSearchParamsMention(fileText) {
  // не парсим строго типы, просто фиксируем, что параметр встречается в сигнатуре
  return /(export\s+default\s+async\s+function|export\s+default\s+function)\s*\([\s\S]*searchParams\s*:?\s*/.test(fileText);
}

async function readHead(fp, maxBytes = MAX_BYTES) {
  try {
    const fh = await fsp.open(fp, 'r');
    const { buffer, bytesRead } = await fh.read(Buffer.alloc(Math.min(maxBytes, (await fh.stat()).size)), 0, Math.min(maxBytes, (await fh.stat()).size), 0);
    await fh.close();
    return buffer.toString('utf8', 0, bytesRead);
  } catch {
    return '';
  }
}

async function walk(dir, acc = []) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (IGNORE_DIRS.has(e.name)) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walk(abs, acc);
    } else {
      acc.push(abs);
    }
  }
  return acc;
}

function toTree(lines) {
  // Формируем красивое дерево для README/вложения
  const root = {};
  for (const rel of lines) {
    const parts = rel.split('/');
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      node.children = node.children || {};
      node.children[p] = node.children[p] || {};
      node = node.children[p];
    }
  }
  function render(node, prefix = '') {
    const names = Object.keys(node.children || {}).sort();
    const out = [];
    names.forEach((name, idx) => {
      const isLast = idx === names.length - 1;
      const branch = isLast ? '└─ ' : '├─ ';
      out.push(prefix + branch + name);
      const child = node.children[name];
      if (child && child.children) {
        out.push(...render(child, prefix + (isLast ? '   ' : '│  ')));
      }
    });
    return out;
  }
  return render({ children: { '': { children: root.children } } }).slice(1).join('\n');
}

async function extractUiHints(project) {
  const hints = { brand: null, sidebarWidthPx: null };
  try {
    const sidebar = path.join(ROOT, 'components', 'Sidebar.tsx');
    const txt = await fsp.readFile(sidebar, 'utf8').catch(() => '');
    if (txt) {
      const brandMatch = txt.match(/const\s+BRAND\s*=\s*['"`]([^'"`]+)['"`]/);
      if (brandMatch) hints.brand = brandMatch[1];
      const widthMatch = txt.match(/width:\s*(\d+)px/);
      if (widthMatch) hints.sidebarWidthPx = Number(widthMatch[1]);
    }
  } catch {}
  return hints;
}

async function parseEnvNames() {
  const out = {};
  try {
    const envPath = path.join(ROOT, '.env');
    const s = await fsp.readFile(envPath, 'utf8').catch(() => '');
    if (!s) return out;
    for (const line of s.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (m) out[m[1]] = true;
    }
  } catch {}
  return Object.keys(out);
}

(async function main() {
  await ensureOut();

  const filesAbs = await walk(ROOT);
  // список относительных путей (красиво для дерева)
  const rels = filesAbs
    .map(abs => path.relative(ROOT, abs).replaceAll(path.sep, '/'))
    .filter(rel => !rel.startsWith('project-snapshot/'))
    .sort();

  // собираем индекс
  const appDir = path.join(ROOT, 'app');
  const index = {
    generatedAt: new Date().toISOString(),
    root: path.basename(ROOT),
    node: process.version,
    next: 'unknown',
    uiHints: await extractUiHints(),
    envVarNames: INCLUDE_ENV_NAMES ? await parseEnvNames() : [],
    files: []
  };

  for (const rel of rels) {
    const abs = path.join(ROOT, rel);
    const stat = await fsp.stat(abs).catch(() => null);
    if (!stat || !stat.isFile()) continue;

    const ext = path.extname(rel).toLowerCase();
    const size = stat.size;
    const isInApp = rel.startsWith('app/');
    const isPageLike = isInApp && PAGE_FILES.has(path.basename(rel));

    const rec = {
      path: rel,
      size,
      hash: await sha1OfFile(abs),
      textSample: null,
      kind: isInApp ? (isPageLike ? 'app-route-file' : 'app-helper-file') : guessKind(rel),
      routePath: null,
      pageType: isPageLike ? path.basename(rel).replace(/\.(t|j)sx?$/i, '') : null,
      isClient: false,
      hasUseServer: false,
      exportsFlags: null,
      mentionsSearchParams: false,
    };

    if (isTextFile(rel)) {
      const head = await readHead(abs);
      rec.textSample = head.slice(0, 4000);
      rec.isClient = detectIsClient(head);
      rec.hasUseServer = detectHasUseServer(head);
      rec.exportsFlags = detectExports(head);
      rec.mentionsSearchParams = detectSearchParamsMention(head);
      if (isPageLike) {
        rec.routePath = appRouteFromFile(appDir, abs);
      }
    }

    index.files.push(rec);
  }

  // Сохраняем JSON
  const jsonPath = path.join(OUT_DIR, 'index.json');
  await fsp.writeFile(jsonPath, JSON.stringify(index, null, 2), 'utf8');

  // Генерим дерево
  const tree = toTree(rels.filter(p => !p.startsWith('project-snapshot/')));
  const md = [
    `# Project snapshot: ${index.root}`,
    '',
    `Generated: ${index.generatedAt}`,
    '',
    '## UI hints',
    '```json',
    JSON.stringify(index.uiHints, null, 2),
    '```',
    INCLUDE_ENV_NAMES ? '## .env keys (names only)\n```text\n' + index.envVarNames.join('\n') + '\n```' : '',
    '## Tree',
    '```text',
    tree,
    '```',
    '',
    '## Routes (App Router)',
    '```text',
    index.files
      .filter(f => f.kind === 'app-route-file' && f.routePath)
      .map(f => `${f.routePath}  ⟶  app/${path.relative('app', f.path).replace(/\\/g, '/')}`)
      .sort()
      .join('\n'),
    '```',
  ].filter(Boolean).join('\n');

  const mdPath = path.join(OUT_DIR, 'tree.md');
  await fsp.writeFile(mdPath, md, 'utf8');

  console.log('✔ snapshot written to:', path.relative(ROOT, OUT_DIR));
  console.log('  -', path.relative(ROOT, jsonPath));
  console.log('  -', path.relative(ROOT, mdPath));
})().catch(err => {
  console.error('snapshot failed:', err);
  process.exit(1);
});

function guessKind(rel) {
  if (rel.startsWith('components/')) return 'component';
  if (rel.startsWith('lib/')) return 'lib';
  if (rel.startsWith('styles/')) return 'style';
  if (rel.startsWith('prisma/')) return 'prisma';
  if (rel.startsWith('public/')) return 'public';
  if (rel.endsWith('package.json')) return 'package';
  if (rel.endsWith('.env') || /\/\.env(\..+)?$/.test(rel)) return 'env';
  return 'file';
}
