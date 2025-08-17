'use client';

import { useEffect, useRef, useState, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  sendMessageAction,
  editMessageAction,
  deleteMessageAction,
} from './actions';
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

  // редактор модалки
  const [edit, setEdit] = useState<null | { id: string; text: string }>(null);

  // оптимистика для отправки
  const pendingByClient = useRef<Set<string>>(new Set());

  // при смене треда — сброс на initial
  useEffect(() => {
    setMessages(Array.isArray(initial) ? initial : []);
    setText('');
    // сбросить возможную модалку
    setEdit(null);
  }, [threadId, initial]);

  // регистрация API для Live (/chat/sse). Всегда снимаем на размонтировании.
  useEffect(() => {
    const api = {
      threadId,
      push: (e: PushEvt) => {
        if (e.threadId !== threadId) return;
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
      read: (_e: ReadEvt) => {},
      onThreadDeleted: () => {
        startTransition(() => router.replace('/chat'));
      }
    };
    (window as any).__chatApi = api;
    return () => { (window as any).__chatApi = undefined; };
  }, [router, threadId]);

  // автопрокрутка
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const txt = text.trim();
    if (!txt || !threadId) return;
    const clientId = globalThis.crypto?.randomUUID?.() ?? String(Math.random());
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

    const fd = new FormData();
    fd.append('threadId', threadId);
    fd.append('text', txt);
    fd.append('clientId', clientId);
    try {
      await sendMessageAction(fd);
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      pendingByClient.current.delete(clientId);
    }
  }

  async function applyEdit(messageId: string, newText: string) {
    const t = newText.trim();
    if (!t) return;
    setMessages(prev => prev.map(m => m.id === messageId ? ({ ...m, text: t }) : m));
    setEdit(null);

    const fd = new FormData();
    fd.append('messageId', messageId);
    fd.append('text', t);
    try {
      await editMessageAction(fd);
    } catch {
      // при ошибке обновление придёт обратно через SSE как старый текст; дополнительный откат не нужен
    }
  }

  async function applyDelete(messageId: string, scope: 'self'|'both') {
    setMessages(prev => prev.filter(m => m.id !== messageId));
    setEdit(null);

    const fd = new FormData();
    fd.append('messageId', messageId);
    fd.append('scope', scope);
    try {
      await deleteMessageAction(fd);
    } catch {
      // при ошибке событие не придёт, сообщение уже удалено локально — пользователь может обновить страницу
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
              <div
                className={bubbleCls}
                title={new Date(m.createdAt).toLocaleString('ru-RU')}
                onClick={() => mine && setEdit({ id: m.id, text: m.text })}
                style={{ cursor: mine ? 'pointer' : 'default' }}
              >
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

      {edit && (
        <div className={s.modal} onClick={(e)=>{ if (e.target === e.currentTarget) setEdit(null); }}>
          <div className={s.modalCard}>
            <div className={s.modalTitle}>Сообщение</div>
            <div className={s.modalRow} style={{ marginBottom: 8 }}>
              <textarea
                value={edit.text}
                onChange={e => setEdit({ id: edit.id, text: e.target.value })}
                rows={4}
                className={s.inlineSearchInput}
                style={{ resize:'vertical' }}
              />
            </div>
            <div className={s.modalRow} style={{ justifyContent:'flex-end' }}>
              <button className={s.modalBtn} onClick={()=> setEdit(null)}>Отмена</button>
              <button className={s.modalBtn} onClick={()=> applyEdit(edit.id, edit.text)}>Сохранить</button>
              <button className={s.modalBtnDanger} onClick={()=> applyDelete(edit.id, 'self')}>Удалить у меня</button>
              <button className={s.modalBtnDanger} onClick={()=> applyDelete(edit.id, 'both')}>Удалить у всех</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
