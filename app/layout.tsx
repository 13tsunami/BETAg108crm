// app/layout.tsx
import type { ReactNode } from 'react';
import Providers from './providers';
import '@/styles/globals.css';

export const metadata = { title: 'G108 CRM' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
