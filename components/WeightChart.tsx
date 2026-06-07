'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { BodyMetric } from '@/types';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';

export default function WeightChart({ data }: { data: BodyMetric[] }) {
  const formatted = data.map((d) => ({
    ...d,
    label: format(parseISO(d.date), 'M/d', { locale: ja }),
  }));
  const weights = data.map((d) => d.weight).filter(Boolean) as number[];
  const avg = weights.length ? weights.reduce((a, b) => a + b, 0) / weights.length : undefined;

  return (
    <div className="rounded-2xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <h2 className="text-sm font-semibold uppercase tracking-wide mb-4" style={{ color: 'var(--text-sub)' }}>体重推移</h2>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={formatted} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} domain={['dataMin - 1', 'dataMax + 1']} />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)' }}
            formatter={(v) => [`${v} kg`, '体重']}
          />
          {avg && (
            <ReferenceLine y={avg} stroke="var(--text-muted)" strokeDasharray="4 4"
              label={{ value: `平均 ${avg.toFixed(1)}`, fill: 'var(--text-muted)', fontSize: 10 }} />
          )}
          <Line type="monotone" dataKey="weight" stroke="#6366f1" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
