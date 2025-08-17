'use client';

import { useEffect, useRef, useState } from 'react';
import s from './chat.module.css';

type Msg = {
  id: string;
  threadId: string;
  authorId: string;
  text: string;
  createdAt: string; // ISO
};

export default function ChatBoxClient({
  meId,
  meName,        // оставляю пропсы для совместимости
  peerName,      // заголовок уже есть в page.tsx — здесь не дублируем
  threadId,
  peerReadAtIso, // не используется в этой версии — можно подключить для «прочитано»
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

  // SSE-подписка (оставляю ваш эндпоинт /chat/live как есть)
  useEffect(() => {
    if (!threadId) return;

    const url = `/chat/live?threadId=${encodeURIComponent(threadId)}`;
    const es = new EventSource(url);

    const onMsg = (ev: MessageEvent) => {
      try {
        const payload: Msg = JSON.parse(ev.data);
        if (payload?.threadId === threadId) {
          setMessages(prev => [...prev, payload]);
        }
      } catch {
        // игнорируем не-JSON
      }
    };

    es.addEventListener('message', onMsg);
    es.addEventListener('error', () => { /* авто-переподключение — забота браузера */ });

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
    if (!txt || !threadId) return;

    const res = await fetch(`/chat/live?threadId=${encodeURIComponent(threadId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: txt }),
    });

    if (res.ok) setText('');
  }

  // Внутренняя раскладка: растягиваемся на всю высоту правой колонки
  // grid: лента (1fr) + форма (auto)
  return (
    <div style={{ height: '100%', display: 'grid', gridTemplateRows: '1fr auto', gap: 12 }}>
      {/* Лента сообщений */}
      <div style={{ overflowY: 'auto', padding: '8px 0' }}>
        {messages.map((m) => {
          const mine = m.authorId === meId;
          const rowCls = `${s.msgRow} ${mine ? s.mine : s.other}`;
          const bubbleCls = `${s.msgCard} ${mine ? s.msgMineBg : s.msgOtherBg}`;
          return (
            <div key={m.id} className={rowCls}>
              <div className={bubbleCls} title={new Date(m.createdAt).toLocaleString('ru-RU')}>
                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>
                <div className={s.msgMeta}>
                  {new Date(m.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Поле ввода */}
      <div style={{ display: 'flex', gap: 8, borderTop: '1px solid rgba(229,231,235,.85)', paddingTop: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Напишите сообщение…"
          className={s.inlineSearchInput}
        />
        <button onClick={send} className={s.modalBtn} style={{ height: 38 }}>
          Отправить
        </button>
      </div>
    </div>
  );
}
