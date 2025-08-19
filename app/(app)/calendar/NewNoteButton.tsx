'use client';

export default function NewNoteButton() {
  function openNewNote() {
    const today = new Date();
    window.dispatchEvent(new CustomEvent('calendar:open-new-note', {
      detail: { atISO: today.toISOString(), allDay: true },
    }));
  }

  return (
    <button
      onClick={openNewNote}
      title="Создать новую заметку"
      style={{
        height: 32, padding: '0 12px', borderRadius: 10,
        border: '1px solid #e5e7eb', background: '#fff', color: '#111827',
        cursor: 'pointer', fontSize: 13,
      }}
    >
      Новая заметка
    </button>
  );
}
