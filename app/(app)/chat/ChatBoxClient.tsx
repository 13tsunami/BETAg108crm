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
  const formRef = useRef<HTMLFormElement | null>(null);

  const peerReadAt = useMemo(
    () => (peerReadAtIso ? new Date(peerReadAtIso) : null),
    [peerReadAtIso]
  );

  // ---------- merge server->client с надёжной анти-дедуп логикой ----------
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
        const i = lowerBound(arr, t - 30_000); // окно ±30с
        return i < arr.length && Math.abs(arr[i] - t) <= 30_000;
      };

      const carryTemps = prev.filter(m => m.temp && !isCoveredByOfficial(m));
      const merged = [...official, ...carryTemps];
      merged.sort((a,b) => a.ts.localeCompare(b.ts));
      return merged;
    });
  }, [initial]);

  // ---------- автоскролл ----------
  useLayoutEffect(() => { bottomRef.current?.scrollIntoView({ block:'end' }); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block:'end', behavior:'smooth' }); }, [msgs.length]);

  // «к низу» FAB
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

  // ---------- API для Live ----------
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

  // ---------- отправка ----------
  const doSend = () => {
    const text = input.trim();
    if (!text || !threadId) return;

    const fd = new FormData();
    fd.set('threadId', threadId);
    fd.set('text', text);

    const clientId = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}`;
    fd.set('clientId', clientId);

    const nowIso = new Date().toISOString();
    setMsgs(m => [...m, { id: `temp-${clientId}`, text, ts: nowIso, authorId: meId, temp: { clientId } }]);
    setInput('');
    startTransition(() => { void sendMessageAction(fd); });
  };

  const onSend = (formData: FormData) => {
    // путь submit'а из формы (кнопка)
    const val = String(formData.get('text') || '').trim();
    if (!val) return;
    setInput(val);
    doSend();
  };

  // отметка «прочитано»
  const onMarkRead = () => {
    if (!threadId) return;
    const fd = new FormData(); fd.set('threadId', threadId);
    startTransition(() => { void markReadAction(fd); });
  };

  // edit / delete
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

  // ---------- helpers для дат и времени ----------
  const dayKey = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };
  const dayLabel = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const yest = new Date(); yest.setDate(now.getDate() - 1);
    const same = (a: Date, b: Date) => a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
    if (same(d, now)) return 'Сегодня';
    if (same(d, yest)) return 'Вчера';
    const M = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
    return `${String(d.getDate()).padStart(2,'0')} ${M[d.getMonth()]} ${d.getFullYear()}`;
  };
  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
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
      <div ref={scrollBoxRef} className={s.paneBody}>
        {/* разделители дней + сообщения */}
        {(() => {
          const items: React.ReactNode[] = [];

          let prevDay: string | null = null;

          for (const m of msgs) {
            const mine = m.authorId === meId;
            const createdAt = new Date(m.ts);
            const isDeleted = !!m.deleted && m.text === '';
            const curDay = dayKey(m.ts);
            if (curDay !== prevDay) {
              items.push(
                <div key={`day-${curDay}`} className={s.daySep}><span>{dayLabel(m.ts)}</span></div>
              );
              prevDay = curDay;
            }

            items.push(
              <div key={m.id} className={`${s.msgRow} ${mine ? s.msgMine : ''}`}>
                <div className={`${s.msgCard} ${mine ? s.msgMineBg : s.msgOtherBg}`}>
                  {/* фиксированная шапка: у меня справа, у собеседника слева */}
                  <div className={`${s.msgHead} ${mine ? s.headMine : s.headOther}`}>
                    {mine ? (
                      <>
                        <span className={s.msgMeta}>{fmtTime(m.ts)}</span>
                        <span className={s.msgAuthor}>{meName || 'Вы'}</span>
                      </>
                    ) : (
                      <>
                        <span className={s.msgAuthor}>{peerName || 'Собеседник'}</span>
                        <span className={s.msgMeta}>{fmtTime(m.ts)}</span>
                      </>
                    )}
                  </div>

                  <div className={s.msgText} onClick={() => setModalOf(m)} style={{ opacity: isDeleted ? .7 : 1 }}>
                    {isDeleted ? 'сообщение удалено' : m.text}
                    {m.edited && !isDeleted ? ' · ред.' : ''}
                  </div>
                </div>
              </div>
            );
          }
          return items;
        })()}

        <div ref={bottomRef} />
        {showToBottom ? (
          <button type="button" className={s.toBottom} aria-label="вниз" onClick={scrollToBottom}>↓</button>
        ) : null}
      </div>

      {/* композер */}
      <form
        ref={formRef}
        action={onSend as any}
        className={s.composer}
        style={{ display:'flex', alignItems:'center', gap:8 }}
      >
        <input type="hidden" name="threadId" value={threadId} />
        <textarea
          name="text"
          className={s.textarea}
          placeholder="напишите сообщение…"
          value={input}
          onChange={(e)=>setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              doSend(); // ENTER — отправка
            }
          }}
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

function lowerBound(a: number[], x: number) {
  let l = 0, r = a.length;
  while (l < r) {
    const m = (l + r) >> 1;
    if (a[m] < x) l = m + 1; else r = m;
  }
  return l;
}
