import { notFound, redirect } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth.config';
import ProfileCard, { type UserProfileData, userProfileSelect } from './profile-card';
import { normalizeRole, type Role } from '@/lib/roles';
import TeacherOverview from '@/app/(app)/teacher/_overview/TeacherOverview';
// ❌ было: import actionS from './profile-card.module.css';
import actions from './profile-actions.module.css';

export const dynamic = 'force-dynamic';

export type PageProps = {
  params: Promise<{ username: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const ALLOWED_ROLES = new Set<Role>([
  'director',
  'deputy_plus',
  'deputy',
  'deputy_axh',
  'sysadmin',
]);

function canViewProfiles(roleRaw: string | null | undefined): boolean {
  const r = normalizeRole(roleRaw);
  return !!(r && ALLOWED_ROLES.has(r));
}

export async function generateMetadata(props: PageProps) {
  const session = await auth();
  const viewer = session?.user?.id
    ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } })
    : null;

  const { username } = await props.params;
  const uname = (username ?? '').trim();

  if (!canViewProfiles(viewer?.role) || !uname) {
    return { title: 'Профиль', robots: { index: false, follow: false } };
  }

  const user = await prisma.user.findFirst({
    where: { username: { equals: uname, mode: 'insensitive' } },
    select: { name: true },
  });

  const title = user?.name ? `${user.name} — профиль` : 'Профиль';
  return { title, robots: { index: false, follow: false } };
}

export default async function Page(props: PageProps) {
  noStore();

  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, id: true },
  });
  if (!canViewProfiles(viewer?.role)) redirect('/dashboard');

  const { username } = await props.params;
  const sp = await props.searchParams;
  const uname = (username ?? '').trim();
  if (!uname) notFound();

  const user: UserProfileData | null = await prisma.user.findFirst({
    where: { username: { equals: uname, mode: 'insensitive' } },
    select: userProfileSelect,
  });

  if (!user) notFound();

  const isFull = String(sp.full ?? '').trim() === '1';

  return (
    <>
      <ProfileCard user={user} />

      {/* Кнопки действий под визиткой */}
      <div className={actions.actions}>
        {!isFull ? (
          <Link href="?full=1" className={`${actions.button} ${actions.primary}`} prefetch={false}>
            раскрыть полный модуль педагога
          </Link>
        ) : (
          <Link href="?" className={`${actions.button} ${actions.ghost}`} prefetch={false}>
            свернуть
          </Link>
        )}

        <Link
          href={`/teacher/${user.id}`}
          className={`${actions.button} ${actions.linkish}`}
          prefetch={false}
          title="Открыть модуль педагога на отдельной странице"
        >
          открыть на отдельной странице
        </Link>
      </div>

      {/* Полный модуль педагога — только при ?full=1 */}
      {isFull ? (
        <TeacherOverview
          userId={user.id}
          viewerId={viewer?.id ?? ''}
          viewerRole={normalizeRole(viewer?.role)}
          searchParams={props.searchParams}
        />
      ) : null}
    </>
  );
}
