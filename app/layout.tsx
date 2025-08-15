// app/layout.tsx
import '@/styles/globals.css';
import Providers from '@/components/Providers';
import { ReactNode } from 'react';

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

export const metadata = {
  metadataBase: safeMetadataBase(),
  title: 'G108 CRM',
  description: 'Внутренняя CRM',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
