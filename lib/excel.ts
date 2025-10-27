// lib/excel.ts
// Утилиты для сборки .xlsx: книга, листы, автоширина, перенос строк,
// склейка многозначных полей, безопасное имя файла (ASCII + RFC5987).

import ExcelJS from 'exceljs';

export type ColumnSpec = {
  header: string;
  key: string;
  width?: number; // если не задана — поставим автоширину
  wrap?: boolean; // если true — включим перенос строк
};

export function createWorkbook(meta?: { creator?: string }): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = meta?.creator ?? 'g108crm';
  wb.created = new Date();
  wb.modified = new Date();
  return wb;
}

/** Создать лист с колонками, заголовками и фильтрами в первой строке */
export function addSheet(
  wb: ExcelJS.Workbook,
  name: string,
  columns: ColumnSpec[],
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name, { views: [{ showGridLines: false }] });

  ws.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width, // если ширина не задана — потом выставим автоширину
    style: c.wrap ? { alignment: { wrapText: true } } : undefined,
  }));

  // Фильтры для строки заголовков
  if (columns.length > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };
  }

  // Жирный шрифт заголовка
  ws.getRow(1).font = { bold: true };

  return ws;
}

/** Включить перенос строк для всех колонок */
export function enableWrapAll(ws: ExcelJS.Worksheet): void {
  ws.columns.forEach((col) => {
    if (!col) return;
    col.style = col.style ?? {};
    col.style.alignment = { ...(col.style.alignment ?? {}), wrapText: true };
  });
}

/** Автоширина: по максимальной длине содержимого в колонке с коэффициентом */
export function applyAutoWidth(
  ws: ExcelJS.Worksheet,
  { min = 10, max = 60, factor = 1.12 }: { min?: number; max?: number; factor?: number } = {},
): void {
  for (let i = 1; i <= ws.columnCount; i += 1) {
    const col = ws.getColumn(i);
    if (typeof col.width === 'number') continue;

    const header = typeof col.header === 'string' ? col.header : '';
    let maxLen = visibleLength(header);

    col.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      const s =
        v == null
          ? ''
          : typeof v === 'string'
          ? v
          : typeof v === 'number'
          ? String(v)
          : (v as any).text ??
            (v as any).richText?.map((t: any) => t.text).join('') ??
            String(v);
      maxLen = Math.max(maxLen, visibleLength(s));
    });

    const w = Math.min(max, Math.max(min, Math.ceil(maxLen * factor)));
    col.width = w;
  }
}


function visibleLength(s: string): number {
  // Грубая оценка ширины: кириллицу считаем как 1.1 латинской
  const base = s.length;
  const cyr = (s.match(/[А-Яа-яЁё]/g) ?? []).length;
  return Math.round(base + cyr * 0.1);
}

/** Мягкая заливка строки (например, для просрочки/отклонённых) */
export function tintRow(
  ws: ExcelJS.Worksheet,
  rowNumber: number,
  kind: 'warning' | 'muted',
): void {
  const row = ws.getRow(rowNumber);
  const fill =
    kind === 'warning'
      ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } } // светло-жёлтая
      : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }; // светло-серая
  row.eachCell((cell) => {
    cell.fill = fill as ExcelJS.Fill;
  });
}

/** Склейка многозначных полей с лимитом и «+N ещё» */
export function joinMany(items: Array<string | number>, limit = 10): string {
  const list = items.map((x) => String(x)).filter((x) => x.length > 0);
  if (list.length <= limit) return list.join(', ');
  const rest = list.length - limit;
  return `${list.slice(0, limit).join(', ')} +${rest} ещё`;
}

/** Имя файла + ASCII-фолбэк и RFC5987-параметр для Content-Disposition */
export function buildFilenames(base: string): {
  original: string;
  asciiFallback: string;
  rfc5987: string;
} {
  const original = `${base}.xlsx`;
  const asciiFallback = original.replace(/[^\x20-\x7E]/g, '_');
  const rfc5987 = `UTF-8''${encodeURIComponent(original)}`;
  return { original, asciiFallback, rfc5987 };
}

/** Сериализация книги в ArrayBuffer для отдачи в API-роуте */
export async function toArrayBuffer(wb: ExcelJS.Workbook): Promise<ArrayBuffer> {
  return wb.xlsx.writeBuffer();
}
