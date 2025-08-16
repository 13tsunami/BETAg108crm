/* lib/search/types.ts */
export type SearchKind = 'user' | 'group' | 'subject' | 'role';

export type SearchItem = {
  id: string;
  kind: SearchKind;
  label: string;     // основная строка показа
  hint?: string;     // вторичная строка
  q: string;         // нормализованная строка для быстрых фильтров
};

export type IndexOptions = {
  kinds: ReadonlyArray<SearchKind>;
  limitPerKind?: number;
};
