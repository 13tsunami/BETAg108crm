'use client';

import React from 'react';
import Link from 'next/link';

type TaskAssignee = { userId?: string; status?: string | null; user?: { id: string } | null };
type Task = {
  id: string;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  priority?: 'high' | 'normal' | string | null;
  hidden?: boolean | null;
  createdById?: string | null;
  seq?: number | null;
  assignees?: TaskAssignee[];
};

type SimpleUser = { id: string; name: string | null; role?: string | null; roleSlug?: string | null };

export default function TaskPopover(props: {
  anchor: DOMRect | null;
  onClose: () => void;
  task: Task;
  users: SimpleUser[];
  meId: string;
  brand: string;
  okColor: string;
  borderColor: string;
  text1: string;
  text2: string;
  bgSoft: string;
  onMarked?: () => void;
}) {
  const { anchor, onClose, task: t, users, meId, brand, okColor, borderColor, text1, text2, bgSoft, onMarked } = props;

  const ref = React.useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = React.useState<{ left: number; top: number }>({ left: 0, top: 0 });

  React.useLayoutEffect(() => {
    const pad = 12;
    const el = ref.current;
    if (!anchor || !el) return;
    let left = anchor.left;
    let top = anchor.bottom + 6;
    const { innerWidth: vw, innerHeight: vh } = window;
    const rect = el.getBoundingClientRect();
    if (left + rect.width + pad > vw) left = Math.max(pad, vw - rect.width - pad);
    if (top + rect.height + pad > vh) {
      const above = anchor.top - 6 - rect.height;
      top = Math.max(pad, above);
    }
    if (top < pad) top = pad;
    if (left < pad) left = pad;
    setPos({ left, top });
  }, [anchor, t?.id]);

  React.useEffect(() => {
    const onDown = () => onClose();
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [onClose]);

  const usersById = React.useMemo(() => {
    const m = new Map<string, string>();
    (users || []).forEach(u => { if (u.id) m.set(u.id, u.name || u.id); });
    return m;
  }, [users]);

  const assignedBy = t.createdById ? (usersById.get(t.createdById) ?? t.createdById) : 'неизвестно';
  const assigneesResolved = React.useMemo(() => {
    if (!Array.isArray(t.assignees)) return [];
    return t.assignees.map(a => {
      const id = a.userId ?? a.user?.id ?? '';
      const name = usersById.get(id) || id;
      return { id, name, done: a.status === 'done' };
    });
  }, [t, usersById]);

  const myRecord = React.useMemo(() => {
    if (!Array.isArray(t.assignees)) return null;
    return t.assignees.find(a => (a.userId ?? a.user?.id) === meId) ?? null;
  }, [t, meId]);

  const canMarkDone = !!myRecord && myRecord.status !== 'done';

  async function markDone() {
    try {
      const res = await fetch(`/api/tasks/${t.id}/assignees/${meId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        alert(`Не удалось отметить выполненной${msg ? `: ${msg}` : ''}`);
        return;
      }
      onMarked?.();
      onClose();
    } catch {
      // ignore
    }
  }

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        zIndex: 10000,
        background: '#fff',
        border: `1px solid ${borderColor}`,
        borderRadius: 12,
        boxShadow: '0 16px 40px rgba(0,0,0,0.2)',
        padding: 12,
        maxWidth: 520,
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>{t.title}</div>

      <Row label="Назначил" text1={text1} text2={text2}>
        <span style={{ fontWeight: 700, color: text1 }}>{assignedBy}</span>
      </Row>

      <Row label="Срок" text1={text1} text2={text2}>
        <span>{t.dueDate ? new Date(t.dueDate).toLocaleDateString('ru-RU') : 'не задан'}</span>
      </Row>

      <Row label="Приоритет" text1={text1} text2={text2}>
        <span style={{ color: t.priority === 'high' ? brand : text1 }}>{t.priority === 'high' ? 'срочный' : 'обычный'}</span>
      </Row>

      {!!t.description && (
        <div
          style={{
            marginTop: 8,
            border: `1px solid ${borderColor}`,
            background: bgSoft,
            borderRadius: 10,
            padding: 10,
            color: text1,
            whiteSpace: 'pre-wrap',
            lineHeight: 1.35,
          }}
        >
          {t.description}
        </div>
      )}

      {!!assigneesResolved.length && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: text2, marginBottom: 6 }}>Исполнители</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {assigneesResolved.map(a => (
              <span
                key={a.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  border: `1px solid ${a.done ? okColor : borderColor}`,
                  background: a.done ? '#f0fdf4' : '#fff',
                  color: text1,
                  borderRadius: 999,
                  padding: '2px 8px',
                  fontSize: 12,
                  fontWeight: 700,
                }}
                title={a.done ? 'выполнено' : 'в работе'}
              >
                {a.name} {a.done && <span style={{ color: okColor }}>✓</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <ButtonLink href={`/inboxTasks?focus=${encodeURIComponent(t.id)}`} brand={brand} onClick={onClose}>
          Открыть в «Задачах»
        </ButtonLink>
        {canMarkDone && (
          <button
            onClick={() => void markDone()}
            style={{ height: 32, padding: '0 12px', borderRadius: 10, border: `1px solid ${brand}`, background: brand, color: '#fff', cursor: 'pointer', fontWeight: 700 }}
          >
            Выполнить
          </button>
        )}
      </div>
    </div>
  );
}

function ButtonLink(props: { href: string; onClick?: () => void; children: React.ReactNode; brand: string }) {
  return (
    <Link
      href={props.href}
      onClick={props.onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: 32,
        padding: '0 12px',
        borderRadius: 10,
        border: `1px solid ${props.brand}`,
        background: '#fff',
        color: props.brand,
        cursor: 'pointer',
        fontWeight: 700,
        textDecoration: 'none',
      }}
    >
      {props.children}
    </Link>
  );
}

function Row({ label, children, text1, text2 }: { label: string; children: React.ReactNode; text1: string; text2: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 12, color: text2, marginTop: 2 }}>
      <div style={{ minWidth: 90 }}>{label}:</div>
      <div style={{ color: text1 }}>{children}</div>
    </div>
  );
}
