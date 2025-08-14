// lib/rbac.ts
import prisma from "@/lib/prisma";

export const ROLE = {
  DIRECTOR: "Директор",
  DEPUTY_PLUS: "Заместитель +",
  DEPUTY: "Заместитель",
  TEACHER_PLUS: "Педагог +",
  TEACHER: "Педагог",
} as const;

export type Action =
  | "task.create"
  | "task.assign"
  | "task.hide"
  | "task.viewHidden"
  | "user.manage"
  | "user.updatePhone:self"
  | "user.updatePhone:any"
  | "settings.changeUi";

function rootIds(): Set<string> {
  const raw = process.env.ROOT_USER_IDS || "";
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

type RoleRow = { name: string; power: number };

export async function getUserRoles(userId: string): Promise<RoleRow[]> {
  const rows = await prisma.$queryRaw<RoleRow[]>`
    SELECT r.name, r.power
    FROM Role r
    JOIN UserRole ur ON ur.roleId = r.id
    WHERE ur.userId = ${userId}
  `;
  return rows;
}

export async function maxPower(userId: string): Promise<number> {
  if (rootIds().has(userId)) return Number.MAX_SAFE_INTEGER;
  const roles = await getUserRoles(userId);
  return roles.length ? Math.max(...roles.map((r) => r.power)) : 0;
}

export async function hasAnyRole(userId: string, names: string[]) {
  if (rootIds().has(userId)) return true;
  const roles = await getUserRoles(userId);
  return roles.some((r) => names.includes(r.name));
}

export async function can(userId: string, action: Action): Promise<boolean> {
  if (rootIds().has(userId)) return true;

  switch (action) {
    case "settings.changeUi":
    case "user.updatePhone:self":
      return true;
    case "user.manage":
    case "task.create":
    case "task.assign":
      return hasAnyRole(userId, [ROLE.DIRECTOR, ROLE.DEPUTY_PLUS]);
    case "task.hide":
      return hasAnyRole(userId, [ROLE.DIRECTOR, ROLE.DEPUTY_PLUS, ROLE.DEPUTY]);
    case "task.viewHidden":
      return hasAnyRole(userId, [ROLE.DIRECTOR, ROLE.DEPUTY_PLUS, ROLE.DEPUTY]);
    case "user.updatePhone:any":
      return hasAnyRole(userId, [ROLE.DIRECTOR, ROLE.DEPUTY_PLUS, ROLE.DEPUTY]);
    default:
      return false;
  }
}

// -------------------- Видимость задачи --------------------

type FlagRow = { hidden: number; minRolePowerToSeeHidden: number };
type CntRow = { cnt: number };

export async function canSeeTask(userId: string, taskId: string): Promise<boolean> {
  if (rootIds().has(userId)) return true;

  // 1) Флаги задачи
  const flags = await prisma.$queryRaw<FlagRow[]>`
    SELECT hidden, minRolePowerToSeeHidden
    FROM Task
    WHERE id = ${taskId}
    LIMIT 1
  `;
  if (!flags.length) return false;
  const hidden = !!flags[0].hidden;
  const threshold = flags[0].minRolePowerToSeeHidden;

  if (!hidden) return true;

  // 2) Назначен напрямую?
  const direct = await prisma.$queryRaw<CntRow[]>`
    SELECT COUNT(*) as cnt FROM TaskAssigneeUser
    WHERE taskId = ${taskId} AND userId = ${userId}
  `;
  if ((direct[0]?.cnt ?? 0) > 0) return true;

  // 3) Назначен через группу?
  const viaGroup = await prisma.$queryRaw<CntRow[]>`
    SELECT COUNT(*) as cnt
    FROM TaskAssigneeGroup tg
    JOIN GroupMember gm ON gm.groupId = tg.groupId
    WHERE tg.taskId = ${taskId} AND gm.userId = ${userId}
  `;
  if ((viaGroup[0]?.cnt ?? 0) > 0) return true;

  // 4) Достаточен ли уровень роли
  const power = await maxPower(userId);
  return power >= threshold;
}
