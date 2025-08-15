'use client';

import { useState, FormEvent } from 'react';
import { signIn } from 'next-auth/react';

interface SignInFormProps {
  callbackUrl: string;
}

export default function SignInForm({ callbackUrl }: SignInFormProps) {
  // Локальное состояние для полей формы и статуса отправки
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);        // true, когда запрос на вход выполняется
  const [localError, setLocalError] = useState<string | null>(null);  // локальная ошибка, если запрос не прошёл

  // Обработчик отправки формы входа
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLocalError(null);
    setPending(true);
    try {
      // Вызываем вход через next-auth с провайдером "credentials".
      // next-auth сам выполнит редирект: на callbackUrl при успехе или вернёт на /sign-in?error=... при ошибке.
      await signIn('credentials', { 
        username, 
        password, 
        callbackUrl, 
        redirect: true 
      });
    } catch (err) {
      // В случае непредвиденной ошибки (например, сеть недоступна)
      setLocalError('Не удалось выполнить вход');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 max-w-md auth-form">
      <div>
        <label className="block text-sm mb-1">Логин или Email</label>
        <input 
          className="w-full border rounded px-3 py-2" 
          type="text"
          name="username" 
          autoComplete="username" 
          value={username} 
          onChange={(e) => setUsername(e.target.value)} 
          required 
        />
      </div>
      <div>
        <label className="block text-sm mb-1">Пароль</label>
        <input 
          className="w-full border rounded px-3 py-2" 
          type="password" 
          name="password" 
          autoComplete="current-password" 
          value={password} 
          onChange={(e) => setPassword(e.target.value)} 
          required 
        />
      </div>

      {/* Локальная ошибка входа (если произошла) */}
      {localError && (
        <div className="text-red-600">
          {localError}
        </div>
      )}

      <button 
        type="submit" 
        disabled={pending} 
        className="rounded px-4 py-2 border hover:bg-black/5 disabled:opacity-60"
      >
        {pending ? 'Входим…' : 'Войти'}
      </button>

      {/* Скрытое поле с URL перенаправления (передаётся в колбэк next-auth) */}
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
    </form>
  );
}
