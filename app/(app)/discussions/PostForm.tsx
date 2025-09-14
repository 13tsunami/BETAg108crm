'use client';

import { useFormStatus } from 'react-dom';

type Props = {
  mode: 'create' | 'edit';
  action: (fd: FormData) => Promise<void>;
  initial?: { id?: string; text?: string; pinned?: boolean };
};

function Submit({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" type="submit" disabled={pending}>
      {pending ? 'Сохранение…' : children}
    </button>
  );
}

export default function PostForm({ mode, action, initial }: Props) {
  return (
    <form className="disc-form" action={action}>
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <div className="row">
        <label className="lbl">Текст</label>
        <textarea
          name="text"
          className="inp"
          rows={5}
          required
          defaultValue={initial?.text ?? ''}
          maxLength={8000}
        />
      </div>
      <div className="row">
        <label className="lbl">Закрепить</label>
        <label className="chk">
          <input
            type="checkbox"
            name="pinned"
            value="1"
            defaultChecked={!!initial?.pinned}
          />
          да
        </label>
      </div>
      <div className="actions">
        <Submit>{mode === 'create' ? 'Создать' : 'Сохранить'}</Submit>
      </div>
    </form>
  );
}
