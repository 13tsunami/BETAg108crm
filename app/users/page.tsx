// app/users/page.tsx
'use client';

import { useEffect, useState } from 'react';

type User = { id: string; name: string; username?: string | null; role?: string | null };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState('Демо А');
  const [username, setUsername] = useState('demo_a');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    const res = await fetch('/api/users', { cache: 'no-store' });
    const j = await res.json();
    setUsers(Array.isArray(j.users) ? j.users : j);
  }

  useEffect(() => { load(); }, []);

  async function create() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-role': 'директор',
        },
        body: JSON.stringify({ name, username }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e: any) {
      setErr(e?.message ?? 'ошибка');
    } finally {
      setBusy(false);
    }
  }

  const wrap: React.CSSProperties = { maxWidth: 980, margin: '32px auto', padding: '0 16px' };
  const row: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center' };
  const list: React.CSSProperties = { marginTop: 16, borderTop: '1px solid #eee' };

  return (
    <main style={wrap}>
      <h1 style={{ margin: 0, fontSize: 24 }}>Пользователи</h1>
      <div style={{ marginTop: 16 }}>
        <div style={row}>
          <input placeholder="Имя" value={name} onChange={e => setName(e.target.value)} />
          <input placeholder="username" value={username} onChange={e => setUsername(e.target.value)} />
          <button onClick={create} disabled={busy}>Создать</button>
          <button onClick={load} disabled={busy}>Обновить</button>
        </div>
        {err && <p style={{ color: 'crimson', marginTop: 8 }}>{err}</p>}
      </div>

      <div style={list}>
        {users.length === 0 && <p style={{ color: '#666' }}>Нет пользователей.</p>}
        {users.map(u => (
          <div key={u.id} style={{ padding: '12px 0', borderBottom: '1px solid #eee' }}>
            <div><b>{u.name}</b> <span style={{ color: '#888' }}>({u.username ?? '—'})</span></div>
            <div style={{ fontSize: 12, color: '#666' }}>id: {u.id}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
