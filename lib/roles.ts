// lib/roles.ts
export type Role =
  | 'user'
  | 'staff'          // техперсонал
  | 'teacher'
  | 'teacher_plus'   // Руководитель МО
  | 'deputy'
  | 'deputy_plus'
  | 'director'
  // новые ярлыки
  | 'deputy_axh'        // заместитель по АХЧ
  | 'sysadmin'          // системный администратор
  | 'food_dispatcher'   // диспетчер по питанию
  | 'psychologist'
  | 'librarian'
  | 'education_adviser'; // советник по воспитанию

// порядок ролей по иерархии прав
export const roleOrder: Role[] = [
  'user',
  'staff',
  'teacher',
  'teacher_plus',
  'deputy',
  'deputy_plus',
  'director',
  // ярлыки рядом с «родительскими» по смыслу
  'deputy_axh',
  'sysadmin',
  'food_dispatcher',
  'psychologist',
  'librarian',
  'education_adviser',
];

// карта канонизации: указываем, к какой базовой роли приравнивается ярлык
const CANONICAL: Partial<Record<Role, Role>> = {
  deputy_axh: 'deputy',
  sysadmin: 'teacher',
  food_dispatcher: 'staff',
  psychologist: 'teacher',
  librarian: 'teacher_plus',
  education_adviser: 'deputy',
};

function canon(role: Role | null | undefined): Role | null {
  if (!role) return null;
  return CANONICAL[role] ?? role;
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (roleOrder as string[]).includes(value);
}

export function normalizeRole(value: unknown): Role | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return isRole(v) ? (v as Role) : null;
}

// ====== проверки доступа (админка и задачи) ======

export function canViewAdmin(role: Role | null | undefined): boolean {
  const r = canon(role);
  return r === 'director' || r === 'deputy_plus';
}

export function canCreateTasks(role: Role | null | undefined): boolean {
  const r = canon(role);
  if (!r) return false;
  // начиная с руководителя МО (teacher_plus)
  return roleOrder.indexOf(r) >= roleOrder.indexOf('teacher_plus');
}

export function canViewTasks(role: Role | null | undefined): boolean {
  const r = canon(role);
  if (!r) return false;
  // начиная с педагога
  return roleOrder.indexOf(r) >= roleOrder.indexOf('teacher');
}

export function hasFullAccess(role: Role | null | undefined): boolean {
  const r = canon(role);
  return r === 'deputy_plus' || r === 'director';
}

// ====== проверки доступа (заявки) ======

/**
 * Создавать заявки: только педагоги и выше.
 * Соответствует формулировке «педагоги только создают».
 */
export function canCreateRequests(role: Role | null | undefined): boolean {
  const r = canon(role);
  if (!r) return false;
  return roleOrder.indexOf(r) >= roleOrder.indexOf('teacher');
}

/**
 * Обрабатывать заявки (взять в работу, закрыть, отклонить):
 * sysadmin, deputy_axh и управленцы (deputy, deputy_plus, director).
 */
export function canProcessRequests(role: Role | null | undefined): boolean {
  const raw = role ?? null;
  if (!raw) return false;

  // ярлыки с особыми правами
  if (raw === 'sysadmin' || raw === 'deputy_axh') return true;

  const r = canon(raw);
  if (!r) return false;

  // управленческий контур
  return r === 'deputy' || r === 'deputy_plus' || r === 'director';
}
