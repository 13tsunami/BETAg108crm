// app/layout.tsx
import type { ReactNode } from 'react';
import Providers from './providers';
import '@/styles/globals.css';

export const metadata = { title: 'G108 CRM' };

// клиент SSE
import Live from '@/app/(app)/chat/live';
import { auth } from '@/auth.config';

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const uid = (session?.user as any)?.id as string | undefined;

  return (
    <html lang="ru">
      <body>
        <Providers>{children}</Providers>
        {uid ? <Live uid={uid} /> : null}
      </body>
    </html>
  );
}
