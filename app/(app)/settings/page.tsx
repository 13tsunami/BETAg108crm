import { auth } from '@/auth.config';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import UserForm from '@/components/UserForm';
import { updateSelfAction } from './actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SettingsPage() {
  const session = await auth();
  const meId = (session?.user as any)?.id as string | undefined;
  if (!meId) redirect('/sign-in');

  const me = await prisma.user.findUnique({
    where: { id: meId },
    select: {
      id: true, name: true, username: true, email: true, phone: true, classroom: true,
      role: true, birthday: true, telegram: true, about: true, notifyEmail: true, notifyTelegram: true,
    },
  });
  if (!me) redirect('/sign-in');

  const role = me.role || 'teacher';
  const isRestricted = role === 'teacher' || role === 'teacher_plus' || role === 'deputy';

  return (
    <main style={{ padding: 16 }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <h1 style={{ margin: '0 0 12px', fontWeight: 900, fontSize: 20 }}>Настройки профиля</h1>
        <div style={{
          border: '1px solid rgba(229,231,235,.9)', borderRadius: 14,
          background: '#fff', padding: 16
        }}>
          <UserForm
            action={updateSelfAction}
            mode="edit"
            initialId={me.id}
            initialValues={{
              name: me.name ?? '',
              username: me.username ?? '',
              email: me.email ?? '',
              phone: me.phone ?? '',
              classroom: me.classroom ?? '',
              role: me.role ?? 'teacher',
              birthday: me.birthday ? new Date(me.birthday).toISOString().slice(0,10) : '',
              telegram: me.telegram ?? '',
              about: me.about ?? '',
              notifyEmail: !!me.notifyEmail,
              notifyTelegram: !!me.notifyTelegram,
            }}
            disabledFields={isRestricted ? {
              name: true,
              username: true,
              classroom: true,
              role: true,
              birthday: true,
            } : undefined}
          />
        </div>
      </div>
    </main>
  );
}
