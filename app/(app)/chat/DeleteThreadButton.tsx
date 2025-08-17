'use client';

import { useTransition } from 'react';
import { deleteThreadAction } from './actions';

export default function DeleteThreadButton({ threadId }: { threadId: string }) {
  const [pending, start] = useTransition();

  async function onDelete(e: React.MouseEvent) {
    e.preventDefault();
    if (!confirm('Удалить диалог безвозвратно?')) return;
    start(async () => {
      await deleteThreadAction(threadId);
      window.location.href = '/chat';
    });
  }

  return (
    <button
      onClick={onDelete}
      disabled={pending}
      style={{
        position: 'absolute',
        top: 6,
        right: 6,
        border: 'none',
        background: 'transparent',
        color: '#9ca3af',
        cursor: 'pointer',
      }}
      title="Удалить диалог"
    >
      ×
    </button>
  );
}
