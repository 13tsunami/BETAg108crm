// app/layout.tsx
import '@/styles/globals.css';
import type { Metadata } from 'next';
import { ReactNode } from 'react';
import Providers from '@/components/Providers';
import Sidebar from '@/components/Sidebar';
import { auth } from '@/auth.config';

function safeMetadataBase(): URL | undefined {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    '';
  if (!raw) return undefined;
  try {
    return new URL(raw);
  } catch {
    return undefined;
  }
}

export const metadata: Metadata = {
  metadataBase: safeMetadataBase(),
  title: 'G108 CRM',
  description: 'Внутренняя CRM',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const isAuthed = Boolean(session);

  return (
    <html lang="ru">
      <body>
        <Providers>
          {isAuthed ? (
            <div className="min-h-dvh flex">
              <Sidebar />
              <main className="flex-1 p-6">{children}</main>
            </div>
          ) : (
            children
          )}
        </Providers>
      </body>
    </html>
  );
}
