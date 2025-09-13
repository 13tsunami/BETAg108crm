// lib/roleLabels.ts
import type { Role } from './roles';

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

// какие роли реально показывать в UI (например, в формах выбора)
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
