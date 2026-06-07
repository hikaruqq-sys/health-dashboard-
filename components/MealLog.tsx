'use client';

import { DailyNutrition, MealEntry } from '@/types';

const MEAL_LABELS: Record<MealEntry['mealType'], string> = {
  breakfast: '朝食', lunch: '昼食', dinner: '夕食', snack: '間食',
};
const MEAL_COLORS: Record<MealEntry['mealType'], { bg: string; text: string }> = {
  breakfast: { bg: '#fef3c7', text: '#d97706' },
  lunch: { bg: '#e0f2fe', text: '#0284c7' },
  dinner: { bg: '#ede9fe', text: '#7c3aed' },
  snack: { bg: '#fce7f3', text: '#db2777' },
};

export default function MealLog({ day }: { day: DailyNutrition }) {
  const grouped = (['breakfast', 'lunch', 'dinner', 'snack'] as MealEntry['mealType'][])
    .map((type) => ({ type, items: day.meals.filter((m) => m.mealType === type) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="rounded-2xl border p-5 flex flex-col gap-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-sub)' }}>食事記録</h2>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{day.date}</span>
      </div>
      {grouped.map(({ type, items }) => (
        <div key={type}>
          <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-2"
            style={{ background: MEAL_COLORS[type].bg, color: MEAL_COLORS[type].text }}>
            {MEAL_LABELS[type]}
          </span>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: 'var(--text-muted)' }}>
                <th className="text-left pb-1 font-normal">食品</th>
                <th className="text-right pb-1 font-normal">kcal</th>
                <th className="text-right pb-1 font-normal">P</th>
                <th className="text-right pb-1 font-normal">F</th>
                <th className="text-right pb-1 font-normal">C</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="py-1" style={{ color: 'var(--text)' }}>{item.foodName}</td>
                  <td className="text-right" style={{ color: 'var(--text-sub)' }}>{Math.round(item.calories)}</td>
                  <td className="text-right text-emerald-500">{item.protein}g</td>
                  <td className="text-right text-rose-400">{item.fat}g</td>
                  <td className="text-right text-amber-400">{item.carbs}g</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <div className="flex gap-4 text-xs pt-2 border-t" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
        <span>合計 <strong style={{ color: 'var(--text)' }}>{Math.round(day.totalCalories)} kcal</strong></span>
        <span>P <strong className="text-emerald-500">{day.totalProtein.toFixed(1)}g</strong></span>
        <span>F <strong className="text-rose-400">{day.totalFat.toFixed(1)}g</strong></span>
        <span>C <strong className="text-amber-400">{day.totalCarbs.toFixed(1)}g</strong></span>
      </div>
    </div>
  );
}
