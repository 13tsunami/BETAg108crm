'use client';

import { useEffect, useMemo, useRef, useState, startTransition, useLayoutEffect } from 'react';
import { useRouter } from 'next/navigation';
import s from './chat.module.css';
import {
  sendMessageAction,
  editMessageAction,
  deleteMessageAction,
  markReadAction,
  deleteThreadAction,
} from './actions';

type Msg = {
  id: string;
  text: string;
  ts: string;       // ISO
  authorId: string;
  edited?: boolean;
  deleted?: boolean;
  temp?: { clientId: string };
};

type ChatApi = {
  threadId: string;
  push: (p: { messageId: string; text: string; authorId: string; ts: string; clientId?: string }) => void;
  edit: (p: { messageId: string; text: string }) => void;
  del:  (p: { messageId: string; scope: 'self'|'both' }) => void;
  read: (p: { threadId: string }) => void;
  onThreadDeleted: (p: { byName: string }) => void;
};

declare global { interface Window { __chatApi?: ChatApi } }

export default function ChatBoxClient({
  meId, meName, peerName, threadId, peerReadAtIso, initial,
}: {
  meId: string;
  meName: string;
  peerName: string;
  threadId: string;
  peerReadAtIso: string | null;
  initial: Msg[];
}) {
  const router = useRouter();

  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [input, setInput] = useState('');
  const [modalOf, setModalOf] = useState<Msg | null>(null);
  const [editText, setEditText] = useState('');
  const scrollBoxRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [showToBottom, setShowToBottom] = useState(false);

  const peerReadAt = useMemo(
    () => (peerReadAtIso ? new Date(peerReadAtIso) : null),
    [peerReadAtIso]
  );

  // server -> client merge с фаззи-де-дупом для temp
  useEffect(() => {
    setMsgs(prev => {
      const official = [...initial];
      const officialByKey = new Map<string, number[]>();
      for (const m of official) {
        const key = `${m.authorId}::${m.text}`;
        const t = new Date(m.ts).getTime();
        const arr = officialByKey.get(key);
        if (arr) arr.push(t); else officialByKey.set(key, [t]);
      }
      for (const arr of officialByKey.values()) arr.sort((a,b)=>a-b);

      const isCoveredByOfficial = (m: Msg) => {
        const key = `${m.authorId}::${m.text}`;
        const arr = officialByKey.get(key);
        if (!arr || !arr.length) return false;
        const t = new Date(m.ts).getTime();
        // окно ±30 сек
        const i = lowerBound(arr, t - 30_000);
        return i < arr.length && Math.abs(arr[i] - t) <= 30_000;
      };

      const carryTemps = prev.filter(m => m.temp && !isCoveredByOfficial(m));
      const merged = [...official, ...carryTemps];
      merged.sort((a,b) => a.ts.localeCompare(b.ts));
      return merged;
    });
  }, [initial]);

  // автоскролл вниз при первой отрисовке
  useLayoutEffect(() => { bottomRef.current?.scrollIntoView({ block:'end' }); }, []);
  // плавная прокрутка при появлении новых сообщений
  useEffect(() => { bottomRef.current?.scrollIntoView({ block:'end', behavior:'smooth' }); }, [msgs.length]);

  // индикатор «к низу»
  useEffect(() => {
    const box = scrollBoxRef.current;
    if (!box) return;
    const onScroll = () => {
      const gap = box.scrollHeight - box.scrollTop - box.clientHeight;
      setShowToBottom(gap > 160);
    };
    onScroll();
    box.addEventListener('scroll', onScroll, { passive: true });
    return () => box.removeEventListener('scroll', onScroll);
  }, []);

  // Глобальный API для Live: никогда не добавляем второй пузырь для моих событий
  useEffect(() => {
    const api: ChatApi = {
      threadId,
      push: (p) => {
        setMsgs(xs => {
          if (xs.some(m => m.id === p.messageId)) return xs; // уже есть

          if (p.authorId === meId) {
            // 1) точное попадание по clientId
            if (p.clientId) {
              const i = xs.findIndex(m => m.temp?.clientId === p.clientId);
              if (i >= 0) {
                const next = xs.slice();
                next[i] = { id: p.messageId, text: p.text, ts: p.ts, authorId: p.authorId };
                return next;
              }
            }
            // 2) последний мой temp — заменяем его
            const j = [...xs].map((m,i)=>[i,m] as const).reverse().find(([_,m]) => m.authorId===meId && m.temp)?.[0];
            if (j !== undefined) {
              const next = xs.slice();
              next[j] = { id: p.messageId, text: p.text, ts: p.ts, authorId: p.authorId };
              return next;
            }
            // 3) уже есть «почти такой же» real — ничего не добавляем
            const tReal = new Date(p.ts).getTime();
            const existsSame = xs.some(m =>
              m.authorId===meId && !m.temp && m.text===p.text &&
              Math.abs(new Date(m.ts).getTime() - tReal) <= 30_000
            );
            if (existsSame) return xs;
          }

          // чужое сообщение — дописываем
          return [...xs, { id: p.messageId, text: p.text, ts: p.ts, authorId: p.authorId }];
        });
      },
      edit: (p) => setMsgs(xs => xs.map(m => m.id === p.messageId ? { ...m, text: p.text, edited: true } : m)),
      del:  (p) => { if (p.scope === 'both') setMsgs(xs => xs.map(m => m.id === p.messageId ? { ...m, text: '', deleted: true } : m)); },
      read: () => {},
      onThreadDeleted: () => { try { alert('Ваш чат был удалён собеседником.'); } catch {} },
    };
    window.__chatApi = api;
    return () => { if (window.__chatApi?.threadId === threadId) window.__chatApi = undefined; };
  }, [threadId, meId]);

  // отправка — сразу «финальный» пузырь; id заменится по SSE
  const onSend = (formData: FormData) => {
    const text = String(formData.get('text') || '').trim();
    if (!text || !threadId) return;
    const clientId = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}`;
    formData.set('clientId', clientId);

    const nowIso = new Date().toISOString();
    setMsgs(m => [...m, { id: `temp-${clientId}`, text, ts: nowIso, authorId: meId, temp: { clientId } }]);
    setInput('');
    startTransition(() => { void sendMessageAction(formData); });
  };

  const onMarkRead = () => {
    if (!threadId) return;
    const fd = new FormData(); fd.set('threadId', threadId);
    startTransition(() => { void markReadAction(fd); });
  };

  const openEdit = (m: Msg) => { setModalOf(m); setEditText(m.text); };
  const submitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    const m = modalOf; if (!m) return;
    const text = editText.trim(); if (!text || text === m.text) { setModalOf(null); return; }
    const fd = new FormData(); fd.set('messageId', m.id); fd.set('text', text);
    setMsgs(xs => xs.map(x => x.id === m.id ? { ...x, text, edited: true } : x));
    startTransition(() => { void editMessageAction(fd); });
    setModalOf(null);
  };

  const deleteSelf = (m: Msg) => {
    const fd = new FormData(); fd.set('messageId', m.id); fd.set('scope', 'self');
    setMsgs(arr => arr.filter(x => x.id !== m.id));
    startTransition(() => { void deleteMessageAction(fd); });
    setModalOf(null);
  };

  const deleteBoth = (m: Msg) => {
    const fd = new FormData(); fd.set('messageId', m.id); fd.set('scope', 'both');
    setMsgs(xs => xs.map(x => x.id === m.id ? { ...x, text: '', deleted: true } : x));
    startTransition(() => { void deleteMessageAction(fd); });
    setModalOf(null);
  };

  const onDeleteThread = () => {
    if (!threadId) return;
    const ok = confirm('Удалить диалог у обоих?'); if (!ok) return;
    const fd = new FormData(); fd.set('threadId', threadId);
    startTransition(() => { void deleteThreadAction(fd); });
    startTransition(() => { router.replace('/chat'); });
  };

  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ block:'end', behavior:'smooth' });

  return (
    <div className={s.block} style={{ display:'grid', gridTemplateRows:'auto 1fr auto' }}>
      <div className={s.blockTop} style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
        <button onClick={onMarkRead} className={s.btn} disabled={!threadId}>отметить прочитанным</button>
        <button onClick={onDeleteThread} className={s.btnDel} disabled={!threadId}>
          <span className={s.btnDelIcon} aria-hidden /> удалить диалог
        </button>
      </div>

      <div ref={scrollBoxRef} className={s.paneBody}>
        {msgs.map((m) => {
          const mine = m.authorId === meId;
          const createdAt = new Date(m.ts);
          const read = mine && peerReadAt ? peerReadAt >= createdAt : false;
          const isDeleted = !!m.deleted && m.text === '';

          return (
            <div key={m.id} className={`${s.msgRow} ${mine ? s.msgMine : ''}`}>
              <div className={`${s.msgCard} ${mine ? s.msgTailMine : s.msgTailOther}`}>
                <div className={`${s.msgHead} ${s.msgBubbleHead}`}>
                  <span className={s.msgAuthor} style={{ fontWeight:800 }}>
                    {mine ? (meName || 'Вы') : (peerName || 'Собеседник')}
                  </span>
                  <span className={s.msgMeta} style={{ marginLeft:6 }}>{fmt(createdAt)}</span>
                  {mine ? (
                    <span className={s.msgMeta} title={read ? 'прочитано' : 'доставлено'} style={{ display:'inline-flex', gap:4, marginLeft:'auto' }}>
                      <i aria-hidden style={{ width:12, height:12, display:'inline-block', borderBottom:'2px solid #9ca3af', borderLeft:'2px solid #9ca3af', transform:'rotate(-45deg)', borderRadius:1 }} />
                      <i aria-hidden style={{ width:12, height:12, display:'inline-block', borderBottom:`2px solid ${read ? '#8d2828' : '#9ca3af'}`, borderLeft:`2px solid ${read ? '#8d2828' : '#9ca3af'}`, transform:'rotate(-45deg)', borderRadius:1, opacity: read ? 1 : .35 }} />
                    </span>
                  ) : null}
                </div>

                <div className={s.msgText} onClick={() => setModalOf(m)} style={{ opacity: isDeleted ? .7 : 1 }}>
                  {isDeleted ? 'сообщение удалено' : m.text}
                  {m.edited && !isDeleted ? ' · ред.' : ''}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
        {showToBottom ? (
          <button type="button" className={s.toBottom} aria-label="вниз" onClick={scrollToBottom}>↓</button>
        ) : null}
      </div>

      <form action={onSend as any} className={s.composer} style={{ display:'flex', alignItems:'center', gap:8 }}>
        <input type="hidden" name="threadId" value={threadId} />
        <textarea
          name="text"
          className={s.textarea}
          placeholder="напишите сообщение…"
          value={input}
          onChange={(e)=>setInput(e.target.value)}
          rows={2}
          disabled={!threadId}
        />
        <button className={s.sendBtn} type="submit" disabled={!threadId || !input.trim()}>
          отправить
        </button>
      </form>

      {modalOf ? (
        <div className={s.modal} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.25)', display:'grid', placeItems:'center' }}>
          <div className={s.modalCard} style={{ width:'min(520px,92vw)', background:'#fff', border:'1px solid var(--line)', borderRadius:12, padding:12 }}>
            <div className={s.modalTitle} style={{ fontWeight:800, marginBottom:8 }}>Действия</div>
            {modalOf.authorId === meId ? (
              <>
                <form onSubmit={submitEdit}>
                  <input
                    value={editText}
                    onChange={(e)=>setEditText(e.target.value)}
                    placeholder="новый текст"
                    style={{ width:'100%', padding:'8px 10px', border:'1px solid var(--line)', borderRadius:10 }}
                  />
                  <div style={{ display:'flex', gap:8, marginTop:8 }}>
                    <button className={s.btn} type="submit">сохранить</button>
                    <button className={s.btnDel} type="button" onClick={()=>deleteBoth(modalOf)}>удалить для всех</button>
                  </div>
                </form>
                <div style={{ marginTop:8 }}>
                  <button className={s.btn} onClick={()=>deleteSelf(modalOf)}>удалить для себя</button>
                </div>
              </>
            ) : (
              <button className={s.btn} onClick={()=>deleteSelf(modalOf)}>удалить для себя</button>
            )}
            <div style={{ marginTop:8 }}>
              <button className={s.btn} onClick={()=>setModalOf(null)}>закрыть</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function fmt(d: Date) {
  const M = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  return `${String(d.getDate()).padStart(2,'0')} ${M[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function lowerBound(a: number[], x: number) {
  let l = 0, r = a.length;
  while (l < r) {
    const m = (l + r) >> 1;
    if (a[m] < x) l = m + 1; else r = m;
  }
  return l;
}
