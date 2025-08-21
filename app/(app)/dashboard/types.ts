// Типы строго под текущее ТЗ

export type DayPoint = {
  d: string;        // YYYY-MM-DD (в целевой TZ)
  created: number;  // сколько задач я создал в этот день
  done: number;     // сколько задач я выполнил в этот день
};

export type TodaySlice = {
  today: number;    // мои активные задачи на сегодня
  overdue: number;  // мои активные просроченные
  upcoming: number; // мои активные в будущем
};

export type WeekdayItem = {
  dow: number;      // 0..6 (пн..вс)
  count: number;    // количество моих активных задач на этот день недели
};

export type WeekdayLoad = WeekdayItem[];

export type Analytics = {
  createdDone: DayPoint[]; // линия «создано/выполнено» по дням
  today: TodaySlice;       // срез «сегодня/просрочено/ожидает»
  weekday: WeekdayLoad;    // нагрузка по дням недели
};
