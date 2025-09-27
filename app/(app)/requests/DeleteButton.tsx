// app/(app)/requests/DeleteButton.tsx
'use client';

import { useFormStatus } from 'react-dom';
import { deleteRequestAction } from './actions';

export default function DeleteButton({ requestId }: { requestId: string }) {
  return (
    <form
      action={async (fd) => {
        const ok = window.confirm('Удалить заявку без возможности восстановления?');
        if (!ok) return;
        await deleteRequestAction(fd);
      }}
    >
      <input type="hidden" name="requestId" value={requestId} />
      <DelBtn />
    </form>
  );
}

function DelBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btnDanger" disabled={pending} title="Удалить заявку">
      {pending ? 'Удаляю' : 'Удалить'}
    </button>
  );
}
