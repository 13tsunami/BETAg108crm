import { redirect } from 'next/navigation';
import { auth } from '@/auth.config';
import SignInForm from './SignInForm';

export const dynamic = 'force-dynamic';

export default async function SignInPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (session) redirect('/');

  const sp = props.searchParams ? await props.searchParams : undefined;
  const errorParam = sp?.error;
  const callbackParam = sp?.callbackUrl;

  const error = Array.isArray(errorParam) ? errorParam[0] : errorParam;
  const callbackUrl = Array.isArray(callbackParam)
    ? callbackParam[0]
    : callbackParam ?? '/';

  return (
    <main className="p-6 max-w-sm mx-auto space-y-4">
      <h1 className="text-xl font-semibold">Вход</h1>
      {error && (
        <div className="rounded-md border p-3 text-sm">
          Ошибка: {error === 'CredentialsSignin' ? 'Неверные логин или пароль' : error}
        </div>
      )}
      <SignInForm callbackUrl={callbackUrl} />
    </main>
  );
}
