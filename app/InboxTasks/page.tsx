// app/inboxTasks/page.tsx
'use client';

import { useEffect, useState } from 'react';

type Task = {
  id: string; title: string; description: string; dueDate: string;
  hidden: boolean; priority: string;
  assignees: { id: string; name: string }[];
  tags: { id: string; name: string }[];
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState('Проверка API задач');
  const [due, setDue] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 16)); // yyyy-MM-ddTHH:mm
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    const r = await fetch('/api/tasks?onlyVisible=1&limit=100', { cache: 'no-store' });
    const j = await r.json();
    setTasks(j.tasks ?? []);
  }

  useEffect(() => { load(); }, []);

  async function create() {
    setBusy(true); setErr(null);
    try {
      const iso = new Date(due).toISOString();
      const r = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, dueDate: iso, hidden: false, priority: 'normal', tags: ['тест'] }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await load();
      setTitle('Проверка API задач');
    } catch (e: any) {
      setErr(e?.message ?? 'ошибка');
    } finally {
      setBusy(false);
    }
  }

  const wrap: React.CSSProperties = { maxWidth: 980, margin: '32px auto', padding: '0 16px' };
  return (
    <main style={wrap}>
      <h1 style={{ margin: 0, fontSize: 24 }}>Задачи</h1>

      <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Название задачи" style={{ flex: 1 }} />
        <input type="datetime-local" value={due} onChange={e => setDue(e.target.value)} />
        <button onClick={create} disabled={busy || !title.trim()}>Создать</button>
        <button onClick={load} disabled={busy}>Обновить</button>
      </div>
      {err && <p style={{ color: 'crimson' }}>{err}</p>}

      <div style={{ marginTop: 16, borderTop: '1px solid #eee' }}>
        {tasks.length === 0 && <p style={{ color: '#666' }}>Пока задач нет.</p>}
        {tasks.map(t => (
          <div key={t.id} style={{ padding: '12px 0', borderBottom: '1px solid #eee' }}>
            <div style={{ fontWeight: 600 }}>{t.title}</div>
            <div style={{ color: '#666', fontSize: 12 }}>
              дедлайн: {new Date(t.dueDate).toLocaleString()} · приоритет: {t.priority}
            </div>
            {t.tags?.length > 0 && (
              <div style={{ marginTop: 4, color: '#444', fontSize: 12 }}>
                теги: {t.tags.map(x => x.name).join(', ')}
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
