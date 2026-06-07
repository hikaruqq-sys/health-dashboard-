'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { DailyNutrition } from '@/types';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';

export default function NutritionChart({ data, calorieGoal = 2000 }: { data: DailyNutrition[]; calorieGoal?: number }) {
  const formatted = data.slice(-14).map((d) => ({
    ...d,
    label: format(parseISO(d.date), 'M/d', { locale: ja }),
  }));

  return (
    <div className="rounded-2xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <h2 className="text-sm font-semibold uppercase tracking-wide mb-4" style={{ color: 'var(--text-sub)' }}>カロリー推移（直近14日）</h2>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={formatted} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)' }}
            formatter={(v) => [`${Math.round(Number(v))} kcal`, 'カロリー']}
          />
          <ReferenceLine y={calorieGoal} stroke="#f59e0b" strokeDasharray="4 4"
            label={{ value: `目標 ${calorieGoal}`, fill: '#f59e0b', fontSize: 10 }} />
          <Bar dataKey="totalCalories" name="カロリー" fill="#6366f1" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
