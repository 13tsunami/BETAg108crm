'use client';

import React from 'react';
import Modal from './Modal';
import UserForm, { UserFormInitials } from './UserForm';

export default function EditUserModal({
  action, userId, initial,
}: {
  action: (fd: FormData) => Promise<void>;
  userId: string;
  initial: UserFormInitials & { name: string };
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          height: 32, padding: '4px 10px', borderRadius: 10,
          border: '1px solid rgba(229,231,235,.9)', background: '#fff', cursor: 'pointer'
        }}
      >
        редактировать
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={`Редактировать: ${initial.name}`} width={780}>
        <UserForm action={action} mode="edit" initialId={userId} initialValues={initial} />
      </Modal>
    </>
  );
}
