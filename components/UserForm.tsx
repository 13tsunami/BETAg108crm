// app/(app)/u/[username]/UserForm.tsx
'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ROLE_LABELS, VISIBLE_ROLES } from '@/lib/roleLabels';
import type { Role } from '@/lib/roles';

const BRAND = '#8d2828';

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
    <form ref={formRef} action={action} onSubmit={onSubmit} noValidate className="uf">
      {mode === 'edit' && <input type="hidden" name="id" defaultValue={initialId} />}

      <div className="card glass">
        <div className="grid">
          <Field label="ФИО">
            <input name="name" defaultValue={initialValues?.name} className="inp" required disabled={lock('name')} />
          </Field>
          <Field label="Логин">
            <input name="username" defaultValue={initialValues?.username} className="inp" disabled={lock('username')} />
          </Field>

          <Field label="E-mail">
            <input name="email" type="email" defaultValue={initialValues?.email} className="inp" />
          </Field>
          <Field label="Телефон">
            <input name="phone" defaultValue={initialValues?.phone} className="inp" />
          </Field>

          <Field label="Классное руководство">
            <input name="classroom" defaultValue={initialValues?.classroom} className="inp" disabled={lock('classroom')} />
          </Field>
          <Field label="Роль">
            <select name="role" defaultValue={initialValues?.role ?? 'teacher'} className="inp" disabled={lock('role')}>
              {VISIBLE_ROLES.map((r: Role) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Дата рождения">
            <input name="birthday" type="date" defaultValue={initialValues?.birthday} className="inp" disabled={lock('birthday')} />
          </Field>
          <Field label="Telegram">
            <input name="telegram" defaultValue={initialValues?.telegram} className="inp" />
          </Field>

          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="О себе">
              <textarea name="about" defaultValue={initialValues?.about} className="inp" style={{ minHeight: 96 }} />
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
            <div className="pwdErr">
              {pwdError}
            </div>
          )}

          <div className="actionsRow">
            <button className="btnPrimary" type="submit">{mode === 'create' ? 'создать' : 'сохранить'}</button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .uf {
          --brand: ${BRAND};
          --ink: #0f172a;
          --muted: #6b7280;
          --border: rgba(229,231,235,.9);
          --glass-bg: rgba(255,255,255,.75);
          --glass-blur: 10px;
          --glass-shadow: 0 10px 30px rgba(17,24,39,.10);
          --glass-inset: inset 0 1px 0 rgba(255,255,255,.6);
        }

        .card {
          border-radius: 16px;
          padding: 16px;
          border: 1px solid rgba(141,40,40,.25);
          background: var(--glass-bg);
        }
        .glass {
          -webkit-backdrop-filter: blur(var(--glass-blur));
          backdrop-filter: blur(var(--glass-blur));
          box-shadow: var(--glass-shadow), var(--glass-inset);
        }

        .grid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        @media (max-width: 900px) {
          .grid { grid-template-columns: 1fr; }
        }

        .label {
          font-size: 13px;
          font-weight: 700;
          color: var(--brand);
          margin: 0 0 6px 0;
        }

        .inp {
          width: 100%;
          height: 40px;
          padding: 8px 12px;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          background: rgba(255,255,255,.95);
          color: #111827;
          font-size: 14px;
          outline: none;
          transition: box-shadow .15s ease, border-color .15s ease, background .15s ease, transform .06s ease;
        }
        .inp:focus {
          border-color: var(--brand);
          box-shadow: 0 0 0 3px rgba(141,40,40,.15), inset 0 1px 0 rgba(255,255,255,.5);
          background: #fff;
        }
        textarea.inp {
          min-height: 96px;
          resize: vertical;
        }
        select.inp {
          background: rgba(255,255,255,.95);
        }
        .inp:disabled {
          background: #f9fafb;
          color: #6b7280;
          cursor: not-allowed;
          opacity: .9;
        }

        .btnPrimary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 40px;
          padding: 0 16px;
          border-radius: 12px;
          border: 1px solid var(--brand);
          background: var(--brand);
          color: #fff;
          font-weight: 800;
          letter-spacing: .2px;
          cursor: pointer;
          text-decoration: none;
          box-shadow: 0 6px 14px rgba(141,40,40,.25);
          transition: transform .04s ease, box-shadow .12s ease, filter .12s ease;
        }
        .btnPrimary:hover { transform: translateY(-1px); box-shadow: 0 10px 18px rgba(141,40,40,.28); }
        .btnPrimary:active { transform: translateY(0); box-shadow: 0 6px 14px rgba(141,40,40,.25); }
        .btnPrimary:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(141,40,40,.18), 0 6px 14px rgba(141,40,40,.25); }
        .btnPrimary:disabled { opacity: .65; cursor: default; transform: none; box-shadow: none; }

        .btnGhostSmall {
          height: 32px;
          padding: 0 12px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: linear-gradient(180deg, rgba(255,255,255,.72), rgba(255,255,255,.5));
          color: var(--brand);
          font-weight: 700;
          font-size: 13px;
          white-space: nowrap;
          cursor: pointer;
          -webkit-backdrop-filter: blur(10px);
          backdrop-filter: blur(10px);
          transition: transform .06s ease, box-shadow .12s ease, border-color .12s ease, background .12s ease, filter .12s ease;
        }
        .btnGhostSmall:hover { box-shadow: 0 6px 16px rgba(17,24,39,.08); border-color: rgba(141,40,40,.28); }
        .btnGhostSmall:active { transform: translateY(1px); }
        .btnGhostSmall:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(141,40,40,.15); }
        .btnGhostSmall:disabled { opacity: .6; cursor: not-allowed; transform: none; box-shadow: none; }

        .pwdErr {
          grid-column: 1 / -1;
          color: #b91c1c;
          font-size: 13px;
          font-weight: 600;
        }

        .actionsRow {
          grid-column: 1 / -1;
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 2px;
        }
      `}</style>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <label className="label">{label}</label>
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
      <label className="label">{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          name={name}
          type={show ? 'text' : 'password'}
          className="inp"
          style={{ flex: 1 }}
          autoComplete="new-password"
          required={!!required}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          aria-label={show ? 'Скрыть пароль' : 'Показать пароль'}
          className="btnGhostSmall"
        >
          {show ? 'скрыть' : 'показать'}
        </button>
      </div>
    </div>
  );
}
