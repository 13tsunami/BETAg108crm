// app/(auth)/sign-in/SignInForm.tsx
'use client';
import { useState, FormEvent } from 'react';
import { signIn } from 'next-auth/react';

export default function SignInForm({ callbackUrl }: { callbackUrl: string }) {
  const [username, setUsername] = useState(''); 
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLocalError(null);
    setPending(true);
    try {
      await signIn('credentials', { username, password, callbackUrl, redirect: true });
    } catch {
      setLocalError('Не удалось выполнить вход');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="auth-form">
      <label className="lbl">Логин или Email</label>
      <input className="inp" type="text" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required />

      <label className="lbl">Пароль</label>
      <input className="inp" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required />

      {localError && <div className="err">{localError}</div>}

      <button type="submit" disabled={pending} className="btn">
        {pending ? 'Входим…' : 'Войти'}
      </button>

      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      <style jsx>{`
        .auth-form {
          width: 100%;
          max-width: 360px;
          display: grid;
          gap: 10px;
        }
        .lbl { font-size: 13px; color: #374151; }
        .inp {
          width: 100%;
          height: 38px;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 0 12px;
          background: #fff;
        }
        .err { color: #ef4444; font-size: 13px; }
        .btn {
          display: inline-flex;           /* ключ: НЕ растягиваемся на всю ширину */
          align-items: center;
          justify-content: center;
          height: 38px;
          padding: 0 14px;
          border-radius: 10px;
          border: 1px solid #e5e7eb;
          background: #8d2828;            /* фирменный цвет */
          color: #fff;
          font-weight: 600;
          cursor: pointer;
        }
        .btn:disabled { opacity: 0.6; cursor: default; }
      `}</style>
    </form>
  );
}
