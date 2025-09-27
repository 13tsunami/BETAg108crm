// app/(app)/requests/CreateForm.tsx
'use client';

import { useFormStatus } from 'react-dom';
import { createRequestAction } from './actions';

export default function CreateForm() {
  return (
    <form action={createRequestAction} className="createForm" noValidate>
      <div className="field">
        <label htmlFor="target" className="label">Кому</label>
        <select id="target" name="target" className="input" required>
          <option value="deputy_axh">Заместитель по АХЧ</option>
          <option value="sysadmin">Системный администратор</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="title" className="label">Заголовок</label>
        <input id="title" name="title" className="input" placeholder="Короткий заголовок" required />
      </div>

      <div className="field">
        <label htmlFor="body" className="label">Описание</label>
        <textarea
          id="body"
          name="body"
          className="textarea"
          placeholder="Опишите суть проблемы"
          rows={4}
          required
        />
      </div>

      <button type="submit" className="btnPrimary" style={{ marginTop: 4 }}>
        Создать заявку
      </button>
    </form>
  );
}
