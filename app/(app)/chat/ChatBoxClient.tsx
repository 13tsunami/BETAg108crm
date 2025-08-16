// app/(app)/chat/ChatBoxClient.tsx
'use client';

import { useEffect, useMemo, useRef, useState, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendMessageAction, editMessageAction, deleteMessageAction, markReadAction, deleteThreadAction } from './actions';

type Msg = {
  id: string;            // id из БД или temp-*
  text: string;
  ts: string;            // ISO
  authorId: string;
  edited?: boolean;
  deleted?: boolean;
  pending?: boolean;
  clientId?: string;     // ← для маппинга pending -> real
};

export default function ChatBoxClient({
  meId, threadId, peerReadAtIso, initial,
}: {
  meId: string;
  threadId: string;
  peerReadAtIso: string | null;
  initial: Msg[];
}) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [input, setInput] = useState('');
  const [modalOf, setModalOf] = useState<Msg | null>(null);
  const [editText, setEditText] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const peerReadAt = useMemo(() => (peerReadAtIso ? new Date(peerReadAtIso) : null), [peerReadAtIso]);

  // аккуратный мердж initial + зачистка «висящих» pending по времени/тексту
  useEffect(() => {
    setMsgs(prev => {
      const official = new Map(initial.map(m => [m.id, { ...m, pending: false, clientId: undefined }]));
      // убираем pending, если есть очень похожее «официальное» сообщение (мой автор, тот же текст, время ±5s)
      const idxByKey = new Set(
        initial.map(m => `${m.authorId}|${m.text}|${Math.floor(new Date(m.ts).getTime()/1000)}`)
      );
      const cleanedPending = prev.filter(m => {
        if (!m.pending) return false; // не переносим «не pending»
        const key = `${m.authorId}|${m.text}|${Math.floor(new Date(m.ts).getTime()/1000)}`;
        const near = idxByKey.has(key);
        return !near; // переносим только те pending, для которых нет «пары»
      });
      const merged = [...Array.from(official.values()), ...cleanedPending];
      merged.sort((a,b) => a.ts.localeCompare(b.ts));
      return merged;
    });
  }, [initial]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block:'end' }); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block:'end', behavior:'smooth' }); }, [msgs.length]);

  // Глобальный API — мгновенная дорисовка и точная замена по clientId
  useEffect(() => {
    const api = {
      threadId,
      push: (p: { messageId: string; text: string; authorId: string; ts: string; clientId?: string }) => {
        setMsgs(xs => {
          if (xs.some(m => m.id === p.messageId)) return xs; // уже есть «настоящий»
          if (p.authorId === meId) {
            // 1) ищем pending по clientId
            const byClient = p.clientId ? xs.findIndex(m => m.pending && m.clientId === p.clientId) : -1;
            if (byClient >= 0) {
              const next = xs.slice();
              next[byClient] = { id: p.messageId, text: p.text, ts: p.ts, authorId: p.authorId };
              return next;
            }
            // 2) fallback — берём самый свежий pending «мой»
            const lastMinePending = [...xs].map((m,i)=>[i,m] as const).reverse().find(([_,m]) => m.pending && m.authorId===meId)?.[0];
            if (lastMinePending !== undefined) {
              const next = xs.slice();
              next[lastMinePending] = { id: p.messageId, text: p.text, ts: p.ts, authorId: p.authorId };
              return next;
            }
          }
          // чужое сообщение — просто добавляем
          return [...xs, { id: p.messageId, text: p.text, ts: p.ts, authorId: p.authorId }];
        });
      },
      edit: (p: { messageId: string; text: string }) => {
        setMsgs(xs => xs.map(m => m.id === p.messageId ? { ...m, text: p.text, edited: true, pending: false } : m));
      },
      del: (p: { messageId: string; scope: 'self'|'both' }) => {
        if (p.scope === 'both') setMsgs(xs => xs.map(m => m.id === p.messageId ? { ...m, text: '', deleted: true, pending: false } : m));
      },
      read: (_p: any) => { /* галочки подтянутся с сервера позже */ },
      onThreadDeleted: (_p: { byName: string }) => {
        try { alert('Ваш чат был удалён собеседником.'); } catch {}
      },
    };
    (window as any).__chatApi = api;
    return () => { if ((window as any).__chatApi?.threadId === threadId) (window as any).__chatApi = undefined; };
  }, [threadId, meId]);

  // отправка
  const onSend = (formData: FormData) => {
    const text = String(formData.get('text') || '').trim();
    if (!text || !threadId) return;
    const clientId = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}`; // nonce
    formData.set('clientId', clientId);

    const tempId = `temp-${clientId}`;
    setMsgs(m => [...m, { id: tempId, clientId, pending: true, text, ts: new Date().toISOString(), authorId: meId }]);
    setInput('');
    startTransition(() => { void sendMessageAction(formData); });
  };

  const onMarkRead = () => {
    if (!threadId) return;
    const fd = new FormData();
    fd.set('threadId', threadId);
    startTransition(() => { void markReadAction(fd); });
  };

  const openEdit = (m: Msg) => { setModalOf(m); setEditText(m.text); };
  const submitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    const m = modalOf; if (!m) return;
    const text = editText.trim(); if (!text || text === m.text) { setModalOf(null); return; }
    const fd = new FormData(); fd.set('messageId', m.id); fd.set('text', text);
    setMsgs(xs => xs.map(x => x.id === m.id ? { ...x, text, edited: true, pending: false } : x));
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
    setMsgs(xs => xs.map(x => x.id === m.id ? { ...x, text: '', deleted: true, pending: false } : x));
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
    <div className="chatbox" style={{ display:'grid', gridTemplateRows:'auto 1fr auto', height:640 }}>
      <div style={{ display:'flex', justifyContent:'flex-end', padding:'6px 12px' }}>
        <button className="btn" onClick={onMarkRead} disabled={!threadId} style={{
          height:36, padding:'0 12px', borderRadius:10, border:'1px solid rgba(229,231,235,.9)', background:'#fff', cursor:'pointer'
        }}>отметить прочитанным</button>
        <button onClick={onDeleteThread} className="btn danger" disabled={!threadId} style={{
          marginLeft:8, height:36, padding:'0 12px', borderRadius:10, border:'1px solid #ef4444', background:'#fff', color:'#b91c1c', cursor:'pointer'
        }}>удалить диалог</button>
      </div>

      <div className="messages" style={{ overflow:'auto', padding:10 }}>
        {msgs.length === 0 ? <div className="pill" style={{ margin:10 }}>нет сообщений</div> : null}
        {msgs.map((m) => {
          const mine = m.authorId === meId;
          const createdAt = new Date(m.ts);
          const read = mine && peerReadAt ? peerReadAt >= createdAt : false;
          const isDeleted = !!m.deleted && m.text === '';
          return (
            <div key={m.id} className={`msg ${mine ? 'me' : ''}`} onClick={() => setModalOf(m)} style={{
              maxWidth:'72%', margin:'8px 0', padding:'10px 12px', borderRadius:12, border:'1px solid rgba(229,231,235,.8)',
              background: m.pending ? '#fffef5' : '#fff',
              boxShadow:'0 4px 12px rgba(0,0,0,.04)', marginLeft: mine ? 'auto' : undefined, opacity: isDeleted ? .7 : 1
            }}>
              <div style={{ whiteSpace:'pre-wrap' }}>
                {isDeleted ? 'сообщение удалено' : m.text}
                {m.edited && !isDeleted ? ' · ред.' : ''}
                {m.pending ? ' · отправка…' : ''}
              </div>
              <div className="time" style={{ fontSize:11, color:'#6b7280', marginTop:6, display:'flex', gap:6, alignItems:'center' }}>
                <span>{fmt(createdAt)}</span>
                {mine ? (
                  <span className="checks" title={read ? 'прочитано' : 'доставлено'} style={{ display:'inline-flex', alignItems:'center', gap:2, transform:'translateY(1px)' }}>
                    <i className="c" style={{
                      width:12, height:12, display:'inline-block', borderBottom:'2px solid #9ca3af', borderLeft:'2px solid #9ca3af',
                      transform:'rotate(-45deg)', borderRadius:1
                    }} />
                    <i className="c" style={{
                      width:12, height:12, display:'inline-block', borderBottom:`2px solid ${read ? '#8d2828' : '#9ca3af'}`,
                      borderLeft:`2px solid ${read ? '#8d2828' : '#9ca3af'}`, transform:'rotate(-45deg)', borderRadius:1, opacity: read ? 1 : .35
                    }} />
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form action={onSend as any} className="composer" style={{ display:'flex', gap:8, padding:10, borderTop:'1px solid rgba(229,231,235,.85)' }}>
        <input type="hidden" name="threadId" value={threadId} />
        {/* clientId сетим в onSend через formData.set(...) */}
        <input type="text" name="text" placeholder="напишите сообщение…" value={input} onChange={(e) => setInput(e.target.value)}
               disabled={!threadId}
               style={{ flex:1, height:40, padding:'8px 10px', border:'1px solid rgba(229,231,235,.9)', borderRadius:10, outline:'none', background:'#fff' }}
        />
        <button className="btn primary" type="submit" disabled={!threadId || !input.trim()} style={{
          height:40, padding:'0 14px', borderRadius:10, border:'1px solid rgba(229,231,235,.9)', background:'#fff', cursor:'pointer'
        }}>отправить</button>
      </form>

      {modalOf ? (
        <div className="modal" style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.2)', display:'grid', placeItems:'center' }}>
          <div className="modal__card" style={{
            width:'min(520px, 92vw)', background:'#fff', border:'1px solid rgba(229,231,235,.9)', borderRadius:12, padding:12
          }}>
            <div style={{ fontWeight:700, marginBottom:8 }}>Действия</div>
            {modalOf.authorId === meId ? (
              <>
                <form onSubmit={submitEdit}>
                  <input
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    placeholder="новый текст"
                    style={{ width:'100%', padding:'8px 10px', border:'1px solid rgba(229,231,235,.9)', borderRadius:10 }}
                  />
                  <div style={{ display:'flex', gap:8, marginTop:8 }}>
                    <button className="btn" type="submit" style={{ height:36, padding:'0 12px', borderRadius:10, border:'1px solid rgba(229,231,235,.9)', background:'#fff' }}>сохранить</button>
                    <button className="btn danger" type="button" onClick={() => deleteBoth(modalOf)} style={{
                      height:36, padding:'0 12px', borderRadius:10, border:'1px solid #ef4444', background:'#fff', color:'#b91c1c'
                    }}>удалить для всех</button>
                  </div>
                </form>
                <div style={{ marginTop:8 }}>
                  <button className="btn" onClick={() => deleteSelf(modalOf)} style={{
                    height:36, padding:'0 12px', borderRadius:10, border:'1px solid rgba(229,231,235,.9)', background:'#fff'
                  }}>удалить для себя</button>
                </div>
              </>
            ) : (
              <button className="btn" onClick={() => deleteSelf(modalOf)} style={{
                height:36, padding:'0 12px', borderRadius:10, border:'1px solid rgba(229,231,235,.9)', background:'#fff'
              }}>удалить для себя</button>
            )}
            <div style={{ marginTop:8 }}>
              <button className="btn" onClick={() => setModalOf(null)} style={{
                height:36, padding:'0 12px', borderRadius:10, border:'1px solid rgba(229,231,235,.9)', background:'#fff'
              }}>закрыть</button>
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
