'use client';

import { ReactNode, useState } from 'react';

export default function Tooltip({
  children,
  content,
}: {
  children: ReactNode;
  content: ReactNode;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <span
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%) translateY(-8px)',
            background: 'rgba(255,255,255,.9)',
            backdropFilter: 'saturate(180%) blur(10px)',
            WebkitBackdropFilter: 'saturate(180%) blur(10px)',
            border: '1px solid rgba(229,231,235,.9)',
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 13,
            color: '#111827',
            whiteSpace: 'nowrap',
            boxShadow: '0 6px 20px rgba(0,0,0,.12)',
            zIndex: 100,
          }}
        >
          {content}
        </div>
      )}
    </span>
  );
}
