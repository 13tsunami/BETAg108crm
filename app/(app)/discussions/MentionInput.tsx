// app/(app)/discussions/MentionInput.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import type { TextareaHTMLAttributes } from 'react';

type Suggest = { username: string; name: string };

// Unicode: буквы/цифры всех алфавитов + _ . -
const TOKEN_CLASS = String.raw`\p{L}\p{N}_\.-`;

// Принимаем все стандартные атрибуты textarea,
// но управление value/onChange оставляем за компонентом.
type Props = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'onChange' | 'onKeyDown' | 'onKeyUp' | 'onClick'
> & {
  name: string;
  resetKey?: number; // добавлено: внешний триггер для очистки поля
  className?: string;
  rows?: number;
  maxLength?: number;
};

export default function MentionInput(props: Props) {
  const {
    name,
    placeholder,
    maxLength,
    rows = 3,
    className,
    defaultValue, // можно передавать снаружи
    resetKey,     // добавлено: деструктурируем resetKey
    ...rest // сюда попадут required, aria-*, data-*, autoFocus и пр.
  } = props;

  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(() => (defaultValue ? String(defaultValue) : ''));
  const [open, setOpen] = useState(false);
  const [suggests, setSuggests] = useState<Suggest[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [anchorLeft, setAnchorLeft] = useState(0);
  const [anchorTop, setAnchorTop] = useState(0);

  // сброс значения при изменении resetKey
  useEffect(() => {
    if (resetKey !== undefined) setValue('');
  }, [resetKey]);

  // детектируем токен "@слово" до курсора; start указывает НА '@'
  function detectToken(text: string, pos: number) {
    const left = text.slice(0, pos);
    const rx = new RegExp(String.raw`(^|[\s(])@([${TOKEN_CLASS}]{1,32})$`, 'u');
    const m = left.match(rx);
    if (!m) return null;
    const atPos = left.lastIndexOf('@');
    if (atPos < 0) return null;
    const term = m[2] ?? '';
    return { term, start: atPos };
  }

  async function fetchSuggest(term: string) {
    const r = await fetch(`/api/mentions?q=${encodeURIComponent(term)}`, { cache: 'no-store' });
    if (!r.ok) {
      setSuggests([]);
      setOpen(false);
      return;
    }
    const data: Suggest[] = await r.json();
    setSuggests(data);
    setOpen(data.length > 0);
    setHighlight(0);
  }

  function updateAnchor() {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Привязываем меню к нижнему левому внутреннему углу textarea
    setAnchorLeft(8);
    setAnchorTop(rect.height - 6);
  }

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const el = e.target;
    setValue(el.value);
    const pos = el.selectionStart ?? el.value.length;
    const token = detectToken(el.value, pos);
    if (token?.term) {
      fetchSuggest(token.term);
      updateAnchor();
    } else {
      setOpen(false);
    }
  }

  // подставляем username БЕЗ '@' (он уже в тексте)
  function replaceWith(username: string) {
    const el = ref.current;
    if (!el) return;
    const pos = el.selectionStart ?? el.value.length;
    const token = detectToken(value, pos);
    if (!token) return;
    const before = value.slice(0, token.start);
    const after = value.slice(pos);
    const next = `${before}@${username}${after}`;
    setValue(next);
    const newPos = before.length + 1 + username.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(newPos, newPos);
    });
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(h + 1, suggests.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const s = suggests[highlight];
      if (s) replaceWith(s.username); // БЕЗ '@'
    }
    if (e.key === 'Escape') setOpen(false);
  }

  useEffect(() => {
    function onClickDoc(ev: MouseEvent) {
      if (!ref.current) return;
      if (!(ev.target instanceof Node)) return;
      if (!ref.current.contains(ev.target)) setOpen(false);
    }
    document.addEventListener('click', onClickDoc);
    return () => document.removeEventListener('click', onClickDoc);
  }, []);

  return (
    <div className="disc-mention-box">
      <textarea
        ref={ref}
        name={name}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={rows}
        className={className}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onClick={updateAnchor}
        onKeyUp={updateAnchor}
        {...rest}
      />
      {open ? (
        <div className="disc-mention-menu" style={{ left: anchorLeft, bottom: anchorTop }}>
          {suggests.map((s, i) => (
            <button
              key={s.username}
              type="button"
              className={`disc-mention-item${i === highlight ? ' is-active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); replaceWith(s.username); }} // БЕЗ '@'
            >
              <span className="disc-mention-name">{s.name}</span>
              <span className="disc-mention-username">@{s.username}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
