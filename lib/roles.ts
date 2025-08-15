// lib/roles.ts
export type Role =
  | 'guest'
  | 'user'
  | 'student'
  | 'staff'
  | 'teacher'
  | 'deputy'
  | 'deputy_plus'
  | 'director';

export const roleOrder: Role[] = [
  'guest',
  'user',
  'student',
  'staff',
  'teacher',
  'deputy',
  'deputy_plus',
  'director',
];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (roleOrder as string[]).includes(value);
}

export function normalizeRole(value: unknown): Role | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return isRole(v) ? (v as Role) : null;
}

export function canViewAdmin(role: Role | null | undefined): boolean {
  return role === 'director' || role === 'deputy_plus';
}

export function canCreateTasks(role: Role | null | undefined): boolean {
  if (!role) return false;
  return roleOrder.indexOf(role) >= roleOrder.indexOf('deputy');
}

export function canViewTasks(role: Role | null | undefined): boolean {
  if (!role) return false;
  return roleOrder.indexOf(role) >= roleOrder.indexOf('teacher');
}

export function hasFullAccess(role: Role | null | undefined): boolean {
  return role === 'deputy_plus' || role === 'director';
}
