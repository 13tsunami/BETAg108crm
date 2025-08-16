'use client';

import { useEffect, useMemo, useRef, useState, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendMessageAction, editMessageAction, deleteMessageAction, markReadAction, deleteThreadAction } from './actions';

type Msg = {
  id: string;
  text: string;
  ts: string;        // ISO
  authorId: string;
  edited?: boolean;
  deleted?: boolean;
  temp?: { clientId: string }; // локовый маркер для склейки
};

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

  // merge server -> client + зачистка висячих temp при серверном ререндере
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

  useEffect(() => { bottomRef.current?.scrollIntoView({ block:'end' }); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block:'end', behavior:'smooth' }); }, [msgs.length]);

  // Глобальный API для Live: никогда не добавляем второй пузырь для моих событий
  useEffect(() => {
    const api = {
      threadId,
      push: (p: { messageId: string; text: string; authorId: string; ts: string; clientId?: string }) => {
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
            // 3) уже есть почти такой же real — ничего не делаем
            const tReal = new Date(p.ts).getTime();
            const existsSame = xs.some(m => m.authorId===meId && !m.temp && m.text===p.text && Math.abs(new Date(m.ts).getTime() - tReal) <= 30000);
            if (existsSame) return xs;
          }
          // чужое сообщение — дописываем
          return [...xs, { id: p.messageId, text: p.text, ts: p.ts, authorId: p.authorId }];
        });
      },
      edit: (p: { messageId: string; text: string }) => {
        setMsgs(xs => xs.map(m => m.id === p.messageId ? { ...m, text: p.text, edited: true } : m));
      },
      del: (p: { messageId: string; scope: 'self'|'both' }) => {
        if (p.scope === 'both') setMsgs(xs => xs.map(m => m.id === p.messageId ? { ...m, text: '', deleted: true } : m));
      },
      read: (_p: any) => {},
      onThreadDeleted: (_p: { byName: string }) => { try { alert('Ваш чат был удалён собеседником.'); } catch {} },
    };
    (window as any).__chatApi = api;
    return () => { if ((window as any).__chatApi?.threadId === threadId) (window as any).__chatApi = undefined; };
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
              background:'#fff', boxShadow:'0 4px 12px rgba(0,0,0,.04)', marginLeft: mine ? 'auto' : undefined, opacity: isDeleted ? .7 : 1
            }}>
              <div style={{ whiteSpace:'pre-wrap' }}>
                {isDeleted ? 'сообщение удалено' : m.text}
                {m.edited && !isDeleted ? ' · ред.' : ''}
              </div>
              <div className="time" style={{ fontSize:11, color:'#6b7280', marginTop:6, display:'flex', gap:6, alignItems:'center' }}>
                <span>{fmt(createdAt)}</span>
                {mine ? (
                  <span className="checks" title={read ? 'прочитано' : 'доставлено'} style={{ display:'inline-flex', alignItems:'center', gap:2, transform:'translateY(1px)' }}>
                    <i className="c" style={{ width:12, height:12, display:'inline-block', borderBottom:'2px solid #9ca3af', borderLeft:'2px solid #9ca3af', transform:'rotate(-45deg)', borderRadius:1 }} />
                    <i className="c" style={{ width:12, height:12, display:'inline-block', borderBottom:`2px solid ${read ? '#8d2828' : '#9ca3af'}`, borderLeft:`2px solid ${read ? '#8d2828' : '#9ca3af'}`, transform:'rotate(-45deg)', borderRadius:1, opacity: read ? 1 : .35 }} />
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
          <div className="modal__card" style={{ width:'min(520px, 92vw)', background:'#fff', border:'1px solid rgba(229,231,235,.9)', borderRadius:12, padding:12 }}>
            <div style={{ fontWeight:700, marginBottom:8 }}>Действия</div>
            {modalOf.authorId === meId ? (
              <>
                <form onSubmit={submitEdit}>
                  <input value={editText} onChange={(e) => setEditText(e.target.value)} placeholder="новый текст"
                         style={{ width:'100%', padding:'8px 10px', border:'1px solid rgba(229,231,235,.9)', borderRadius:10 }} />
                  <div style={{ display:'flex', gap:8, marginTop:8 }}>
                    <button className="btn" type="submit" style={{ height:36, padding:'0 12px', borderRadius:10, border:'1px solid rgba(229,231,235,.9)', background:'#fff' }}>сохранить</button>
                    <button className="btn danger" type="button" onClick={() => deleteBoth(modalOf)} style={{ height:36, padding:'0 12px', borderRadius:10, border:'1px solid #ef4444', background:'#fff', color:'#b91c1c' }}>удалить для всех</button>
                  </div>
                </form>
                <div style={{ marginTop:8 }}>
                  <button className="btn" onClick={() => deleteSelf(modalOf)} style={{ height:36, padding:'0 12px', borderRadius:10, border:'1px solid rgba(229,231,235,.9)', background:'#fff' }}>удалить для себя</button>
                </div>
              </>
            ) : (
              <button className="btn" onClick={() => deleteSelf(modalOf)} style={{ height:36, padding:'0 12px', borderRadius:10, border:'1px solid rgba(229,231,235,.9)', background:'#fff' }}>удалить для себя</button>
            )}
            <div style={{ marginTop:8 }}>
              <button className="btn" onClick={() => setModalOf(null)} style={{ height:36, padding:'0 12px', borderRadius:10, border:'1px solid rgba(229,231,235,.9)', background:'#fff' }}>закрыть</button>
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
