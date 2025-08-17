// app/(app)/chat/ThreadDeleteButton.tsx
'use client';

import { useRouter } from 'next/navigation';
import { deleteThreadAction } from './actions';
import s from './chat.module.css';

export default function ThreadDeleteButton({ threadId }: { threadId: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      className={s.threadDeleteBtn}
      title="Удалить диалог"
      onClick={async () => {
        if (!confirm('Удалить диалог?')) return;
        await deleteThreadAction(threadId);
        router.push('/chat');   // вернёмся в список
        router.refresh();       // и обновим список
      }}
    >
      ×
    </button>
  );
}
