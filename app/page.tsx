// app/page.tsx
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function Home() {
  const [ok, setOk] = useState<string>('проверка...');
  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(j => setOk(`ok: ${!!j.ok}`))
      .catch(() => setOk('ошибка'));
  }, []);

  const card: React.CSSProperties = {
    border: '1px solid #ddd',
    borderRadius: 12,
    padding: 16,
    textDecoration: 'none',
    color: 'inherit',
    display: 'block',
    background: '#fff',
  };
  const grid: React.CSSProperties = {
    display: 'grid',
    gap: 16,
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    marginTop: 24,
  };

  return (
    <main style={{ maxWidth: 980, margin: '32px auto', padding: '0 16px' }}>
      <h1 style={{ margin: 0, fontSize: 28 }}>G108 CRM — техническая проверка</h1>
      <p style={{ marginTop: 8, color: '#666' }}>Сервер здоровья: {ok}</p>

      <div style={grid}>
        <Link href="/users" style={card}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Пользователи</h2>
          <p style={{ marginTop: 8 }}>Список и быстрое создание пользователей.</p>
        </Link>
        <Link href="/chat" style={card}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Чат</h2>
          <p style={{ marginTop: 8 }}>Проверка тредов и сообщений.</p>
        </Link>
        <Link href="/inboxTasks" style={card}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Задачи</h2>
          <p style={{ marginTop: 8 }}>Список задач и быстрое добавление.</p>
        </Link>
      </div>
    </main>
  );
}
