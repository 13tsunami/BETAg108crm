// app/api/tasks/_store.ts
export type Task = {
  id: string;
  by: string;
  title: string;
  description?: string;
  due: string;      // YYYY-MM-DD
  tags: string[];
  createdAt: string;
};

// единое хранилище на модуль (демо)
export const tasks: Task[] = [
  {
    id: crypto.randomUUID(),
    by: "Евжик И.С.",
    title: "Подготовить анкету профориентации",
    description: "Короткая анкета на 10 вопросов для 9-х классов.",
    due: "2025-05-25",
    tags: ["опрос", "групповой"],
    createdAt: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    by: "Майоров И.П.",
    title: "Обновить базу педагогов",
    description: "Сверить телефоны и кабинеты, выгрузить в XLSX.",
    due: "2025-05-27",
    tags: ["админ"],
    createdAt: new Date().toISOString(),
  },
];
