'use client';

import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { DailyNutrition } from '@/types';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';

export default function NutritionChart({
  data,
  calorieGoal = 2000,
  selectedDate,
  onSelectDay,
}: {
  data: DailyNutrition[];
  calorieGoal?: number;
  selectedDate?: string;
  onSelectDay?: (day: DailyNutrition) => void;
}) {
  const formatted = data.slice(-14).map((d) => ({
    ...d,
    label: format(parseISO(d.date), 'M/d', { locale: ja }),
  }));

  const handleClick = (entry: unknown) => {
    if (!onSelectDay) return;
    const e = entry as { date?: string; payload?: { date?: string } };
    const date = e?.payload?.date ?? e?.date;
    if (!date) return;
    const day = data.find((d) => d.date === date);
    if (day) onSelectDay(day);
  };

  return (
    <div className="rounded-2xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-sub)' }}>カロリー推移（直近14日）</h2>
        {onSelectDay && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>タップで詳細</span>}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={formatted} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
          <Tooltip
            cursor={{ fill: 'var(--border)', opacity: 0.3 }}
            contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)' }}
            formatter={(v) => [`${Math.round(Number(v))} kcal`, 'カロリー']}
          />
          <ReferenceLine y={calorieGoal} stroke="#f59e0b" strokeDasharray="4 4"
            label={{ value: `目標 ${calorieGoal}`, fill: '#f59e0b', fontSize: 10 }} />
          <Bar
            dataKey="totalCalories"
            name="カロリー"
            radius={[4, 4, 0, 0]}
            onClick={(d) => handleClick(d)}
            cursor={onSelectDay ? 'pointer' : undefined}
          >
            {formatted.map((entry) => (
              <Cell
                key={entry.date}
                fill={selectedDate === entry.date ? '#f59e0b' : '#6366f1'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
