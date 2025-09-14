'use client';
import React from 'react';

type Props = {
  requestId: string;
  replyAction: (fd: FormData) => Promise<void>;
  closeAction?: (fd: FormData) => Promise<void>;
  reopenAction?: (fd: FormData) => Promise<void>;
};

export default function ReplyForm({ requestId, replyAction, closeAction, reopenAction }: Props) {
  return (
    <section className="reply-form">
      {/* строка: комментарий + отправить */}
      <form className="row row-comment" action={replyAction}>
        <input type="hidden" name="requestId" value={requestId} />
        <textarea className="txt comment" name="body" placeholder="Комментарий" required />
        <button className="btn btn-outline send" type="submit">Отправить</button>
      </form>

      {/* блок действий исполнителя */}
      {closeAction && (
        <div className="actions">
          <form className="inline" action={closeAction}>
            <input type="hidden" name="requestId" value={requestId} />
            <input type="hidden" name="action" value="done" />
            <button
              className="btn btn-success"
              type="submit"
              onClick={(e) => { if (!confirm('Выполнить заявку?')) e.preventDefault(); }}
            >
              Выполнить
            </button>
          </form>

          <form className="inline reject" action={closeAction}>
            <input type="hidden" name="requestId" value={requestId} />
            <input type="hidden" name="action" value="rejected" />
            <input className="inp reason" name="reason" placeholder="Причина отклонения" required />
            <button
              className="btn btn-danger"
              type="submit"
              onClick={(e) => { if (!confirm('Отклонить заявку?')) e.preventDefault(); }}
            >
              Отклонить
            </button>
          </form>
        </div>
      )}

      {/* кнопка переоткрытия для автора закрытой заявки */}
      {reopenAction && (
        <form className="reopen" action={reopenAction}>
          <input type="hidden" name="requestId" value={requestId} />
          <button className="btn btn-outline" type="submit">Возобновить</button>
        </form>
      )}
    </section>
  );
}
