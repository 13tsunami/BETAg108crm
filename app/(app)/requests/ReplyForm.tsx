'use client';

import { useFormStatus } from 'react-dom';

type Props = {
  requestId: string;
  replyAction: (fd: FormData) => Promise<void>;
  takeAction?: (fd: FormData) => Promise<void>;
  closeAction?: (fd: FormData) => Promise<void>;
  canProcess: boolean;
};

function SubmitBtn({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" type="submit" disabled={pending}>
      {pending ? 'Отправка…' : children}
    </button>
  );
}

function ReplyFormInner({
  requestId,
  replyAction,
  takeAction,
  closeAction,
  canProcess,
}: Props) {
  return (
    <div className="reply-wrap">
      <form className="reply-form" action={replyAction}>
        <input type="hidden" name="requestId" value={requestId} />
        <textarea className="inp" name="body" rows={3} placeholder="Ответ..." required />
        <div className="actions">
          <SubmitBtn>Отправить</SubmitBtn>
        </div>
      </form>

      {canProcess && takeAction ? (
        <form className="inline-form" action={takeAction}>
          <input type="hidden" name="requestId" value={requestId} />
          <button className="btn-outline" type="submit">Взять в работу</button>
        </form>
      ) : null}

      {canProcess && closeAction ? (
        <div className="close-forms">
          <form className="inline-form" action={closeAction}>
            <input type="hidden" name="requestId" value={requestId} />
            <input type="hidden" name="action" value="done" />
            <button className="btn-success" type="submit">Закрыть</button>
          </form>

          <form className="inline-form" action={closeAction}>
            <input type="hidden" name="requestId" value={requestId} />
            <input type="hidden" name="action" value="rejected" />
            <input className="inp reason" type="text" name="reason" placeholder="Причина отклонения" />
            <button className="btn-danger" type="submit">Отклонить</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export default function ReplyForm(props: Props) {
  return <ReplyFormInner {...props} />;
}
