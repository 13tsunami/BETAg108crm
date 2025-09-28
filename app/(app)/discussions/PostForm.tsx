'use client';

import { useFormStatus } from 'react-dom';
import { useCallback, useMemo, useRef, useState } from 'react';

type Props = {
  mode: 'create' | 'edit';
  action: (fd: FormData) => Promise<void>;
  initial?: { id?: string; text?: string; pinned?: boolean };
};

const MAX_LEN = 8000;

function Submit({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" type="submit" disabled={pending}>
      {pending ? 'Сохранение…' : children}
    </button>
  );
}

export default function PostForm({ mode, action, initial }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [len, setLen] = useState<number>(initial?.text?.length ?? 0);

  const textId = useMemo(() => `post-text-${initial?.id ?? 'new'}`, [initial?.id]);
  const pinId = useMemo(() => `post-pin-${initial?.id ?? 'new'}`, [initial?.id]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }, []);

  const onInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLen(e.currentTarget.value.length);
  }, []);

  return (
    <form ref={formRef} className="disc-form" action={action}>
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}

      <div className="row">
        <label className="lbl" htmlFor={textId}>Текст</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <textarea
            id={textId}
            name="text"
            className="inp"
            rows={5}
            required
            defaultValue={initial?.text ?? ''}
            maxLength={MAX_LEN}
            placeholder="Коротко и по делу…"
            onKeyDown={onKeyDown}
            onInput={onInput}
          />
          <div style={{ fontSize: 12, color: '#6b7280', alignSelf: 'flex-end' }}>
            {len}/{MAX_LEN}
          </div>
        </div>
      </div>

      <div className="row">
        <label className="lbl" htmlFor={pinId}>Закрепить</label>
        <label className="chk" htmlFor={pinId}>
          <input
            id={pinId}
            type="checkbox"
            name="pinned"
            value="1"
            defaultChecked={!!initial?.pinned}
          />
          да
        </label>
      </div>

      <div className="actions">
        <Submit>{mode === 'create' ? 'Создать' : 'Сохранить'}</Submit>
      </div>
    </form>
  );
}
