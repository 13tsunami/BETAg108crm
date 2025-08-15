import { redirect } from 'next/navigation';
import { auth } from '@/auth.config';
import SignInForm from './SignInForm';

export const dynamic = 'force-dynamic';  // Обязательно динамическая страница (не статическая), т.к. зависит от сессии и query-параметров

export default async function SignInPage(props: { 
  searchParams?: Promise<Record<string, string | string[] | undefined>> 
}) {
  // Проверяем наличие активной сессии через auth() (getServerSession). Если пользователь уже залогинен – перенаправляем на главную.
  const session = await auth();
  if (session) {
    redirect('/');  // Если есть сессия, сразу уходим с страницы входа (редирект на главную/дешборд)
  }

  // Извлекаем query-параметры (?error=… & callbackUrl=…) из URL, учитывая что searchParams передаются как Promise
  const sp = props.searchParams ? await props.searchParams : undefined;
  const errorParam = sp?.error;
  const callbackParam = sp?.callbackUrl;
  const error = Array.isArray(errorParam) ? errorParam[0] : errorParam;
  const callbackUrl = Array.isArray(callbackParam) ? callbackParam[0] : (callbackParam ?? '/dashboard');
  // ↑ Если callbackUrl не задан, по умолчанию отправим пользователя на "/dashboard" после входа (основная страница после логина)

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      {/* Верхний блок с приветствием (визуал как в разработочной версии) */}
      <div className="mb-8">
        <div className="text-lg text-neutral-600">Гимназия № 108 имени В. Н. Татищева</div>
        <h1 className="text-3xl font-semibold mt-1">Добро пожаловать в CRM-систему</h1>
        <div className="text-neutral-600 mt-2">Необходим вход в систему</div>
      </div>

      {/* Сообщение об ошибке, если передан параметр error */}
      {error && (
        <p className="text-red-600 mb-4">
          Ошибка авторизации. {error === 'CredentialsSignin' ? 'Проверьте логин и пароль.' : error}
        </p>
      )}

      {/* Форма входа (вынесена в отдельный компонент) */}
      <SignInForm callbackUrl={callbackUrl} />
    </main>
  );
}
