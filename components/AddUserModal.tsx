'use client';

import React from 'react';
import Modal from './Modal';
import UserForm from './UserForm';

export default function AddUserModal({ action }: { action: (fd: FormData) => Promise<void> }) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          height: 36, padding: '6px 12px', borderRadius: 10,
          border: '1px solid #8d2828', background: '#8d2828', color: '#fff', cursor: 'pointer'
        }}
      >
        добавить
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Создать пользователя" width={780}>
        <UserForm action={action} mode="create" />
      </Modal>
    </>
  );
}
