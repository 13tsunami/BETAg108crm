'use client';

import { useFormStatus } from 'react-dom';

type Props = {
  createAction: (fd: FormData) => Promise<void>;
};

function SubmitBtn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" type="submit" disabled={pending}>
      {pending ? 'Сохранение…' : label}
    </button>
  );
}

export default function RequestForm({ createAction }: Props) {
  return (
    <form className="req-form" action={createAction}>
      <div className="row">
        <label className="lbl">Адресат</label>
        <select name="target" className="inp" defaultValue="sysadmin" required>
          <option value="sysadmin">sysadmin</option>
          <option value="ahch">ahch</option>
        </select>
      </div>
      <div className="row">
        <label className="lbl">Заголовок</label>
        <input className="inp" type="text" name="title" required maxLength={256} />
      </div>
      <div className="row">
        <label className="lbl">Описание</label>
        <textarea className="inp" name="body" rows={5} required maxLength={4000} />
      </div>
      <div className="actions">
        <SubmitBtn label="Создать заявку" />
      </div>
    </form>
  );
}
