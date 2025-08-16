'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { UniversalSearchInput } from '@/components/search/UniversalSearchInput';
import type { SearchItem } from '@/lib/search/types';

export default function GroupsSearchClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const currentTab = (sp.get('tab') === 'subject' ? 'subject' : 'group') as 'group' | 'subject';

  function onSelect(it: SearchItem) {
    const tab = it.kind === 'subject' ? 'subject' : 'group';
    const q = encodeURIComponent(`${it.kind}:${it.id}`);
    router.replace(`/groups?tab=${tab}&q=${q}`);
    // На следующем шаге подключу фактическую фильтрацию списков по q
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <UniversalSearchInput
        placeholder={currentTab === 'group' ? 'Поиск по группам…' : 'Поиск по предметам…'}
        onSelect={onSelect}
      />
    </div>
  );
}
