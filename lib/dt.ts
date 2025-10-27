// lib/dt.ts
// Время и форматирование для ru-RU с TZ Asia/Yekaterinburg.
// Используем dayjs для вычислений и Intl для вывода (устойчиво к переходам времени).

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import localizedFormat from 'dayjs/plugin/localizedFormat';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(localizedFormat);

export const EKB_TZ = 'Asia/Yekaterinburg' as const;

type DateInput = Date | number | string;

/** Текущее «серверное» время как UTC-миг */
export function nowUtc(): Date {
  // dayjs().toDate() возвращает текущий момент; хранение/фильтры — в UTC.
  return dayjs().toDate();
}

/** Окно «7 суток на сейчас» в UTC (для Prisma-фильтров) */
export function window7dUtc(to?: DateInput): { from: Date; to: Date } {
  const end = dayjs(to ?? undefined);
  const start = end.subtract(7, 'day');
  return { from: start.toDate(), to: end.toDate() };
}

/** Форматирование момента в ru-RU и TZ Екб. С временем по умолчанию. */
export function formatRu(date: DateInput, withTime = true): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  const base: Intl.DateTimeFormatOptions = {
    timeZone: EKB_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  };
  const opts: Intl.DateTimeFormatOptions = withTime
    ? { ...base, hour: '2-digit', minute: '2-digit' }
    : base;
  return new Intl.DateTimeFormat('ru-RU', opts).format(d);
}

/** YYYY-MM-DD_HH-mm — для имени файла */
export function formatForFilename(date: DateInput): string {
  const z = dayjs(date).tz(EKB_TZ);
  const yyyy = z.year();
  const mm = String(z.month() + 1).padStart(2, '0');
  const dd = String(z.date()).padStart(2, '0');
  const hh = String(z.hour()).padStart(2, '0');
  const min = String(z.minute()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}_${hh}-${min}`;
}

/** Диапазон в шапку «Итогов»: «с … по … (Asia/Yekaterinburg)» */
export function formatRangeRu(from: DateInput, to: DateInput): string {
  return `с ${formatRu(from, true)} по ${formatRu(to, true)} (${EKB_TZ})`;
}

/** Часы между двумя моментами (дробное, с двумя знаками) */
export function hoursBetween(a: DateInput, b: DateInput): number {
  const diffMs = Math.abs(dayjs(a).diff(dayjs(b)));
  return Math.round((diffMs / 36e5) * 100) / 100;
}
