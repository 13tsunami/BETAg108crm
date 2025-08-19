// app/layout.tsx
import type { ReactNode } from 'react';
import Providers from './providers';
import '@/styles/globals.css';

export const metadata = { title: 'G108 CRM' };

// Р“Р»РѕР±Р°Р»СЊРЅС‹Р№ SSE-РєР»РёРµРЅС‚

import { auth } from '@/auth.config';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const uid = (session?.user as any)?.id as string | undefined;

  return (
    <html lang="ru">
      <body>
        <Providers>{children}</Providers>

      </body>
    </html>
  );
}
