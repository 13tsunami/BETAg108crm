// app/(app)/dashboard/FortuneCookieClient.tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import s from './fortune-cookie.module.css';

type FortuneKind = 'fortune' | 'fact';

type ApiResponse = {
  kind: FortuneKind;
  text: string;
};

type State = 'idle' | 'breaking' | 'open' | 'disabled';

type Props = {
  userId?: string | null;
};

function getTodayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, '0');
  const d = `${now.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getStorageKey(userId?: string | null): string {
  const base = getTodayKey();
  const suffix =
    userId && userId.trim().length > 0 ? userId.trim() : 'anon';
  return `fortune-cookie-shown-${base}-${suffix}`;
}

export default function FortuneCookieClient({ userId }: Props) {
  const [state, setState] = useState<State>('idle');
  const [text, setText] = useState<string | null>(null);
  const [kind, setKind] = useState<FortuneKind>('fortune');
  const [loading, setLoading] = useState(false);
  const [wiggle, setWiggle] = useState(false);

  const disabled = useMemo(() => state === 'disabled', [state]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = getStorageKey(userId);
    const stored = window.localStorage.getItem(key);
    if (stored === '1') {
      setState('disabled');
    }
  }, [userId]);

  useEffect(() => {
    if (disabled || state !== 'idle') {
      setWiggle(false);
      return;
    }

    let cancelled = false;
    let timeoutOuter: number | undefined;
    let timeoutInner: number | undefined;

    const schedule = () => {
      const delay = 4000 + Math.floor(Math.random() * 6000);
      timeoutOuter = window.setTimeout(() => {
        if (cancelled) return;
        setWiggle(true);
        timeoutInner = window.setTimeout(() => {
          if (cancelled) return;
          setWiggle(false);
          schedule();
        }, 600);
      }, delay);
    };

    schedule();

    return () => {
      cancelled = true;
      if (timeoutOuter !== undefined) window.clearTimeout(timeoutOuter);
      if (timeoutInner !== undefined) window.clearTimeout(timeoutInner);
    };
  }, [disabled, state]);

  const markShown = useCallback(() => {
    if (typeof window === 'undefined') return;
    const key = getStorageKey(userId);
    try {
      window.localStorage.setItem(key, '1');
    } catch {
      // игнорируем
    }
  }, [userId]);

  const handleClick = useCallback(async () => {
    if (loading || disabled) return;

    setLoading(true);
    setState('breaking');

    try {
      const res = await fetch('/api/fortune-cookie', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      const data = (await res.json()) as ApiResponse;

      setText(data.text);
      setKind(data.kind);
      markShown();

      setTimeout(() => {
        setState('open');
        setLoading(false);
      }, 380);
    } catch {
      setText('Сегодня система устала, но у Вас всё равно всё получится.');
      setKind('fortune');
      markShown();
      setTimeout(() => {
        setState('open');
        setLoading(false);
      }, 380);
    }
  }, [disabled, loading, markShown]);

  const handleClose = useCallback(() => {
    setState('disabled');
  }, []);

  const label = useMemo(() => {
    if (disabled) return 'Печенька на сегодня уже открыта';
    if (loading || state === 'breaking') return 'Открываем печеньку дня';
    return 'Печенька дня';
  }, [disabled, loading, state]);

  const kindLabel = kind === 'fortune' ? 'предсказание' : 'факт';
  const kindFull =
    kind === 'fortune' ? 'Предсказание на день' : 'Интересный факт';

  if (state === 'disabled') {
    return null;
  }

  return (
    <div className={s.root} aria-label={label} title={label}>
      <button
        type="button"
        className={s.button}
        onClick={handleClick}
        disabled={loading}
      >
        {state === 'breaking' ? (
          <div className={`${s.cookieSplit} ${s.breaking}`}>
            <div className={`${s.cookieHalf} ${s.cookieHalfLeft}`} />
            <div className={`${s.cookieHalf} ${s.cookieHalfRight}`} />
          </div>
        ) : (
          <div
            className={[
              s.cookie,
              wiggle ? s.cookieWiggle : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className={s.cookieInner} />
            <div className={s.cookieIcon} />
          </div>
        )}
      </button>

      {state === 'open' && text && (
        <div className={s.backdrop} onClick={handleClose}>
          <div
            className={s.paper}
            onClick={(evt) => {
              evt.stopPropagation();
            }}
          >
            <div className={s.paperHeader}>
              <div className={s.paperTitle}>Печенька дня</div>
              <div className={s.paperTag}>{kindLabel}</div>
            </div>
            <div className={s.paperSubtitle}>{kindFull}</div>
            <div className={s.paperText}>{text}</div>
            <div className={s.paperActions}>
              <button
                type="button"
                className={s.closeButton}
                onClick={handleClose}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
