'use client';

import { useState } from 'react';

export default function SearchBox() {
  const [q, setQ] = useState('');

  return (
    <input
      type="text"
      value={q}
      onChange={(e) => setQ(e.target.value)}
      placeholder="Поиск по ФИО…"
      style={{
        width: '100%',
        border: '1px solid #e5e7eb',
        borderRadius: 999,
        padding: '6px 12px',
        fontSize: 13,
      }}
    />
  );
}
