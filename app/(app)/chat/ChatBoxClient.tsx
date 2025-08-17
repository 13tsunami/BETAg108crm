'use client';

import { useEffect, useMemo, useRef, useState, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendMessageAction /*, editMessageAction, deleteMessageAction */ } from './actions';
import s from './chat.module.css';

type Msg = {
  id: string;
  threadId: string;
  authorId: string;
  text: string;
  createdAt: string; // ISO
};

type PushEvt = {
  type: 'message';
  threadId: string;
  messageId: string;
  authorId: string;
  text: string;
  ts: string;
  clientId?: string;
};

type EditEvt = { type: 'messageEdited'; threadId: string; messageId: string; byId: string; text: string };
type DelEvt  = { type: 'messageDeleted'; threadId: string; messageId: string; byId: string; scope: 'self' | 'both' };
type ReadEvt = { type: 'read'; threadId: string };

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
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initial || []);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  // вспомогательная карта для оптимистических отправок
  const pendingByClient = useRef<Set<string>>(new Set());

  // регистрируем API, который дергает Live (/chat/sse)
  useEffect(() => {
    const api = {
      threadId,
      push: (e: PushEvt) => {
        if (e.threadId !== threadId) return;
        // если это эхо нашего оптимистичного клиента — можно пропустить дубль
        if (e.clientId && pendingByClient.current.has(e.clientId)) {
          pendingByClient.current.delete(e.clientId);
          return;
        }
        setMessages(prev => prev.concat({
          id: e.messageId,
          threadId: e.threadId,
          authorId: e.authorId,
          text: e.text,
          createdAt: e.ts,
        }));
      },
      edit: (e: EditEvt) => {
        if (e.threadId !== threadId) return;
        setMessages(prev => prev.map(m => m.id === e.messageId ? { ...m, text: e.text } : m));
      },
      del: (e: DelEvt) => {
        if (e.threadId !== threadId) return;
        setMessages(prev => prev.filter(m => m.id !== e.messageId));
      },
      read: (_e: ReadEvt) => {
        // при необходимости можно подсветить "прочитано"
      },
      onThreadDeleted: () => {
        startTransition(() => router.replace('/chat'));
      }
    };
    (window as any).__chatApi = api;
    return () => {
      const w = (window as any);
      if (w.__chatApi && w.__chatApi.threadId === threadId) {
        w.__chatApi = undefined;
      }
    };
  }, [router, threadId]);

  // автопрокрутка
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const txt = text.trim();
    if (!txt || !threadId) return;

    // оптимистичное добавление
    const clientId = crypto.randomUUID();
    pendingByClient.current.add(clientId);
    const optimistic: Msg = {
      id: `tmp-${clientId}`,
      threadId,
      authorId: meId,
      text: txt,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => prev.concat(optimistic));
    setText('');

    // реальный вызов server action (Promise<void> по вашему контракту)
    const fd = new FormData();
    fd.append('threadId', threadId);
    fd.append('text', txt);
    fd.append('clientId', clientId);
    try {
      await sendMessageAction(fd);
    } catch {
      // откат при ошибке
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      pendingByClient.current.delete(clientId);
    }
  }

  return (
    <div style={{ height: '100%', display: 'grid', gridTemplateRows: '1fr auto', gap: 12 }}>
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
