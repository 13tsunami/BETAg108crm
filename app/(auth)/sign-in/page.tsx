// app/(auth)/sign-in/page.tsx
import { redirect } from 'next/navigation';
import { auth } from '@/auth.config';
import SignInForm from './SignInForm';
import './sign-in.css';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function sanitizeCallbackUrl(raw: string | undefined): string {
  const fallback = '/dashboard';
  if (!raw) return fallback;
  if (raw.startsWith('/')) return raw;
  try {
    const base = process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL) : null;
    const u = new URL(raw);
    if (base && u.origin === base.origin) return u.pathname + u.search + u.hash;
  } catch {}
  return fallback;
}

function humanizeError(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case 'CredentialsSignin': return 'Проверьте логин и пароль.';
    case 'AccessDenied':      return 'Доступ запрещён.';
    case 'SessionRequired':   return 'Требуется авторизация.';
    default:                  return 'Не удалось выполнить вход.';
  }
}

export default async function SignInPage(props: { searchParams?: SearchParams }) {
  const session = await auth();
  if (session) redirect('/');

  const qp = (await props.searchParams) || {};
  const errorMsg = humanizeError(first(qp.error));
  const callbackUrl = sanitizeCallbackUrl(first(qp.callbackUrl));

  return (
    <main className="signin-wrap">
      <section className="signin-card" role="region" aria-label="Форма входа">
        <header className="signin-head">
          <div className="signin-brand">Гимназия 108 имени В. Н. Татищева</div>
          <h1 className="signin-title">Вход в G108CRM</h1>
          <p className="signin-subtitle">Укажите логин и пароль. Продуктивной работы!</p>
        </header>

        {errorMsg && <p className="signin-error" role="alert">{errorMsg}</p>}

        <SignInForm callbackUrl={callbackUrl} />
      </section>
    </main>
  );
}
