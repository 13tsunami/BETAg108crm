'use client';

import { useRef } from 'react';

export default function SearchBox({ initialQuery }: { initialQuery: string }) {
  const formRef = useRef<HTMLFormElement | null>(null);

  return (
    <form ref={formRef} action="/chat" method="get">
      <input
        className="searchInput"
        name="q"
        defaultValue={initialQuery}
        placeholder="поиск: ФИО, e-mail, телефон"
      />
      <style jsx>{`
        .searchInput {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          outline: none;
          background:#fff;
        }
        .searchInput:focus {
          border-color:#c7e3ff;
          box-shadow: 0 0 0 4px rgba(59,130,246,.08);
        }
      `}</style>
    </form>
  );
}
