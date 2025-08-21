import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import UserForm from '@/components/UserForm';
import { updateSelfAction } from './actions';
import SettingsToast from './SettingsToast';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SettingsPage() {
  const session = await auth();
  const meId = (session?.user as any)?.id as string | undefined;
  if (!meId) redirect('/sign-in');

  const me = await prisma.user.findUnique({
    where: { id: meId },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      phone: true,
      classroom: true,
      role: true,
      birthday: true,
      telegram: true,
      about: true,
      notifyEmail: true,
      notifyTelegram: true,
    },
  });
  if (!me) redirect('/sign-in');

  const meSafe = me as NonNullable<typeof me>;
  const role = meSafe.role || 'teacher';
  const isRestricted = role === 'teacher' || role === 'teacher_plus' || role === 'deputy';

  return (
    <main style={{ padding: 16 }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <h1 style={{ margin: '0 0 12px', fontWeight: 900, fontSize: 20 }}>Настройки профиля</h1>
        <div
          style={{
            border: '1px solid rgba(229,231,235,.9)',
            borderRadius: 14,
            background: '#fff',
            padding: 16,
          }}
        >
          <UserForm
            action={updateSelfAction}
            mode="edit"
            initialId={meSafe.id}
            initialValues={{
              name: meSafe.name ?? '',
              username: meSafe.username ?? '',
              email: meSafe.email ?? '',
              phone: meSafe.phone ?? '',
              classroom: meSafe.classroom ?? '',
              role: meSafe.role ?? 'teacher',
              birthday: meSafe.birthday ? new Date(meSafe.birthday).toISOString().slice(0, 10) : '',
              telegram: meSafe.telegram ?? '',
              about: meSafe.about ?? '',
              notifyEmail: !!meSafe.notifyEmail,
              notifyTelegram: !!meSafe.notifyTelegram,
            }}
            disabledFields={
              isRestricted
                ? { name: true, username: true, classroom: true, role: true }
                : undefined
            }
          />
        </div>
      </div>
      <Suspense>
        <SettingsToast />
      </Suspense>
    </main>
  );
}
