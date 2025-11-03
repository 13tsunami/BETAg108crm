// app/(app)/inboxtasks/Badge.tsx
import * as React from 'react';

type BadgeKind =
  | 'muted'    // серый контур, спокойный текст
  | 'urgent'   // фирменный бордовый (срочно)
  | 'redo'     // красный (возврат/ошибка)
  // ниже — добавлены, чтобы типы не падали в местах использования
  | 'warning'  // жёлтовато-оранжевый
  | 'success'  // зелёный
  | 'danger';  // красный (синоним redo)

type Props = {
  kind: BadgeKind;
  children: React.ReactNode;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
};

export default function Badge({ kind, children, title, className, style }: Props) {
  // Базовая геометрия — «тянется» по содержимому, перенос слов разрешён
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    lineHeight: '18px',
    padding: '0 8px',
    minHeight: 18,
    borderRadius: 999,
    fontWeight: 800,
    border: '1px solid #e5e7eb',
    background: '#fff',
    color: '#111827',
    verticalAlign: 'middle',
  };

  const map: Record<BadgeKind, React.CSSProperties> = {
    muted:   { background: '#fff',    borderColor: '#e5e7eb', color: '#6b7280' },
    urgent:  { background: '#8d2828', borderColor: '#8d2828', color: '#fff' },
    redo:    { background: '#ef4444', borderColor: '#ef4444', color: '#fff' },
    warning: { background: '#f59e0b', borderColor: '#f59e0b', color: '#111827' },
    success: { background: '#10b981', borderColor: '#10b981', color: '#0b3a2d' },
    danger:  { background: '#ef4444', borderColor: '#ef4444', color: '#fff' },
  };

  return (
    <span
      className={className}
      title={title}
      style={{ ...base, ...map[kind], ...style }}
    >
      {children}
    </span>
  );
}
