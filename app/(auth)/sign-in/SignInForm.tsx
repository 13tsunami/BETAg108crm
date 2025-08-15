'use client';

import * as React from 'react';
import { signIn } from 'next-auth/react';

export default function SignInForm({ callbackUrl }: { callbackUrl: string }) {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
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
      // signIn с redirect: true сам уйдёт на callbackUrl или на /sign-in?error=...
      // Ничего не делаем дальше.
    } catch (err: any) {
      setLocalError('Не удалось выполнить вход');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1">
        <label className="block text-sm">Логин или Email</label>
        <input
          className="border rounded px-3 py-2 w-full"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1">
        <label className="block text-sm">Пароль</label>
        <input
          className="border rounded px-3 py-2 w-full"
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      {localError && (
        <div className="rounded-md border p-3 text-sm">{localError}</div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="underline disabled:opacity-60"
      >
        {pending ? 'Входим…' : 'Войти'}
      </button>
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
    </form>
  );
}
