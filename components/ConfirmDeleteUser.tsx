// components/ConfirmDeleteUser.tsx
'use client';

import React from 'react';
import Modal from './Modal';

/**
 * ConfirmDeleteUser — в стиле Liquid Glass iOS-26 (light-only).
 * Кнопки и карточка модалки выполнены «стеклом» с мягкими тенями.
 */
export default function ConfirmDeleteUser({
  userId,
  userName,
  action,
}: {
  userId: string;
  userName: string;
  action: (fd: FormData) => Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      {/* Триггер удаления (призрачная опасная) */}
      <button
        type="button"
        className="btn btnDangerGhost"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open ? 'true' : 'false'}
      >
        удалить
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Удаление пользователя"
        width={560}
      >
        <div className="sheet">
          <p className="text">
            Вы точно хотите удалить&nbsp;
            <b className="brand">«{userName}»</b>? Это безвозвратно удалит связанные объекты:
            сообщения, треды, отметки о прочтении, назначения в задачах и членство в группах.
          </p>

          <div className="actions">
            <button
              type="button"
              className="btn btnGhost"
              onClick={() => setOpen(false)}
            >
              отмена
            </button>

            <form action={action} onSubmit={() => setOpen(false)}>
              <input type="hidden" name="id" value={userId} />
              <button
                type="submit"
                className="btn btnDangerSolid"
              >
                удалить безвозвратно
              </button>
            </form>
          </div>
        </div>
      </Modal>

      <style jsx>{`
        /* Токены в локальном скоупе компонента */
        :root {
          --brand: #8d2828;
          --danger: #b91c1c;
          --danger-border: rgba(185, 28, 28, 0.85);
          --ink: #0f172a;
          --muted: #6b7280;
          --stroke: rgba(229,231,235,0.9);

          --glass-bg: linear-gradient(180deg, rgba(255,255,255,0.74), rgba(255,255,255,0.5));
          --glass-border: 1px solid rgba(141,40,40,0.20);
          --glass-blur: 10px;
          --glass-shadow: 0 10px 30px rgba(17,24,39,0.10);
          --glass-inset: inset 0 1px 0 rgba(255,255,255,0.45);
          --focus: 0 0 0 3px rgba(141,40,40,0.18);
        }

        /* Контент модалки — стеклянная карточка */
        .sheet {
          border-radius: 16px;
          background: var(--glass-bg);
          -webkit-backdrop-filter: saturate(180%) blur(var(--glass-blur));
          backdrop-filter: saturate(180%) blur(var(--glass-blur));
          border: var(--glass-border);
          box-shadow: var(--glass-shadow), var(--glass-inset);
          padding: 14px 14px 12px;
        }

        .text {
          margin: 0 0 10px;
          color: var(--ink);
          line-height: 1.45;
        }
        .brand { color: var(--brand); }

        .actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 8px;
        }

        /* Кнопки */
        .btn {
          appearance: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          height: 36px;
          padding: 0 14px;
          border-radius: 12px;
          font-weight: 800;
          font-size: 14px;
          letter-spacing: .2px;
          cursor: pointer;
          user-select: none;
          transition:
            transform .08s ease,
            filter .15s ease,
            box-shadow .15s ease,
            background .15s ease,
            border-color .15s ease,
            color .15s ease;
          border: 1px solid transparent;
        }
        .btn:disabled { opacity: .65; cursor: default; transform: none; box-shadow: none; }

        /* Светлая «призрачная» общая */
        .btnGhost {
          color: #111827;
          background: var(--glass-bg);
          -webkit-backdrop-filter: blur(var(--glass-blur));
          backdrop-filter: blur(var(--glass-blur));
          border: 1px solid var(--stroke);
          box-shadow: 0 6px 16px rgba(17,24,39,0.08), inset 0 1px 0 rgba(255,255,255,0.35);
        }
        .btnGhost:hover { transform: translateY(-1px); box-shadow: 0 10px 18px rgba(17,24,39,0.12); }
        .btnGhost:active { transform: translateY(0); }

        /* Опасная «призрачная» (красный текст) — триггер */
        .btnDangerGhost {
          height: 32px;
          padding: 0 12px;
          border-radius: 10px;
          color: var(--danger);
          background: linear-gradient(180deg, rgba(255,255,255,0.9), rgba(255,255,255,0.7));
          border: 1px solid rgba(239, 68, 68, 0.45);
          box-shadow: 0 4px 12px rgba(239,68,68,0.12), inset 0 1px 0 rgba(255,255,255,0.6);
        }
        .btnDangerGhost:hover { transform: translateY(-1px); filter: brightness(.98); }
        .btnDangerGhost:focus-visible { outline: none; box-shadow: var(--focus); }

        /* Опасная основная — красная сплошная */
        .btnDangerSolid {
          color: #fa0707ff;
          background: var(--danger);
          border-color: var(--danger-border);
          box-shadow: 0 6px 14px rgba(185, 28, 28, 0.25);
        }
        .btnDangerSolid:hover { transform: translateY(-1px); box-shadow: 0 10px 18px rgba(185, 28, 28, 0.28); }
        .btnDangerSolid:active { transform: translateY(0); box-shadow: 0 6px 14px rgba(185, 28, 28, 0.25); }
        .btnDangerSolid:focus-visible { outline: none; box-shadow: var(--focus), 0 6px 14px rgba(185,28,28,0.25); }

        @media (max-width: 520px) {
          .btn { height: 34px; padding: 0 12px; border-radius: 10px; font-size: 13px; }
          .btnDangerGhost { height: 30px; padding: 0 10px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .btn { transition: none; }
        }
      `}</style>
    </>
  );
}
