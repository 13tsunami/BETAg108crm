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
      const res = await signIn('credentials', {
        username,
        password,
        callbackUrl,
        redirect: true,
      });
      if (res?.error) {
        setLocalError('Неверные учетные данные.');
        setPending(false);
      }
    } catch {
      setLocalError('Ошибка сети. Повторите попытку.');
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="signin-form">
      <div className="signin-field">
        <label htmlFor="username" className="signin-label">Логин</label>
        <input
          id="username"
          type="text"
          inputMode="text"
          autoComplete="username"
          className="signin-input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          aria-required="true"
        />
      </div>

      <div className="signin-field">
        <label htmlFor="password" className="signin-label">Пароль</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className="signin-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          aria-required="true"
        />
      </div>

      {localError && <p className="signin-error" role="alert">{localError}</p>}

      <button type="submit" className="signin-btn" disabled={pending} aria-busy={pending}>
        {pending ? 'Входим' : 'Войти'}
      </button>
    </form>
  );
}
