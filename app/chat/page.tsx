// app/chat/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';

type User = { id: string; name: string; username?: string | null };
type Thread = {
  id: string; title: string; aId: string | null; bId: string | null;
  lastMessageAt?: string | null; lastMessageText?: string | null;
  peer?: { id: string; name: string } | null;
  messages?: Message[];
};
type Message = { id: string; text: string; createdAt: string; authorId: string };

export default function ChatDev() {
  const [users, setUsers] = useState<User[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');

  async function loadUsers() {
    const r = await fetch('/api/users', { cache: 'no-store' });
    const j = await r.json();
    setUsers(Array.isArray(j.users) ? j.users : (Array.isArray(j) ? j : []));
  }

  useEffect(() => { loadUsers(); }, []);

  async function loadThreads() {
    if (!meId) return;
    const r = await fetch('/api/chat/threads/list', { headers: { 'x-user-id': meId } });
    const j = await r.json();
    setThreads(Array.isArray(j.threads) ? j.threads : []);
  }

  useEffect(() => {
    setThreads([]); setThreadId(null); setMessages([]);
    if (meId) loadThreads();
  }, [meId]);

  async function openThread(id: string) {
    setThreadId(id);
    const r = await fetch(`/api/chat/threads/${id}`);
    const j = await r.json();
    const msgs: Message[] = Array.isArray(j.thread?.messages) ? j.thread.messages : [];
    setMessages(msgs);
  }

  async function ensureThread() {
    if (!meId || !peerId || meId === peerId) return;
    const r = await fetch('/api/chat/threads/ensure', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ aId: meId, bId: peerId, title: '' }),
    });
    if (!r.ok) return;
    const j = await r.json();
    if (j.thread?.id) {
      await loadThreads();
      await openThread(j.thread.id);
    }
  }

  async function send() {
    if (!threadId || !meId || !text.trim()) return;
    const r = await fetch(`/api/chat/threads/${threadId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, authorId: meId }),
    });
    if (r.ok) {
      setText('');
      await openThread(threadId);
    }
  }

  const wrap: React.CSSProperties = { maxWidth: 1100, margin: '32px auto', padding: '0 16px' };
  const col: React.CSSProperties = { border: '1px solid #eee', borderRadius: 8, padding: 12, background: '#fff' };
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 };

  const me = useMemo(() => users.find(u => u.id === meId) ?? null, [users, meId]);

  return (
    <main style={wrap}>
      <h1 style={{ margin: 0, fontSize: 24 }}>Чат — техническая страница</h1>

      <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span>Я:</span>
        <select value={meId ?? ''} onChange={e => setMeId(e.target.value || null)}>
          <option value="">— выбрать —</option>
          {users.map(u => (<option key={u.id} value={u.id}>{u.name}</option>))}
        </select>

        <span>Собеседник:</span>
        <select value={peerId ?? ''} onChange={e => setPeerId(e.target.value || null)}>
          <option value="">— выбрать —</option>
          {users.filter(u => u.id !== meId).map(u => (<option key={u.id} value={u.id}>{u.name}</option>))}
        </select>
        <button onClick={ensureThread} disabled={!meId || !peerId}>Создать диалог</button>
        <button onClick={loadUsers}>Обновить пользователей</button>
        {me && <span style={{ color: '#666' }}>meId: {me.id}</span>}
      </div>

      <div style={{ marginTop: 16, ...grid }}>
        <div style={col}>
          <b>Диалоги</b>
          <div style={{ marginTop: 8 }}>
            {threads.length === 0 && <div style={{ color: '#666' }}>Диалогов нет.</div>}
            {threads.map(t => (
              <div key={t.id}
                   onClick={() => openThread(t.id)}
                   style={{ padding: 8, borderRadius: 6, cursor: 'pointer', background: t.id === threadId ? '#eef5ff' : undefined }}>
                <div style={{ fontWeight: 600 }}>
                  {t.peer?.name ?? t.title ?? 'Без названия'}
                </div>
                <div style={{ color: '#666', fontSize: 12 }}>{t.lastMessageText ?? ''}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={col}>
          <b>Сообщения</b>
          {!threadId && <div style={{ marginTop: 8, color: '#666' }}>Выбери диалог слева.</div>}
          {threadId && (
            <>
              <div style={{ marginTop: 8, maxHeight: 360, overflow: 'auto', border: '1px solid #eee', borderRadius: 6, padding: 8 }}>
                {messages.length === 0 && <div style={{ color: '#666' }}>Пока пусто.</div>}
                {messages.map(m => (
                  <div key={m.id} style={{ padding: '6px 8px', background: m.authorId === meId ? '#f6fff2' : '#f7f7f7', borderRadius: 6, marginBottom: 6 }}>
                    <div style={{ fontSize: 12, color: '#777' }}>{new Date(m.createdAt).toLocaleString()}</div>
                    <div>{m.text}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input value={text} onChange={e => setText(e.target.value)} placeholder="Сообщение" style={{ flex: 1 }} />
                <button onClick={send} disabled={!text.trim() || !meId}>Отправить</button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
