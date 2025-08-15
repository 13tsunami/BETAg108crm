import { redirect } from 'next/navigation';
import { auth } from '@/auth.config';

export default async function Dashboard() {
  const session = await auth();
  if (!session) redirect('/sign-in');

  return (
    <section>
      <h1 className="text-2xl font-semibold">Дашборд</h1>
      <p className="text-gray-600 mt-2">Стартовая страница после входа.</p>
    </section>
  );
}
