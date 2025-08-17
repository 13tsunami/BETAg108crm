// app/(app)/chat/ChatBoxClient.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import s from './chat.module.css';
import { sendMessageAction, editMessageAction, deleteMessageAction } from './actions';

type Msg = {
  id: string;
  threadId: string;
  authorId: string;
  authorName?: string | null;
  text: string;
  createdAt: string;        // ISO
  editedAt?: string | null; // ISO | null
  deletedAt?: string | null;// ISO | null
};

type PushPayload = {
  type: 'message';
  threadId: string;
  at: number;
  messageId: string;
  authorId: string;
  text: string;
  ts: string;
  clientId?: string;
};
type EditPayload = {
  type: 'messageEdited';
  threadId: string;
  at: number;
  messageId: string;
  byId: string;
  text: string;
};
type DelPayload = {
  type: 'messageDeleted';
  threadId: string;
  at: number;
  messageId: string;
  byId: string;
  scope: 'self' | 'both';
};
type ReadPayload = { type: 'read'; threadId: string; at: number };

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
  const [peerReadAt, setPeerReadAt] = useState<string | null>(peerReadAtIso);
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // ===== helpers =====
  const setBusy = (v: boolean) => {
    document.documentElement.dataset.chatBusy = v ? '1' : '0';
  };

  const sameDay = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  const labelForDate = (d: Date) => {
    const now = new Date();
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    if (sameDay(d, now)) return 'Сегодня';
    if (sameDay(d, yesterday)) return 'Вчера';
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  // Автопрокрутка к концу
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Регистрируем API, под которое шлёт live.tsx
  useEffect(() => {
    if (!threadId) return;

    const api = {
      threadId,
      push: (p: PushPayload) => {
        if (p.threadId !== threadId) return;
        const m: Msg = {
          id: p.messageId,
          threadId: p.threadId,
          authorId: p.authorId,
          text: p.text,
          createdAt: p.ts,
        };
        setMessages(prev => [...prev, m]);
      },
      edit: (p: EditPayload) => {
        if (p.threadId !== threadId) return;
        setMessages(prev =>
          prev.map(m =>
            m.id === p.messageId ? { ...m, text: p.text, editedAt: new Date().toISOString() } : m
          )
        );
      },
      del: (p: DelPayload) => {
        if (p.threadId !== threadId) return;
        setMessages(prev =>
          p.scope === 'self'
            ? prev.filter(m => m.id !== p.messageId)
            : prev.map(m =>
                m.id === p.messageId
                  ? { ...m, text: '', deletedAt: new Date().toISOString() }
                  : m
              )
        );
      },
      read: (p: ReadPayload) => {
        if (p.threadId !== threadId) return;
        // событие read приходит обоим участникам; считаем это отметкой собеседника
        setPeerReadAt(new Date().toISOString());
      },
      onThreadDeleted: () => {
        setMessages([]);
      },
    };

    (window as any).__chatApi = api;
    return () => {
      if ((window as any).__chatApi?.threadId === threadId) (window as any).__chatApi = null;
    };
  }, [threadId]);

  // Отправка через server action
  async function send() {
    const txt = text.trim();
    if (!txt || !threadId) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('threadId', threadId);
      fd.set('text', txt);
      await sendMessageAction(fd);
      setText('');
      // фокус обратно в инпут
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function startEdit(m: Msg) {
    setEditingId(m.id);
    setEditText(m.text);
    setBusy(true);
  }

  async function saveEdit(id: string) {
    const newText = editText.trim();
    if (!newText) return;
    try {
      const fd = new FormData();
      fd.set('messageId', id);
      fd.set('text', newText);
      await editMessageAction(fd);
    } finally {
      setEditingId(null);
      setEditText('');
      setBusy(false);
    }
  }

  async function deleteMsg(id: string, scope: 'self' | 'both') {
    if (!confirm(scope === 'both' ? 'Удалить сообщение у всех?' : 'Скрыть сообщение только для вас?')) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('messageId', id);
      fd.set('scope', scope);
      await deleteMessageAction(fd);
    } finally {
      setBusy(false);
    }
  }

  let lastDateLabel: string | null = null;

  return (
    <div className={s.pane}>

      {/* Лента сообщений */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {messages.map((m) => {
          const created = new Date(m.createdAt);
          const label = labelForDate(created);
          const showDivider = label !== lastDateLabel;
          lastDateLabel = label;

          const mine = m.authorId === meId;
          const isRead = !!peerReadAt && new Date(m.createdAt) <= new Date(peerReadAt);

          return (
            <div key={m.id}>
              {showDivider && (
                <div className={s.dayDivider}><span>{label}</span></div>
              )}

              <div className={`${s.msgRow} ${mine ? s.mine : s.other}`}>
                <div className={`${s.msgCard} ${mine ? s.msgMineBg : s.msgOtherBg}`}>

                  {/* Текст / редактор */}
                  {editingId === m.id ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 10, padding: '6px 8px' }}
                      />
                      <button onClick={() => saveEdit(m.id)} title="Сохранить">OK</button>
                      <button onClick={() => { setEditingId(null); setEditText(''); setBusy(false); }} title="Отмена">Отмена</button>
                    </div>
                  ) : (
                    <div>
                      {m.deletedAt ? <i style={{ color: '#6b7280' }}>Сообщение удалено</i> : m.text}
                    </div>
                  )}

                  {/* Метаданные */}
                  <div className={s.msgMeta}>
                    <span>{m.authorName || (mine ? meName : peerName)}</span>
                    <span>{created.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                    {mine && !m.deletedAt && <span>{isRead ? '✔✔' : '✔'}</span>}
                    {m.editedAt && !m.deletedAt && <span>(изм.)</span>}
                  </div>

                  {/* Кнопки действий для своих не удалённых сообщений */}
                  {mine && !m.deletedAt && editingId !== m.id && (
                    <div style={{ marginTop: 4, display: 'flex', gap: 8 }}>
                      <button onClick={() => startEdit(m)} title="Изменить">✏️</button>
                      <button onClick={() => deleteMsg(m.id, 'both')} title="Удалить у всех">🗑</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Поле ввода */}
      {threadId && (
        <div style={{ padding: 8, borderTop: '1px solid #e5e7eb', display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            value={text}
            onFocus={() => setBusy(true)}
            onBlur={() => setBusy(false)}
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
      )}
    </div>
  );
}
