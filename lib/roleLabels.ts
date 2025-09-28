// lib/roleLabels.ts
import type { Role } from './roles';
import { normalizeRole } from './roles';

export const ROLE_LABELS: Record<Role, string> = {
  user: 'Пользователь',
  staff: 'Техперсонал',
  teacher: 'Педагог',
  teacher_plus: 'Руководитель МО',
  deputy: 'Заместитель',
  deputy_plus: 'Заместитель*',
  director: 'Директор',
  deputy_axh: 'Заместитель по АХЧ',
  sysadmin: 'Системный администратор',
  food_dispatcher: 'Диспетчер по питанию',
  psychologist: 'Психолог',
  librarian: 'Библиотекарь',
  education_adviser: 'Советник по воспитанию',
};

/**
 * Человекочитаемая метка для произвольного значения роли.
 * Если значение не распознано, возвращает fallback.
 */
export function roleLabel(value: unknown, fallback = '—'): string {
  const r = normalizeRole(value);
  return r ? ROLE_LABELS[r] : fallback;
}

/**
 * Порядок показа ролей в UI (селекты, фильтры и т. п.).
 * Можно менять без влияния на проверки доступа.
 */
export const VISIBLE_ROLES: Role[] = [
  'director',
  'deputy_plus',
  'deputy',
  'deputy_axh',
  'teacher_plus',
  'teacher',
  'sysadmin',
  'psychologist',
  'librarian',
  'education_adviser',
  'staff',
  'user',
  'food_dispatcher',
];
