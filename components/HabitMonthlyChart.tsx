'use client';

import {
  Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useTheme } from './ThemeProvider';
import { seriesColor, tooltipStyle } from '@/lib/vizPalette';
import { MONTH_LABELS } from '@/lib/period';

/** 選択中の習慣の月別回数。1系列だけなので凡例は不要（タイトルが系列名を兼ねる）。 */
export default function HabitMonthlyChart({
  counts,
  goal,
  currentMonth,
  height = 200,
}: {
  counts: number[];        // 12ヶ月分
  goal?: number;
  currentMonth: number;    // 0-11。これより先の月はまだ来ていないので淡く描く
  height?: number;
}) {
  const { theme } = useTheme();
  const color = seriesColor(theme, 0);
  const data = counts.map((count, i) => ({ month: MONTH_LABELS[i], count, index: i }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: 'var(--border)', opacity: 0.3 }}
          {...tooltipStyle}
          formatter={(v) => [`${v} 回`, '実施']}
        />
        {goal ? (
          <ReferenceLine
            y={goal}
            stroke="var(--text-muted)"
            label={{ value: `目標 ${goal}回`, fill: 'var(--text-muted)', fontSize: 10, position: 'insideTopRight' }}
          />
        ) : null}
        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={28}>
          {data.map((d) => (
            // 未来の月は「データが無い」のであって「0回だった」ではないので薄く見せる
            <Cell key={d.index} fill={color} fillOpacity={d.index > currentMonth ? 0.25 : 1} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
