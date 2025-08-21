/** Точка для линейного графика «создано / выполнено» */
export interface DayPoint {
  d: string;       // YYYY-MM-DD
  created: number;
  done: number;
}

/** Срез задач «сегодня / просрочено / ожидает» */
export interface TodaySlice {
  today: number;
  overdue: number;
  upcoming: number;
}

/** Структура приоритетов */
export interface Priorities {
  high: number;
  normal: number;
}

/** Нагрузка по дням недели */
export interface WeekdayLoad {
  /** День недели (0 = пн, 6 = вс) */
  dow: number;
  /** Количество задач */
  count: number;
}

/** Совокупная аналитика для дашборда */
export interface Analytics {
  createdDone: DayPoint[];
  priorities: Priorities;
  today: TodaySlice;
  weekday: WeekdayLoad[];
}
