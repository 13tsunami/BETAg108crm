// app/(app)/inboxtasks/ReviewSubmitForm.tsx
'use client';

import { useEffect, useMemo, useRef, useState, useCallback, FormEvent } from 'react';
import { useFormStatus } from 'react-dom';
import { submitForReviewAction } from './review-actions';
import styles from './ReviewSubmitForm.module.css';

type Props = {
  taskId: string;
  disabled?: boolean;
};

const MAX_MB = 25;
const MAX_BYTES = MAX_MB * 1024 * 1024;

function SubmitBtn({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={styles.btnBrand}
      disabled={disabled || pending}
      title={disabled ? 'Уже отправлено на проверку или принято' : pending ? 'Отправляю…' : 'Отправить на проверку'}
      style={{ justifySelf: 'start' }}
    >
      {pending ? 'Отправляю…' : 'Отправить на проверку'}
    </button>
  );
}

export default function ReviewSubmitForm({ taskId, disabled }: Props) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const totalBytes = useMemo(() => files.reduce((s, f) => s + f.size, 0), [files]);
  const totalMb = useMemo(() => Math.ceil(totalBytes / (1024 * 1024)), [totalBytes]);

  useEffect(() => {
    if (totalBytes > MAX_BYTES) {
      setError(`Превышен лимит ${MAX_MB} МБ (сейчас ~${totalMb} МБ). Удалите лишние файлы.`);
    } else {
      setError(null);
    }
  }, [totalBytes, totalMb]);

  const syncInputFiles = useCallback((next: File[]) => {
    const input = fileInputRef.current;
    if (!input) return;
    const dt = new DataTransfer();
    next.forEach(f => dt.items.add(f));
    input.files = dt.files;
  }, []);

  const onPickFiles = useCallback<React.ChangeEventHandler<HTMLInputElement>>((e) => {
    const picked = Array.from(e.target.files ?? []);
    const next = [...files, ...picked];
    setFiles(next);
    syncInputFiles(next);
  }, [files, syncInputFiles]);

  const removeFile = useCallback((idx: number) => {
    const next = files.filter((_, i) => i !== idx);
    setFiles(next);
    syncInputFiles(next);
  }, [files, syncInputFiles]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      formRef.current?.requestSubmit();
    }
  }, []);

  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const autoSize = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 6 * 24) + 'px';
  }, []);
  useEffect(() => { autoSize(); }, [comment, autoSize]);

  const onSubmit = useCallback((e: FormEvent<HTMLFormElement>) => {
    if (error) {
      e.preventDefault();
    }
  }, [error]);

  return (
    <form
      ref={formRef}
      action={submitForReviewAction}
      onSubmit={onSubmit}
      style={{ display: 'grid', gap: 8, alignItems: 'start', marginBottom: 8 }}
    >
      <input type="hidden" name="taskId" value={taskId} />

      <label style={{ fontSize: 15, color: '#8d2828', display: 'block' }}>
        Отправить проверяющему сообщение:
        <textarea
          ref={taRef}
          name="comment"
          rows={2}
          placeholder="Коротко: что сделано, на что обратить внимание"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onInput={autoSize}
          onKeyDown={onKeyDown}
          style={{
            display: 'block',
            width: '100%',
            marginTop: 6,
            padding: '6px 8px',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            resize: 'none',
            fontSize: 14,
            lineHeight: '24px'
          }}
        />
      </label>

      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            ref={fileInputRef}
            type="file"
            name="files"
            multiple
            onChange={onPickFiles}
            style={{ fontSize: 13 }}
          />
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            до {MAX_MB} МБ, можно несколько, Ctrl/⌘+Enter — отправить
          </span>
        </div>

        {files.length > 0 && (
          <ul className="attachList">
            {files.map((f, i) => {
              const name = f.name;
              const ext = (name.split('.').pop() || '').toLowerCase();
              const sizeKb = Math.max(1, Math.round(f.size / 1024));
              return (
                <li key={name + i} className="attachItem" data-ext={ext}>
                  <span className="attachIcon" aria-hidden="true" />
                  <span className="attachName" title={name}>{name}</span>
                  <span style={{ color: '#6b7280', marginLeft: 'auto', fontSize: 12 }}>
                    ~{sizeKb} КБ
                  </span>
                  <button
                    type="button"
                    className="chip__x"
                    aria-label={`Удалить ${name}`}
                    onClick={() => removeFile(i)}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div style={{ fontSize: 12, color: error ? '#b91c1c' : '#6b7280' }}>
          {error ? error : files.length > 0 ? `Файлов: ${files.length}, суммарно ~${Math.ceil(totalBytes / (1024 * 1024))} МБ` : 'Файлы не выбраны'}
        </div>
      </div>

      <SubmitBtn disabled={!!disabled || !!error} />
    </form>
  );
}
