// app/(app)/dashboard/types.ts

// Общие серверные типы KPI
export type SeriesPoint = { day: string; created: number; done: number };

export type TodayStats = {
  totalAssigned: number;
  dueToday: number;
  overdue: number;
  completedToday: number;
};

export type WeekdayItem = { weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7; count: number };

export type RequestsSla = { open: number; done24h: number; medianHours: number };

export type Analytics = {
  createdVsDone: SeriesPoint[];
  today: TodayStats;
  loadByWeekday: WeekdayItem[];
  pendingForReview: number;
  requestsSla: RequestsSla;
};

// Типы для клиентских графиков (то, что ждут компоненты)
export type DayPoint = { d: string; created: number; done: number };
export type TodaySlice = { today: number; overdue: number; upcoming: number };

// Для баров по дням недели в клиенте удобнее явный массив
export type WeekdayBar = { dow: 1 | 2 | 3 | 4 | 5 | 6 | 7; count: number };

// Алиас для удобного импорта в charts.tsx
export type WeekdayLoad = WeekdayBar[];
// ▼ Добавьте в конец файла
export type Scope = 'me' | 'all';
export type TabKey = 'live' | 'weekly';

export type WeeklyPoint = { day: string; done: number; late: number };

export type WeeklyReport = {
  doneCount7d: number;
  lateRate7d: number;           // 0..1
  avgHoursToComplete7d: number; // часы, 1 знак
  seriesDone7d: { day: string; done: number }[];
  seriesLate7d: { day: string; late: number }[];
};
