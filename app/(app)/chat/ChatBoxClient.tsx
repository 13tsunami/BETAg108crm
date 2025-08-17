'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Локальный тип сообщения, не тянем ничего из ./live
 * Должен совпадать с форматом, который шлёт твой SSE эндпоинт /chat/live (GET)
 */
type Msg = {
  id: string;
  threadId: string;
  authorId: string;
  text: string;
  createdAt: string; // ISO
};

export default function ChatBoxClient({
  meId,
  meName,
  peerName,
  threadId,
  peerReadAtIso,
  initial,
}: {
  meId: string;
  meName: string;
  peerName: string;
  threadId: string;
  peerReadAtIso: string | null;
  initial: Msg[];
}) {
  const [messages, setMessages] = useState<Msg[]>(initial || []);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  // Подписка на SSE напрямую (без ./broker)
  useEffect(() => {
    // Предполагается, что GET /chat/live?threadId=... открывает SSE-стрим
    const url = `/chat/live?threadId=${encodeURIComponent(threadId)}`;
    const es = new EventSource(url);
    const onMsg = (ev: MessageEvent) => {
      try {
        const payload: Msg = JSON.parse(ev.data);
        if (payload?.threadId === threadId) {
          setMessages((prev) => [...prev, payload]);
        }
      } catch {
        // игнорим не-JSON
      }
    };
    es.addEventListener('message', onMsg);
    es.addEventListener('error', () => {
      // браузер сам переподключится; можно логировать при желании
    });

    return () => {
      es.removeEventListener('message', onMsg as any);
      es.close();
    };
  }, [threadId]);

  // Автопрокрутка вниз
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const txt = text.trim();
    if (!txt) return;
    // POST в тот же эндпоинт, как у тебя и было
    const res = await fetch(`/chat/live?threadId=${encodeURIComponent(threadId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: txt }),
    });
    if (res.ok) setText('');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Хедер чата */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>
        {peerName}
      </div>

      {/* Лента сообщений */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              marginBottom: 6,
              display: 'flex',
              justifyContent: m.authorId === meId ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              title={new Date(m.createdAt).toLocaleString('ru-RU')}
              style={{
                padding: '6px 10px',
                borderRadius: 12,
                background: m.authorId === meId ? '#8d2828' : '#f3f4f6',
                color: m.authorId === meId ? '#fff' : '#111827',
                maxWidth: '75%',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {m.text}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Поле ввода */}
      <div style={{ padding: 8, borderTop: '1px solid #e5e7eb', display: 'flex', gap: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Напишите сообщение…"
          style={{
            flex: 1,
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: '6px 10px',
            outline: 'none',
          }}
        />
        <button
          onClick={send}
          style={{
            border: 'none',
            borderRadius: 12,
            background: '#8d2828',
            color: '#fff',
            padding: '0 16px',
            cursor: 'pointer',
            height: 36,
          }}
        >
          Отправить
        </button>
      </div>
    </div>
  );
}
