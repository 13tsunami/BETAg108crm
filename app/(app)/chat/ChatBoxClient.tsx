'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import s from './chat.module.css';
import { editMessageAction, deleteMessageAction } from './actions';

type Msg = {
  id: string;
  threadId: string;
  authorId: string;
  authorName?: string | null;
  text: string;
  createdAt: string; // ISO
  editedAt?: string | null;
  deletedAt?: string | null;
};

export default function ChatBoxClient({
  meId,
  meName,
  peerName,
  threadId,
  meReadAtIso,
  peerReadAtIso,
  initial,
}: {
  meId: string;
  meName: string;
  peerName: string;
  threadId: string;
  meReadAtIso?: string | null;
  peerReadAtIso: string | null;
  initial: Msg[];
}) {
  const [messages, setMessages] = useState<Msg[]>(initial || []);
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);
  const firstUnreadRef = useRef<HTMLDivElement | null>(null);
  const didInitScrollRef = useRef(false);
  const router = useRouter();

  // SSE подписка
  useEffect(() => {
    const url = `/chat/live?threadId=${encodeURIComponent(threadId)}`;
    const es = new EventSource(url);

    const onMsg = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data);
        if (data?.threadId !== threadId) return;

        switch (data?.type) {
          case 'message': {
            const m: Msg = {
              id: data.messageId,
              threadId,
              authorId: data.authorId,
              text: data.text,
              createdAt: data.ts,
            };
            setMessages((prev) => [...prev, m]);
            break;
          }
          case 'messageEdited': {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === data.messageId
                  ? { ...m, text: data.text, editedAt: new Date().toISOString() }
                  : m
              )
            );
            break;
          }
          case 'messageDeleted': {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === data.messageId
                  ? { ...m, text: '', deletedAt: new Date().toISOString() }
                  : m
              )
            );
            break;
          }
          case 'read': {
            // галочки обновятся при следующем заходе; можно игнорировать
            break;
          }
          case 'threadDeleted': {
            if (data.threadId === threadId) router.push('/chat');
            break;
          }
          default: {
            if (data?.id && data?.text) {
              setMessages((prev) => [...prev, data]);
            }
          }
        }
      } catch {}
    };

    es.addEventListener('message', onMsg);
    return () => {
      es.removeEventListener('message', onMsg as any);
      es.close();
    };
  }, [threadId, router]);

  // автопрокрутка: первичный скролл к первому непрочитанному
  useEffect(() => {
    if (!didInitScrollRef.current) {
      const anchor = firstUnreadRef.current || endRef.current;
      anchor?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
      didInitScrollRef.current = true;
      return;
    }
    const scroller = endRef.current?.parentElement;
    if (scroller) {
      const nearBottom =
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 64;
      if (nearBottom) endRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  async function send() {
    const txt = text.trim();
    if (!txt) return;
    const res = await fetch(`/chat/live?threadId=${encodeURIComponent(threadId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: txt }),
    });
    if (res.ok) setText('');
  }

  async function saveEdit(id: string) {
    const fd = new FormData();
    fd.set('messageId', id);
    fd.set('text', editText.trim());
    await editMessageAction(fd);
    setEditingId(null);
    setEditText('');
  }

  async function deleteMsg(id: string, scope: 'self' | 'both') {
    if (!confirm('Удалить сообщение?')) return;
    const fd = new FormData();
    fd.set('messageId', id);
    fd.set('scope', scope);
    await deleteMessageAction(fd);
  }

  function sameDay(d1: Date, d2: Date) {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  }
  function labelForDate(d: Date) {
    const now = new Date();
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    if (sameDay(d, now)) return 'Сегодня';
    if (sameDay(d, yesterday)) return 'Вчера';
    return d.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  let lastDateLabel: string | null = null;

  return (
    <div className={s.pane}>
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid #e5e7eb',
          fontWeight: 600,
        }}
      >
        {peerName}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {messages.map((m) => {
          const created = new Date(m.createdAt);
          const label = labelForDate(created);
          const showDivider = label !== lastDateLabel;
          lastDateLabel = label;

          const mine = m.authorId === meId;
          const isRead =
            peerReadAtIso && new Date(m.createdAt) <= new Date(peerReadAtIso);
          const isAfterMyRead = meReadAtIso
            ? created > new Date(meReadAtIso)
            : false;
          const isFirstUnreadAnchor =
            !firstUnreadRef.current && isAfterMyRead && !mine;

          return (
            <div
              key={m.id}
              ref={isFirstUnreadAnchor ? firstUnreadRef : undefined}
            >
              {showDivider && (
                <div className={s.dayDivider}>
                  <span>{label}</span>
                </div>
              )}
              <div className={`${s.msgRow} ${mine ? s.mine : s.other}`}>
                <div
                  className={`${s.msgCard} ${
                    mine ? s.msgMineBg : s.msgOtherBg
                  }`}
                >
                  {editingId === m.id ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <button onClick={() => saveEdit(m.id)}>OK</button>
                      <button onClick={() => setEditingId(null)}>Отмена</button>
                    </div>
                  ) : (
                    <div>
                      {m.deletedAt ? (
                        <i style={{ color: '#6b7280' }}>Сообщение удалено</i>
                      ) : (
                        m.text
                      )}
                    </div>
                  )}
                  <div className={s.msgMeta}>
                    <span>{m.authorName || (mine ? meName : peerName)}</span>
                    <span>
                      {created.toLocaleTimeString('ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {mine && !m.deletedAt && (
                      <span>{isRead ? '✔✔' : '✔'}</span>
                    )}
                    {m.editedAt && !m.deletedAt && <span>(изм.)</span>}
                  </div>
                  {mine && !m.deletedAt && editingId !== m.id && (
                    <div style={{ marginTop: 4, display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => {
                          setEditingId(m.id);
                          setEditText(m.text);
                        }}
                      >
                        ✏️
                      </button>
                      <button onClick={() => deleteMsg(m.id, 'both')}>🗑</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div
        style={{
          padding: 8,
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          gap: 8,
        }}
      >
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
