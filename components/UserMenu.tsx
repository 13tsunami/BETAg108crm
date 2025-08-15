// components/UserMenu.tsx
'use client';

import { signOut } from 'next-auth/react';

export default function UserMenu() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/sign-in' })}
      className="underline text-sm"
    >
      Выход
    </button>
  );
}
