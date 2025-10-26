// app/(app)/discussions/LikeModal.tsx
'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Person = { username: string | null; name: string | null };

type Props = {
  people: Person[];
  triggerId: string;     // id счётчика (для CSS и связки aria-controls)
  label?: string;        // текст/число на счётчике
  small?: boolean;       // компактный вид счётчика
  triggerClass?: string; // если хотите свой класс вместо дефолтного
  ariaLabel?: string;
};

export default function LikeModal({
  people,
  triggerId,
  label = 'Показать всех',
  small = false,
  triggerClass,
  ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Запрет прокрутки страницы, когда модалка открыта
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  // Закрытие по Esc (глобально, пока открыто)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        // вернём фокус на счётчик
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const btnClass = triggerClass ?? (small ? 'disc-like-count-btn' : 'disc-like-count');

  return (
    <>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className={btnClass}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${triggerId}-modal`}
        aria-label={ariaLabel}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>

      {open &&
        createPortal(
          <div
            id={`${triggerId}-modal`}
            role="dialog"
            aria-labelledby={`${titleId}`}
            aria-modal="true"
            className="disc-portal"
          >
            <div
              className="disc-portal-backdrop"
              onClick={() => {
                setOpen(false);
                requestAnimationFrame(() => triggerRef.current?.focus());
              }}
            />
            <div className="disc-modal-card disc-portal-card" role="document">
              <div className="disc-modal-head">
                <h2 id={titleId} className="disc-modal-title">
                  Отметили «нравится»
                </h2>
                <button
                  type="button"
                  className="disc-btn-lite"
                  onClick={() => {
                    setOpen(false);
                    requestAnimationFrame(() => triggerRef.current?.focus());
                  }}
                  aria-label="Закрыть"
                >
                  Закрыть
                </button>
              </div>

              <div className="disc-modal-body">
                {people.length === 0 ? (
                  <p className="disc-muted">Пока никто не оценил, но всё ещё впереди!</p>
                ) : (
                  <ul className="disc-like-list">
                    {people.map((p, i) => {
                      const at = p.username ? `@${p.username}` : '';
                      const fio = p.name ?? '';
                      return (
                        <li key={`${p.username ?? 'u'}-${i}`} className="disc-like-item">
                          {at ? (
                            <>
                              <span className="disc-like-handle">{at}</span>
                              {fio && <span className="disc-like-sep"> · </span>}
                              {fio && <span className="disc-like-fio">{fio}</span>}
                            </>
                          ) : (
                            <span className="disc-like-fio">{fio || 'Без имени'}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
