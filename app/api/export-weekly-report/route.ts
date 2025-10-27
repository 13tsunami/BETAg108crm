// app/api/export-weekly-report/route.ts
import type { NextRequest } from 'next/server';
import { auth } from '@/auth.config';
import { normalizeRole, type Role } from '@/lib/roles';
import { createWorkbook, addSheet, applyAutoWidth, enableWrapAll, buildFilenames, toArrayBuffer } from '@/lib/excel';
import { nowUtc, window7dUtc, formatForFilename, formatRangeRu, EKB_TZ } from '@/lib/dt';

export const runtime = 'nodejs';

type Scope = 'me' | 'all';

function isDeputyOrHigher(role: Role | null | undefined): boolean {
  return role === 'deputy' || role === 'deputy_plus' || role === 'director' || role === 'sysadmin' || role === 'deputy_axh';
}

export async function POST(req: NextRequest): Promise<Response> {
  const session = await auth();
  const role = normalizeRole(session?.user?.role);

  if (!role) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  let scope: Scope = 'me';
  let options: string[] = [];

  if (typeof (body as any)?.scope === 'string' && ((body as any).scope === 'me' || (body as any).scope === 'all')) {
    scope = (body as any).scope as Scope;
  }
  if (Array.isArray((body as any)?.options)) {
    options = (body as any).options as string[];
  }

  // Принудительные ограничения доступа
  if (!isDeputyOrHigher(role)) {
    scope = 'me';
    // опции для учителя сузим позже на этапе фактической генерации
  }

  // Окно 7 суток «на сейчас»
  const to = nowUtc();
  const { from } = window7dUtc(to);

  // Пустая книга с листом «Итоги» — каркас для первичной проверки
  const wb = createWorkbook({ creator: 'g108crm' });
  const ws = addSheet(wb, 'Итоги', [
    { header: 'Параметр', key: 'k', wrap: true },
    { header: 'Значение', key: 'v', wrap: true },
  ]);

  ws.addRow({ k: 'Период', v: formatRangeRu(from, to) });
  ws.addRow({ k: 'Часовой пояс', v: EKB_TZ });
  ws.addRow({ k: 'Скоуп', v: scope === 'me' ? 'Мои' : 'По всем' });
  ws.addRow({ k: 'Сформировал', v: session?.user?.name ?? '—' });
  ws.addRow({ k: 'Опции', v: options.join(', ') || '—' });

  enableWrapAll(ws);
  applyAutoWidth(ws);

  // Имя файла
  const suffix = formatForFilename(to);
  const scopeLabel = scope === 'me' ? 'Мои' : 'По-всем';
  const baseName = `Отчет_недели_${scopeLabel}_${suffix}_ekb`;
  const { asciiFallback, rfc5987 } = buildFilenames(baseName);

  const buf = await toArrayBuffer(wb);

  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // Два имени: ASCII-фолбэк и RFC5987 для кириллицы
      'Content-Disposition': `attachment; filename="${asciiFallback}"; filename*=${rfc5987}`,
      'Cache-Control': 'no-store',
    },
  });
}
