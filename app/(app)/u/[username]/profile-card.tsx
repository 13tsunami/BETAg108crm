// app/(app)/u/[username]/profile-card.tsx
import Image from 'next/image';
import { ROLE_LABELS } from '@/lib/roleLabels';
import { normalizeRole } from '@/lib/roles';
import type { Prisma } from '@prisma/client';
import s from './profile-card.module.css';

export type UserProfileSelect = {
  id: true;
  name: true;
  username: true;
  email: true;
  phone: true;
  telegram: true;
  role: true;
  classroom: true;
  subjects: true;           // денормализованная строка (fallback)
  methodicalGroups: true;   // денормализованная строка (fallback)
  about: true;
  avatarUrl: true;
  lastSeen: true;

  // нормализованные связи — новые:
  subjectMemberships: { select: { subject: { select: { name: true } } } };
  groupMemberships: { select: { group: { select: { name: true } } } };
};

export const userProfileSelect: UserProfileSelect = {
  id: true,
  name: true,
  username: true,
  email: true,
  phone: true,
  telegram: true,
  role: true,
  classroom: true,
  subjects: true,
  methodicalGroups: true,
  about: true,
  avatarUrl: true,
  lastSeen: true,

  subjectMemberships: { select: { subject: { select: { name: true } } } },
  groupMemberships: { select: { group: { select: { name: true } } } },
};

export type UserProfileData = Prisma.UserGetPayload<{ select: UserProfileSelect }>;

const SCHOOL_TZ = 'Asia/Yekaterinburg';

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const first = parts[0].replace('-', '')[0] ?? '';
  const second = parts[1].replace('-', '')[0] ?? '';
  return (first + second).toUpperCase();
}

function fmtDate(d?: Date | null): string {
  if (!d) return '';
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: SCHOOL_TZ,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return d?.toISOString() ?? '';
  }
}

function roleLabel(roleRaw: string | null): string {
  const r = normalizeRole(roleRaw);
  return r ? ROLE_LABELS[r] : 'роль не указана';
}

function fmtListValue(v: unknown): string {
  if (Array.isArray(v)) {
    const arr = v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
    return arr.length ? arr.join(', ') : '—';
  }
  if (typeof v === 'string') {
    const s = v.trim();
    return s ? s : '—';
  }
  return '—';
}

// Собираем имена из нормализованных связей; если пусто — используем строковые поля
function subjectsDisplay(user: UserProfileData): string {
  const norm = (user.subjectMemberships ?? [])
    .map((m) => m.subject?.name?.trim())
    .filter(Boolean) as string[];
  if (norm.length) return norm.join(', ');
  return fmtListValue((user as any).subjects);
}

function groupsDisplay(user: UserProfileData): string {
  const norm = (user.groupMemberships ?? [])
    .map((m) => m.group?.name?.trim())
    .filter(Boolean) as string[];
  if (norm.length) return norm.join(', ');
  return fmtListValue((user as any).methodicalGroups);
}

export default async function ProfileCard({ user }: { user: UserProfileData }) {
  const title = user.name ?? user.username ?? 'Профиль';
  const subtitle = [roleLabel(user.role), user.classroom ? `класс ${user.classroom}` : null]
    .filter(Boolean)
    .join(', ');

  return (
    <section className={s.wrap}>
      <header className={s.header}>
        <div className={s.avatar} aria-label="Аватар" title={title}>
          {user.avatarUrl ? (
            <Image
              src={user.avatarUrl}
              alt={user.name ?? 'Пользователь'}
              width={64}
              height={64}
              className={s.avatarImg}
            />
          ) : (
            <span className={s.avatarInit}>{initialsFromName(user.name ?? '')}</span>
          )}
        </div>

        <div className={s.headText}>
          <div className={s.title}>{user.name}</div>
          <div className={s.subtitle}>{subtitle || 'роль не указана'}</div>
          {user.lastSeen ? <div className={s.lastSeen}>Был(а) в системе: {fmtDate(user.lastSeen)}</div> : null}
        </div>
      </header>

      <dl className={s.table}>
        <dt>ФИО</dt>
        <dd>{user.name || '—'}</dd>

        <dt>Логин</dt>
        <dd>{user.username || '—'}</dd>

        <dt>Роль</dt>
        <dd>{roleLabel(user.role)}</dd>

        <dt>Класс</dt>
        <dd>{user.classroom || '—'}</dd>

        <dt>Предметы</dt>
        <dd>{subjectsDisplay(user)}</dd>

        <dt>Методические группы</dt>
        <dd>{groupsDisplay(user)}</dd>

        <dt>Телефон</dt>
        <dd>
          {user.phone ? (
            <a href={`tel:${user.phone}`} className={s.link}>
              {user.phone}
            </a>
          ) : (
            '—'
          )}
        </dd>

        <dt>E-mail</dt>
        <dd>
          {user.email ? (
            <a href={`mailto:${user.email}`} className={s.link}>
              {user.email}
            </a>
          ) : (
            '—'
          )}
        </dd>

        <dt>Telegram</dt>
        <dd>
          {user.telegram ? (
            <a
              href={user.telegram.startsWith('@') ? `https://t.me/${user.telegram.slice(1)}` : `https://t.me/${user.telegram}`}
              className={s.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              {user.telegram}
            </a>
          ) : (
            '—'
          )}
        </dd>

        <dt>О себе</dt>
        <dd>{user.about || '—'}</dd>

        <dt>ID</dt>
        <dd className={s.mono}>{user.id}</dd>
      </dl>
    </section>
  );
}
