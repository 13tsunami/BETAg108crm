'use client';
import React from 'react';

export default function RequestForm({createAction}:{createAction:(fd:FormData)=>Promise<void>}) {
  return (
    <form className="req-form" action={createAction}>
      <select name="target" className="inp" required>
        <option value="deputy_axh">Заместитель по АХЧ</option>
        <option value="sysadmin">Системный администратор</option>
      </select>
      <input className="inp" name="title" placeholder="Заголовок" required/>
      <textarea className="txt" name="body" placeholder="Описание" required/>
      <button className="btn btn-primary" type="submit">Создать заявку</button>
    </form>
  );
}
