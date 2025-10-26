import { auth } from '@/auth.config';
import { normalizeRole } from '@/lib/roles';
import TeacherOverview from '../_overview/TeacherOverview';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type PageProps = {
  params: Promise<{ userId: string }>;
  searchParams: SearchParams;
};

export default async function Page(props: PageProps) {
  const { userId } = await props.params;            // <-- await по контракту Next 15
  const session = await auth();
  const viewerId = session?.user?.id ?? '';
  const viewerRole = normalizeRole(session?.user?.role);

  return (
    <TeacherOverview
      userId={userId}
      viewerId={viewerId}
      viewerRole={viewerRole}
      searchParams={props.searchParams}             // это тоже Promise — передаём как есть
    />
  );
}
