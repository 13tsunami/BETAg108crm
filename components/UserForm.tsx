'use client';

import React from 'react';

const BORDER = 'rgba(229,231,235,.9)';
const BRAND = '#8d2828';

const inp: React.CSSProperties = {
  height: 36, fontSize: 14, padding: '6px 10px',
  borderRadius: 10, border: `1px solid ${BORDER}`, background: '#fff', outline: 'none',
};
const btnPrimary: React.CSSProperties = {
  height: 36, padding: '6px 12px', borderRadius: 10,
  border: `1px solid ${BRAND}`, background: BRAND, color: '#fff', cursor: 'pointer',
};

export type UserFormInitials = {
  name?: string; username?: string; email?: string; phone?: string; classroom?: string;
  role?: string; birthday?: string; telegram?: string; about?: string;
  notifyEmail?: boolean; notifyTelegram?: boolean;
};

type Lockable =
  | 'name' | 'username' | 'classroom' | 'role' | 'birthday';

export default function UserForm({
  action, mode, initialId, initialValues, disabledFields,
}: {
  action: (fd: FormData) => Promise<void>;
  mode: 'create' | 'edit';
  initialId?: string;
  initialValues?: UserFormInitials;
  disabledFields?: Partial<Record<Lockable, boolean>>;
}) {
  const lock = (k: Lockable) => !!disabledFields?.[k];

  return (
    <form action={action}>
      {mode === 'edit' && <input type="hidden" name="id" defaultValue={initialId} />}

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <Field label="ФИО"><input name="name" defaultValue={initialValues?.name} style={inp} required disabled={lock('name')} /></Field>
        <Field label="Логин"><input name="username" defaultValue={initialValues?.username} style={inp} disabled={lock('username')} /></Field>

        <Field label="E-mail"><input name="email" type="email" defaultValue={initialValues?.email} style={inp} /></Field>
        <Field label="Телефон"><input name="phone" defaultValue={initialValues?.phone} style={inp} /></Field>

        <Field label="Классное руководство"><input name="classroom" defaultValue={initialValues?.classroom} style={inp} disabled={lock('classroom')} /></Field>
        <Field label="Роль">
          <select name="role" defaultValue={initialValues?.role ?? 'teacher'} style={inp} disabled={lock('role')}>
            <option value="director">Директор</option>
            <option value="deputy_plus">Заместитель +</option>
            <option value="deputy">Заместитель</option>
            <option value="teacher_plus">Педагог +</option>
            <option value="teacher">Педагог</option>
          </select>
        </Field>

        <Field label="Дата рождения"><input name="birthday" type="date" defaultValue={initialValues?.birthday} style={inp} disabled={lock('birthday')} /></Field>
        <Field label="Telegram"><input name="telegram" defaultValue={initialValues?.telegram} style={inp} /></Field>

        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="О себе">
            <textarea name="about" defaultValue={initialValues?.about} style={{ ...inp, minHeight: 96 }} />
          </Field>
        </div>

        {mode === 'create'
          ? <Field label="Пароль (при создании)"><input name="password" type="password" style={inp} /></Field>
          : <Field label="Новый пароль (опционально)"><input name="newPassword" type="password" style={inp} /></Field>
        }

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" name="notifyEmail" defaultChecked={!!initialValues?.notifyEmail} />
            уведомлять по e-mail
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" name="notifyTelegram" defaultChecked={!!initialValues?.notifyTelegram} />
            уведомлять в telegram
          </label>
        </div>

        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={btnPrimary} type="submit">{mode === 'create' ? 'создать' : 'сохранить'}</button>
        </div>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <label style={{ fontSize: 13, color: '#374151' }}>{label}</label>
      {children}
    </div>
  );
}
