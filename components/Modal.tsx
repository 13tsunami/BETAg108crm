'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function Modal({
  open, onClose, title, width = 780, children,
}: { open: boolean; onClose: () => void; title?: string; width?: number; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!open || !mounted) return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,.44)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 12,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width, maxWidth: '96vw',
          borderRadius: 18,
          border: '1px solid rgba(229,231,235,.85)',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.68), rgba(255,255,255,0.42))',
          backdropFilter: 'saturate(180%) blur(14px)',
          WebkitBackdropFilter: 'saturate(180%) blur(14px)',
          boxShadow: '0 18px 48px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.35)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(229,231,235,.9)' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#0f172a', flex: 1 }}>{title}</h3>
            <button
              onClick={onClose}
              aria-label="Закрыть"
              style={{
                height: 36, width: 36, borderRadius: 12,
                border: '1px solid rgba(229,231,235,.9)', background: '#fff', cursor: 'pointer'
              }}
            >×</button>
          </div>
        </div>
        <div style={{ padding: 16 }}>{children}</div>
      </div>
    </div>,
    document.body
  );
}
