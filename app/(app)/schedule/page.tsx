// app/schedule/page.tsx
'use client';

export default function SchedulePage() {
  return (
    <div className="h-full flex flex-col">
      {/* Заголовок */}
      <div className="glass card relief p-4 mb-2">
        <h2 className="text-lg font-medium">Расписание</h2>
      </div>
      
      {/* Контейнер для таблицы */}
      <div className="glass card relief flex-1 overflow-hidden p-0 relative">
        {/* Стеклянный эффект поверх таблицы */}
        <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-white/80 to-transparent pointer-events-none z-10"></div>
        
        {/* Таблица Google Sheets */}
        <iframe
          src="https://docs.google.com/spreadsheets/d/e/2PACX-1vRmZ3QHNTCrTrP6YoBTPQ7EOnGof3pwIcMH1Xm6FUh3rMwu7H5-TlSa2iAmwuRj0aIIL1fugq6dp3hA/pubhtml?widget=true&amp;headers=false&amp;chrome=false"
          className="absolute inset-0 w-full h-full border-0"
          allowFullScreen
        />
      </div>
    </div>
  );
}