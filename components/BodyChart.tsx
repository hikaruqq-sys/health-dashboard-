'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { BodyMetric } from '@/types';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';

export default function BodyChart({ data }: { data: BodyMetric[] }) {
  const formatted = data.map((d) => ({
    ...d,
    label: format(parseISO(d.date), 'M/d', { locale: ja }),
  }));

  return (
    <div className="rounded-2xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <h2 className="text-sm font-semibold uppercase tracking-wide mb-4" style={{ color: 'var(--text-sub)' }}>体脂肪率 / 筋肉量</h2>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={formatted} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
          <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)' }} />
          <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-sub)' }} />
          <Line type="monotone" dataKey="bodyFat" name="体脂肪率 (%)" stroke="#f43f5e" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey="muscleMass" name="筋肉量 (kg)" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
