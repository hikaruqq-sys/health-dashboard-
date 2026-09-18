'use client';

import { useState, useMemo } from 'react';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { BodyMetric, DailyNutrition } from '@/types';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { useTheme } from './ThemeProvider';
import { seriesColor, tooltipStyle } from '@/lib/vizPalette';

export interface HealthCombinedChartProps {
  metrics: BodyMetric[];
  nutrition: DailyNutrition[];
  onSelectDate?: (date: string) => void;
  calorieGoal?: number;
}

type ViewMode = 'all' | 'body' | 'nutrition';

export default function HealthCombinedChart({
  metrics,
  nutrition,
  onSelectDate,
  calorieGoal = 2000,
}: HealthCombinedChartProps) {
  const { theme } = useTheme();
  const [viewMode, setViewMode] = useState<ViewMode>('all');

  // 日付順で体組成データと食事データを統合する
  const chartData = useMemo(() => {
    const map = new Map<string, {
      date: string;
      label: string;
      weight?: number;
      bodyFat?: number;
      muscleMass?: number;
      calories?: number;
      protein?: number;
      fat?: number;
      carbs?: number;
    }>();

    // 体組成データを投入
    metrics.forEach((m) => {
      let label = m.date;
      try {
        label = format(parseISO(m.date), 'M/d', { locale: ja });
      } catch {
        // fallback to raw date
      }
      map.set(m.date, {
        date: m.date,
        label,
        weight: m.weight ?? undefined,
        bodyFat: m.bodyFat ?? undefined,
        muscleMass: m.muscleMass ?? undefined,
      });
    });

    // 食事データを統合
    nutrition.forEach((n) => {
      let label = n.date;
      try {
        label = format(parseISO(n.date), 'M/d', { locale: ja });
      } catch {
        // fallback
      }
      const existing = map.get(n.date) ?? { date: n.date, label };
      map.set(n.date, {
        ...existing,
        calories: Math.round(n.totalCalories),
        protein: Math.round(n.totalProtein),
        fat: Math.round(n.totalFat),
        carbs: Math.round(n.totalCarbs),
      });
    });

    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [metrics, nutrition]);

  const hasWeight = chartData.some((d) => d.weight != null);
  const hasFat = chartData.some((d) => d.bodyFat != null);
  const hasMuscle = chartData.some((d) => d.muscleMass != null);
  const hasCalories = chartData.some((d) => d.calories != null);

  const weightColor = seriesColor(theme, 0); // #2a78d6 / #3987e5 (blue)
  const bodyFatColor = seriesColor(theme, 1); // #eb6834 / #d95926 (orange)
  const muscleColor = seriesColor(theme, 2); // #1baf7a / #199e70 (aqua/green)
  const caloriesColor = seriesColor(theme, 3); // #eda100 / #c98500 (yellow/amber)

  const handleClick = (entry: any) => {
    if (!onSelectDate) return;
    const date = entry?.activePayload?.[0]?.payload?.date || entry?.payload?.date;
    if (date) onSelectDate(date);
  };

  return (
    <div
      className="rounded-2xl border p-5 flex flex-col gap-3"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-sub)' }}>
            📊 体重・体脂肪率 & 栄養推移
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            体重 (kg) と体脂肪率 (%)、摂取カロリー (kcal) の同時トレンド
          </p>
        </div>

        {/* View Mode Toggle */}
        <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'var(--bg-card2)' }}>
          <button
            onClick={() => setViewMode('all')}
            className="text-xs px-2.5 py-1 rounded-md font-medium transition-colors"
            style={{
              background: viewMode === 'all' ? 'var(--accent)' : 'transparent',
              color: viewMode === 'all' ? '#fff' : 'var(--text-sub)',
            }}
          >
            複合表示
          </button>
          <button
            onClick={() => setViewMode('body')}
            className="text-xs px-2.5 py-1 rounded-md font-medium transition-colors"
            style={{
              background: viewMode === 'body' ? 'var(--accent)' : 'transparent',
              color: viewMode === 'body' ? '#fff' : 'var(--text-sub)',
            }}
          >
            体組成のみ
          </button>
          <button
            onClick={() => setViewMode('nutrition')}
            className="text-xs px-2.5 py-1 rounded-md font-medium transition-colors"
            style={{
              background: viewMode === 'nutrition' ? 'var(--accent)' : 'transparent',
              color: viewMode === 'nutrition' ? '#fff' : 'var(--text-sub)',
            }}
          >
            カロリーのみ
          </button>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart
          data={chartData}
          syncId="health-sync"
          onClick={handleClick}
          margin={{ top: 8, right: hasFat || hasCalories ? 12 : -10, left: -16, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} interval="preserveStartEnd" />

          {/* 左 Y 軸: 体重 / 筋肉量 (kg) */}
          <YAxis
            yAxisId="weight"
            orientation="left"
            tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
            domain={['dataMin - 1', 'dataMax + 1']}
            hide={viewMode === 'nutrition'}
          />

          {/* 右 Y 軸: 体脂肪率 (%) */}
          <YAxis
            yAxisId="bodyFat"
            orientation="right"
            tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
            domain={['dataMin - 1', 'dataMax + 1']}
            hide={viewMode === 'nutrition' || !hasFat}
          />

          {/* 右第2 Y 軸: カロリー (kcal) */}
          <YAxis
            yAxisId="calories"
            orientation="right"
            tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
            domain={[0, 'dataMax + 300']}
            hide={viewMode === 'body' || (viewMode === 'all' && hasFat) /* 軸の重なりを防ぐため複合時はツールチップ参照 */}
          />

          <Tooltip
            {...tooltipStyle}
            formatter={(value: any, name: any) => {
              if (value == null) return ['—', name];
              if (name === '体重') return [`${value} kg`, name];
              if (name === '体脂肪率') return [`${value} %`, name];
              if (name === '筋肉量') return [`${value} kg`, name];
              if (name === '摂取カロリー') return [`${value} kcal`, name];
              return [value, name];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-sub)', paddingTop: 4 }} />

          {/* カロリー目標線 */}
          {(viewMode === 'all' || viewMode === 'nutrition') && hasCalories && calorieGoal && (
            <ReferenceLine
              yAxisId="calories"
              y={calorieGoal}
              stroke={caloriesColor}
              strokeDasharray="4 4"
              label={{ value: `目標 ${calorieGoal}kcal`, fill: caloriesColor, fontSize: 9, position: 'insideTopLeft' }}
            />
          )}

          {/* 背景要素: カロリー推移 (バー) */}
          {(viewMode === 'all' || viewMode === 'nutrition') && hasCalories && (
            <Bar
              yAxisId="calories"
              dataKey="calories"
              name="摂取カロリー"
              fill={caloriesColor}
              opacity={viewMode === 'all' ? 0.25 : 0.75}
              radius={[3, 3, 0, 0]}
            />
          )}

          {/* 前景要素: 体重 (折れ線) */}
          {(viewMode === 'all' || viewMode === 'body') && hasWeight && (
            <Line
              yAxisId="weight"
              type="monotone"
              dataKey="weight"
              name="体重"
              stroke={weightColor}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
            />
          )}

          {/* 前景要素: 体脂肪率 (折れ線) */}
          {(viewMode === 'all' || viewMode === 'body') && hasFat && (
            <Line
              yAxisId="bodyFat"
              type="monotone"
              dataKey="bodyFat"
              name="体脂肪率"
              stroke={bodyFatColor}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          )}

          {/* オプション: 筋肉量 (折れ線) */}
          {viewMode === 'body' && hasMuscle && (
            <Line
              yAxisId="weight"
              type="monotone"
              dataKey="muscleMass"
              name="筋肉量"
              stroke={muscleColor}
              strokeWidth={1.5}
              strokeDasharray="3 3"
              dot={false}
              activeDot={{ r: 3 }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
