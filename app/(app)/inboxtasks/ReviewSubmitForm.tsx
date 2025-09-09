// app/(app)/inboxtasks/ReviewSubmitForm.tsx
import { submitForReviewAction } from './review-actions';

export default function ReviewSubmitForm({
  taskId,
  disabled,
}: {
  taskId: string;
  disabled?: boolean;
}) {
  return (
    <form
      action={submitForReviewAction}
      style={{ display: 'grid', gap: 8, alignItems: 'start', marginBottom: 8 }}
    >
      <input type="hidden" name="taskId" value={taskId} />

      <label style={{ fontSize: 13, color: '#374151' }}>
        Комментарий для проверяющего (опционально)
        <textarea
          name="comment"
          rows={2}
          placeholder="Коротко: что сделано, на что обратить внимание"
          style={{
            display: 'block',
            width: '100%',
            marginTop: 6,
            padding: '6px 8px',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            resize: 'vertical',
          }}
        />
      </label>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="file" name="files" multiple style={{ fontSize: 13 }} />
        <span style={{ fontSize: 12, color: '#6b7280' }}>до 25 MB, можно несколько</span>
      </div>

      <button
        type="submit"
        className="btnBrand"
        disabled={!!disabled}
        title={disabled ? 'Уже отправлено на проверку или принято' : 'Отправить на проверку'}
        style={{ justifySelf: 'start' }} // ключевая правка: ширина как у «Выполнить»
      >
        Отправить на проверку
      </button>
    </form>
  );
}
