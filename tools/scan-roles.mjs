// tools/scan-roles.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const INCLUDE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.html']);
const EXCLUDE_DIRS = new Set(['node_modules', '.next', '.turbo', 'dist', 'build', '.git']);

const ROLES = ['guest','user','student','staff','teacher','teacher_plus','deputy','deputy_plus','director'];
const rolesGroup = ROLES.map(r => r.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')).join('|');

const reSelectRole = /<select[^>]*\bname\s*=\s*["']role["'][^>]*>/i;
const reOptionRole = new RegExp(`<option[^>]*\\bvalue\\s*=\\s*["'](${rolesGroup})["']`, 'i');
const reRoleEq = new RegExp(`\\brole\\s*===\\s*["'](${rolesGroup})["']`, 'i');
const reROLE_RU = /\bROLE_RU\b|\bRecord\s*<\s*string\s*,\s*string\s*>\s*=\s*{/i;

const findings = [];

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (EXCLUDE_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { await walk(p); continue; }
    const ext = path.extname(e.name);
    if (!INCLUDE_EXT.has(ext)) continue;

    const text = await fs.readFile(p, 'utf8');

    // 1) select role + options
    if (reSelectRole.test(text) || reOptionRole.test(text)) {
      scanLines(p, text, [
        { tag: 'SELECT_ROLE', regex: reSelectRole },
        { tag: 'OPTION_ROLE', regex: reOptionRole },
      ]);
    }

    // 2) прямые сравнения роли
    if (reRoleEq.test(text)) {
      scanLines(p, text, [{ tag: 'ROLE_EQUALS', regex: reRoleEq }]);
    }

    // 3) локальные словари подписей
    if (reROLE_RU.test(text)) {
      scanLines(p, text, [{ tag: 'ROLE_LABELS', regex: reROLE_RU }]);
    }

    // 4) teacher_plus следы
    if (/teacher_plus/.test(text)) {
      scanLines(p, text, [{ tag: 'TEACHER_PLUS', regex: /teacher_plus/ }]);
    }
  }
}

function scanLines(file, text, rules) {
  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    for (const r of rules) {
      const m = line.match(r.regex);
      if (m) {
        findings.push({
          file,
          line: idx + 1,
          tag: r.tag,
          match: (m[0] || '').slice(0, 200),
        });
      }
    }
  });
}

(async () => {
  await walk(ROOT);
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  // Группа по файлу
  let cur = '';
  for (const f of findings) {
    if (f.file !== cur) {
      cur = f.file;
      console.log('\n' + cur);
    }
    console.log(`  ${String(f.line).padStart(5)}  [${f.tag}]  ${f.match}`);
  }
  if (!findings.length) {
    console.log('OK: жёстких упоминаний ролей не найдено.');
  }
})();
