//'use client'
'use client';
import { useEffect, useState } from 'react';

export default function UnreadBadgeClient({ initial }: { initial: number }) {
  const [n, setN] = useState(initial);

  useEffect(() => {
    const onBump = () => setN(x => x + 1);
    window.addEventListener('app:unread-bump', onBump as any);
    return () => window.removeEventListener('app:unread-bump', onBump as any);
  }, []);

  return (
    <span style={{
      display:'inline-block', fontSize:12, padding:'3px 8px', borderRadius:9999,
      background:'#f3f4f6', border:'1px solid rgba(229,231,235,.85)', marginLeft:8
    }}>
      {n}
    </span>
  );
}
