'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import s from './chat.module.css';

type Msg = {
  id: string;
  text: string;
  ts: string;        // ISO
  authorId: string;
  edited?: boolean;
  deleted?: boolean;
};

export default function ChatBoxClient(props: {
  meId: string;
  meName: string;
  peerName: string;
  threadId: string;                  // '' если тред не выбран
  peerReadAtIso: string | null;      // для «прочитал собеседник»
  initial: Msg[];
}) {
  const { meId, peerName, threadId, initial } = props;

  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const canSend = threadId && text.trim().length > 0;

  // автоскролл вниз
  const scrollBottom = () => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  useEffect(() => {
    // при смене треда: сбрасываем поток и сообщения
    setMsgs(initial);
    scrollBottom();

    if (!threadId) {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      return;
    }

    const es = new EventSource(`/chat/live?threadId=${encodeURIComponent(threadId)}`, {
      withCredentials: true,
    });
    esRef.current = es;

    es.onmessage = (ev) => {
      try {
        const { type, payload } = JSON.parse(ev.data);
        if (type === 'message' && payload) {
          setMsgs((prev) => {
            if (prev.some((m) => m.id === payload.id)) return prev;
            const next = [...prev, payload as Msg];
            // не даём разрастись бесконечно (на всякий случай)
            if (next.length > 2000) next.splice(0, next.length - 2000);
            return next;
          });
          // небольшой таймаут, чтобы DOM успел отрендериться
          setTimeout(scrollBottom, 16);
        }
      } catch {}
    };

    es.onerror = () => {
      // Браузер сам переподключится к SSE; если закрыли — попробуем открыть заново через небольшую паузу
      // (без агрессивных ретраев)
    };

    return () => {
      es.close();
      esRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  useEffect(() => {
    // при первом монтировании после initial — доскроллить
    setTimeout(scrollBottom, 0);
  }, []);

  async function send() {
    if (!canSend) return;
    const payload = { text: text.trim() };
    setText('');
    // локальный эхо делать НЕ будем — ждём round-trip от сервера, чтобы не разъезжалась история
    const res = await fetch(`/chat/live?threadId=${encodeURIComponent(threadId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    if (!res.ok) {
      // Вернём текст назад, чтобы пользователь не потерял его
      setText(payload.text);
      alert('Не удалось отправить сообщение');
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className={s.chatPane}>
      <div ref={listRef} className={s.msgList}>
        {msgs.map((m) => {
          const mine = m.authorId === meId;
          return (
            <div key={m.id} className={`${s.msg} ${mine ? s.msgMine : s.msgPeer}`}>
              <div className={s.msgBubble}>
                <div className={s.msgText}>{m.text}</div>
                <div className={s.msgMeta}>
                  <span suppressHydrationWarning>{new Date(m.ts).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className={s.composer}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder="Напишите сообщение…"
          className={s.input}
          rows={2}
        />
        <button className={s.sendBtn} onClick={() => void send()} disabled={!canSend}>
          Отправить
        </button>
      </div>
    </div>
  );
}
