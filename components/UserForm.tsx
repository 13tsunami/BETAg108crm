'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ROLE_LABELS, VISIBLE_ROLES } from '@/lib/roleLabels';
import type { Role } from '@/lib/roles';

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
const btnGhostSmall: React.CSSProperties = {
  height: 28, padding: '2px 10px', borderRadius: 8, cursor: 'pointer',
  border: `1px solid ${BORDER}`, background: '#f9fafb', fontSize: 12, whiteSpace: 'nowrap',
  color: BRAND, opacity: 0.6,
};

export type UserFormInitials = {
  name?: string; username?: string; email?: string; phone?: string; classroom?: string;
  role?: string; birthday?: string; telegram?: string; about?: string;
  notifyEmail?: boolean; notifyTelegram?: boolean;
};

type Lockable = 'name' | 'username' | 'classroom' | 'role' | 'birthday';

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

  const [showPwd, setShowPwd] = useState(false);
  const [showPwd2, setShowPwd2] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement | null>(null);

  const passwordNames = useMemo(() => {
    if (mode === 'create') {
      return { a: 'password', b: 'passwordConfirm', labelA: 'Пароль', labelB: 'Повторите пароль' };
    }
    return { a: 'newPassword', b: 'newPasswordConfirm', labelA: 'Новый пароль', labelB: 'Повторите новый пароль' };
  }, [mode]);

  const onSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    setPwdError(null);
    const f = e.currentTarget;
    const a = (f.elements.namedItem(passwordNames.a) as HTMLInputElement | null)?.value?.trim() ?? '';
    const b = (f.elements.namedItem(passwordNames.b) as HTMLInputElement | null)?.value?.trim() ?? '';

    if (mode === 'edit') {
      if (!a && !b) return;
      if (!a || !b) {
        e.preventDefault();
        setPwdError('Заполните оба поля пароля.');
        return;
      }
      if (a !== b) {
        e.preventDefault();
        setPwdError('Пароли не совпадают.');
        return;
      }
      return;
    }

    if (!a || !b) {
      e.preventDefault();
      setPwdError('Заполните оба поля пароля.');
      return;
    }
    if (a !== b) {
      e.preventDefault();
      setPwdError('Пароли не совпадают.');
      return;
    }
  }, [mode, passwordNames.a, passwordNames.b]);

  return (
    <form ref={formRef} action={action} onSubmit={onSubmit} noValidate>
      {mode === 'edit' && <input type="hidden" name="id" defaultValue={initialId} />}

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <Field label="ФИО">
          <input name="name" defaultValue={initialValues?.name} style={inp} required disabled={lock('name')} />
        </Field>
        <Field label="Логин">
          <input name="username" defaultValue={initialValues?.username} style={inp} disabled={lock('username')} />
        </Field>

        <Field label="E-mail">
          <input name="email" type="email" defaultValue={initialValues?.email} style={inp} />
        </Field>
        <Field label="Телефон">
          <input name="phone" defaultValue={initialValues?.phone} style={inp} />
        </Field>

        <Field label="Классное руководство">
          <input name="classroom" defaultValue={initialValues?.classroom} style={inp} disabled={lock('classroom')} />
        </Field>
        <Field label="Роль">
          <select name="role" defaultValue={initialValues?.role ?? 'teacher'} style={inp} disabled={lock('role')}>
            {VISIBLE_ROLES.map((r: Role) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Дата рождения">
          <input name="birthday" type="date" defaultValue={initialValues?.birthday} style={inp} disabled={lock('birthday')} />
        </Field>
        <Field label="Telegram">
          <input name="telegram" defaultValue={initialValues?.telegram} style={inp} />
        </Field>

        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="О себе">
            <textarea name="about" defaultValue={initialValues?.about} style={{ ...inp, minHeight: 96 }} />
          </Field>
        </div>

        <PasswordField
          label={mode === 'create' ? passwordNames.labelA + ' (обязательно)' : passwordNames.labelA + ' (опционально)'}
          name={passwordNames.a}
          show={showPwd}
          setShow={setShowPwd}
          required={mode === 'create'}
        />
        <PasswordField
          label={passwordNames.labelB}
          name={passwordNames.b}
          show={showPwd2}
          setShow={setShowPwd2}
          required={mode === 'create'}
        />

        {pwdError && (
          <div style={{ gridColumn: '1 / -1', color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>
            {pwdError}
          </div>
        )}

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
      <label style={{ fontSize: 13, fontWeight: 600, color: BRAND }}>{label}</label>
      {children}
    </div>
  );
}

function PasswordField(props: {
  label: string;
  name: string;
  show: boolean;
  setShow: (v: boolean) => void;
  required?: boolean;
}) {
  const { label, name, show, setShow, required } = props;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: BRAND }}>{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          name={name}
          type={show ? 'text' : 'password'}
          style={{ ...inp, flex: 1 }}
          autoComplete="new-password"
          required={!!required}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          aria-label={show ? 'Скрыть пароль' : 'Показать пароль'}
          style={btnGhostSmall}
        >
          {show ? 'скрыть' : 'показать'}
        </button>
      </div>
    </div>
  );
}
