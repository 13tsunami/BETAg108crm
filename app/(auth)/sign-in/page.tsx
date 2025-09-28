// app/(auth)/sign-in/page.tsx
import { redirect } from 'next/navigation';
import { auth } from '@/auth.config';
import SignInForm from './SignInForm';
import Logo108 from '@/public/logo-108.png'; // статический импорт из public
import './sign-in.css';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function sanitizeCallbackUrl(raw: string | string[] | undefined): string {
  const fallback = '/dashboard';
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (!s) return fallback;
  if (s.startsWith('/')) return s;
  try {
    const base = process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL) : null;
    const u = new URL(s);
    if (base && u.origin === base.origin) return u.pathname + u.search + u.hash;
  } catch {}
  return fallback;
}

function humanizeError(code: string | string[] | undefined): string | null {
  const c = Array.isArray(code) ? code[0] : code;
  if (!c) return null;
  switch (c) {
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
  const callbackUrl = sanitizeCallbackUrl(qp.callbackUrl);

  return (
    <main className="signin-wrap">
      <section className="signin-card" role="region" aria-label="Форма входа">
        <div className="signin-logo">
          <img
            src={Logo108.src}          // гарантированно правильный URL
            alt="Гимназия №108 имени В. Н. Татищева"
            width={96}
            height={96}
            loading="eager"
            decoding="async"
          />
        </div>

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
