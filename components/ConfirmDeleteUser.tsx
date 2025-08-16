'use client';

import React from 'react';
import Modal from './Modal';

export default function ConfirmDeleteUser({
  userId,
  userName,
  action,
}: {
  userId: string;
  userName: string;
  action: (fd: FormData) => Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ height: 32, padding: '4px 10px', borderRadius: 10, border: '1px solid #ef4444', background: '#fff', color: '#b91c1c', cursor: 'pointer' }}
      >
        удалить
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Удаление пользователя" width={560}>
        <div style={{ display: 'grid', gap: 12 }}>
          <p style={{ margin: 0 }}>
            Вы точно хотите удалить «{userName}»? Это безвозвратно сотрёт связанные объекты: сообщения, треды, отметки о прочтении, назначения в задачах и членство в группах.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{ height: 32, padding: '4px 10px', borderRadius: 10, border: '1px solid rgba(229,231,235,.9)', background: '#fff', cursor: 'pointer' }}
            >
              отмена
            </button>

            <form action={action} onSubmit={() => setOpen(false)}>
              <input type="hidden" name="id" value={userId} />
              <button
                type="submit"
                style={{ height: 32, padding: '4px 10px', borderRadius: 10, border: '1px solid #ef4444', background: '#b91c1c', color: '#fff', cursor: 'pointer' }}
              >
                удалить безвозвратно
              </button>
            </form>
          </div>
        </div>
      </Modal>
    </>
  );
}
