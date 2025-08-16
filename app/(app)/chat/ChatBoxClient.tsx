'use client';

import { useEffect, useMemo, useRef, useState, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import s from './chat.module.css';
import {
  sendMessageAction,
  editMessageAction,
  deleteMessageAction,
  markReadAction,
  deleteThreadAction,
} from './actions';

// ===== Types =====
type Msg = {
  id: string;
  text: string;
  ts: string;       // ISO
  authorId: string;
  edited?: boolean;
  deleted?: boolean;
  temp?: { clientId: string }; // local-only marker for replacement
};

type ChatApi = {
  threadId: string;
  push: (p: { messageId: string; text: string; authorId: string; ts: string; clientId?: string }) => void;
  edit: (p: { messageId: string; text: string }) => void;
  del:  (p: { messageId: string; scope: 'self'|'both' }) => void;
  read: (p: { threadId: string }) => void;
  onThreadDeleted: (p: { byName: string }) => void;
};

declare global {
  interface Window { __chatApi?: ChatApi }
}

export default function ChatBoxClient({
  meId, threadId, peerReadAtIso, initial,
}: { meId: string; threadId: string; peerReadAtIso: string | null; initial: Msg[] }) {
  const router = useRouter();

  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [input, setInput] = useState('');
  const [modalOf, setModalOf] = useState<Msg | null>(null);
  const [editText, setEditText] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const peerReadAt = useMemo(() => (peerReadAtIso ? new Date(peerReadAtIso) : null), [peerReadAtIso]);

  // merge server -> client и зачистка висячих temp при серверном ререндере
  useEffect(() => {
    setMsgs(prev => {
      const official = new Map(initial.map(m => [m.id, { ...m }]));
      const sig = (m: Msg) => `${m.authorId}|${m.text}|${Math.floor(new Date(m.ts).getTime()/1000)}`;
      const officialSig = new Set(initial.map(sig));
      const carryTemps = prev.filter(m => m.temp && !officialSig.has(sig(m)));
      const merged = [...Array.from(official.values()), ...carryTemps];
      merged.sort((a,b) => a.ts.localeCompare(b.ts));
      return merged;
    });
  }, [initial]);

  // автоскролл
  useEffect(() => { bottomRef.current?.scrollIntoView({ block:'end' }); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block:'end', behavior:'smooth' }); }, [msgs.length]);

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
            // 3) уже есть «почти такой же» real — ничего не делаем
            const tReal = new Date(p.ts).getTime();
            const existsSame = xs.some(m => m.authorId===meId && !m.temp && m.text===p.text && Math.abs(new Date(m.ts).getTime() - tReal) <= 30000);
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

  return (
    <div className={s.block} style={{ display:'grid', gridTemplateRows:'auto 1fr auto' }}>
      {/* верхняя панель */}
      <div className={s.blockTop} style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
        <button onClick={onMarkRead} className={s.btn} disabled={!threadId}>отметить прочитанным</button>
        <button onClick={onDeleteThread} className={s.btnDel} disabled={!threadId}>
          <span className={s.btnDelIcon} aria-hidden /> удалить диалог
        </button>
      </div>

      {/* сообщения */}
      <div style={{ overflow:'auto', padding: 6 }}>
        {msgs.map((m) => {
          const mine = m.authorId === meId;
          const createdAt = new Date(m.ts);
          const read = mine && peerReadAt ? peerReadAt >= createdAt : false;
          const isDeleted = !!m.deleted && m.text === '';

          return (
            <div key={m.id} className={`${s.msgRow} ${mine ? s.msgMine : ''}`}>
              <div className={`${s.msgCard} ${mine ? s.msgTailMine : s.msgTailOther}`}>
                <div className={s.msgHead}>
                  <span className={s.msgMeta}>{fmt(createdAt)}</span>
                  {mine ? (
                    <span className={s.msgMeta} title={read ? 'прочитано' : 'доставлено'} style={{ display:'inline-flex', gap:4 }}>
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
      </div>

      {/* композер */}
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

      {/* модалка */}
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
