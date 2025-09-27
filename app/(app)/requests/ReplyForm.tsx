// app/(app)/requests/ReplyForm.tsx
'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { replyRequestAction } from './actions';

export default function ReplyForm({ requestId }: { requestId: string }) {
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);

  // авто-рост textarea до 6 строк
  const autoGrow = React.useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const cs = window.getComputedStyle(el);
    const line = parseFloat(cs.lineHeight || '20'); // px
    const max = line * 6;                            // максимум ~6 строк
    el.style.height = Math.min(el.scrollHeight, max) + 'px';
    // если контента больше 6 строк — включается скролл (overflow:auto в CSS)
  }, []);

  React.useEffect(() => {
    autoGrow(); // первичная инициализация
  }, [autoGrow]);

  return (
    <form action={replyRequestAction} className="composerForm" onSubmit={autoGrow}>
      <input type="hidden" name="requestId" value={requestId} />
      <textarea
        ref={taRef}
        name="text"
        className="composerInput"
        placeholder="Напишите сообщение…"
        rows={1}
        onInput={autoGrow}
        required
      />
      <SendButton />
    </form>
  );
}

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btnPrimary composerSend" disabled={pending}>
      {pending ? 'Отправляю' : 'Отправить'}
    </button>
  );
}
