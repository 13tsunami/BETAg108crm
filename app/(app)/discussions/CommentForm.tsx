'use client';

import { useFormStatus } from 'react-dom';

type Props = {
  postId: string;
  createAction: (fd: FormData) => Promise<void>;
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" type="submit" disabled={pending}>
      {pending ? 'Отправка…' : 'Отправить'}
    </button>
  );
}

export default function CommentForm({ postId, createAction }: Props) {
  return (
    <form className="disc-form" action={createAction}>
      <input type="hidden" name="postId" value={postId} />
      <textarea
        className="inp"
        name="text"
        rows={3}
        required
        maxLength={4000}
        placeholder="Напишите комментарий…"
      />
      <div className="actions">
        <Submit />
      </div>
    </form>
  );
}
