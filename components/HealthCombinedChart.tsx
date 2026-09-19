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
import { format, parseISO, addDays, differenceInDays } from 'date-fns';
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
type SmoothingMode = 'ma' | 'raw';
type PeriodFilter = 30 | 90 | 180 | 0; // 0 = 全期間

interface ChartDataPoint {
  date: string;
  label: string;
  // 実測値（記録した日のみ値が存在）
  weightRaw?: number;
  bodyFatRaw?: number;
  muscleMassRaw?: number;
  caloriesRaw?: number;
  // 移動平均 / 補間値（傾向把握用）
  weightMA?: number;
  bodyFatMA?: number;
  muscleMassMA?: number;
  caloriesMA?: number; // 7日移動平均
}

export default function HealthCombinedChart({
  metrics,
  nutrition,
  onSelectDate,
  calorieGoal = 2000,
}: HealthCombinedChartProps) {
  const { theme } = useTheme();
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [smoothing, setSmoothing] = useState<SmoothingMode>('ma'); // デフォルトで移動平均
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(90);

  // 日付順で体組成データと食事データを統合・移動平均を計算
  const chartData = useMemo(() => {
    if (metrics.length === 0 && nutrition.length === 0) return [];

    // 全ての日付を抽出して最小日・最大日を特定
    const allDates = [
      ...metrics.map((m) => m.date),
      ...nutrition.map((n) => n.date),
    ].filter(Boolean).sort();

    if (allDates.length === 0) return [];

    const minDateStr = allDates[0];
    const maxDateStr = allDates[allDates.length - 1];
    const minDate = parseISO(minDateStr);
    const maxDate = parseISO(maxDateStr);
    const dayCount = Math.min(differenceInDays(maxDate, minDate) + 1, 365); // 最大1年分

    // 日付ごとのマップを作成
    const metricsMap = new Map<string, BodyMetric>();
    metrics.forEach((m) => metricsMap.set(m.date, m));

    const nutritionMap = new Map<string, DailyNutrition>();
    nutrition.forEach((n) => nutritionMap.set(n.date, n));

    // 実測体重・体脂肪のリスト（線形補間用）
    const weightMeasurements: { date: string; time: number; val: number }[] = [];
    const fatMeasurements: { date: string; time: number; val: number }[] = [];
    const muscleMeasurements: { date: string; time: number; val: number }[] = [];

    // カレンダー日をすべて生成
    const dailyPoints: {
      date: string;
      time: number;
      label: string;
      weightRaw?: number;
      bodyFatRaw?: number;
      muscleMassRaw?: number;
      caloriesRaw?: number;
    }[] = [];

    for (let i = 0; i < dayCount; i++) {
      const cur = addDays(minDate, i);
      const dateStr = format(cur, 'yyyy-MM-dd');
      const time = cur.getTime();
      const label = format(cur, 'M/d', { locale: ja });

      const m = metricsMap.get(dateStr);
      const n = nutritionMap.get(dateStr);

      const w = m?.weight ?? undefined;
      const f = m?.bodyFat ?? undefined;
      const mm = m?.muscleMass ?? undefined;
      const c = n ? Math.round(n.totalCalories) : undefined;

      if (w != null) weightMeasurements.push({ date: dateStr, time, val: w });
      if (f != null) fatMeasurements.push({ date: dateStr, time, val: f });
      if (mm != null) muscleMeasurements.push({ date: dateStr, time, val: mm });

      dailyPoints.push({
        date: dateStr,
        time,
        label,
        weightRaw: w,
        bodyFatRaw: f,
        muscleMassRaw: mm,
        caloriesRaw: c,
      });
    }

    // 体重・体脂肪率の線形補間ヘルパー
    function interpolate(measurements: { time: number; val: number }[], time: number): number | undefined {
      if (measurements.length === 0) return undefined;
      if (measurements.length === 1) return measurements[0].val;

      // 範囲外チェック
      if (time <= measurements[0].time) return measurements[0].val;
      if (time >= measurements[measurements.length - 1].time) {
        return measurements[measurements.length - 1].val;
      }

      // 隣接する2点を見つけて補間
      for (let j = 0; j < measurements.length - 1; j++) {
        const p1 = measurements[j];
        const p2 = measurements[j + 1];
        if (time >= p1.time && time <= p2.time) {
          const ratio = (time - p1.time) / (p2.time - p1.time);
          return Number((p1.val + ratio * (p2.val - p1.val)).toFixed(1));
        }
      }
      return undefined;
    }

    // 補間値とカロリー7日移動平均を計算
    const fullList: ChartDataPoint[] = dailyPoints.map((pt, idx) => {
      // 1. 体組成の補間値（週1回の記録でも途切れない連続傾向線）
      const weightInterp = interpolate(weightMeasurements, pt.time);
      const fatInterp = interpolate(fatMeasurements, pt.time);
      const muscleInterp = interpolate(muscleMeasurements, pt.time);

      // 2. カロリーの7日移動平均（過去7日以内の記録を平均）
      let calSum = 0;
      let calCount = 0;
      const windowStart = Math.max(0, idx - 6);
      for (let k = windowStart; k <= idx; k++) {
        const c = dailyPoints[k].caloriesRaw;
        if (c != null && c > 0) {
          calSum += c;
          calCount++;
        }
      }
      const caloriesMA = calCount > 0 ? Math.round(calSum / calCount) : undefined;

      return {
        date: pt.date,
        label: pt.label,
        weightRaw: pt.weightRaw,
        bodyFatRaw: pt.bodyFatRaw,
        muscleMassRaw: pt.muscleMassRaw,
        caloriesRaw: pt.caloriesRaw,
        weightMA: weightInterp,
        bodyFatMA: fatInterp,
        muscleMassMA: muscleInterp,
        caloriesMA,
      };
    });

    // 期間フィルタの適用
    if (periodFilter > 0) {
      return fullList.slice(-periodFilter);
    }
    return fullList;
  }, [metrics, nutrition, periodFilter]);

  const hasWeight = chartData.some((d) => (smoothing === 'ma' ? d.weightMA : d.weightRaw) != null);
  const hasFat = chartData.some((d) => (smoothing === 'ma' ? d.bodyFatMA : d.bodyFatRaw) != null);
  const hasMuscle = chartData.some((d) => (smoothing === 'ma' ? d.muscleMassMA : d.muscleMassRaw) != null);
  const hasCalories = chartData.some((d) => (smoothing === 'ma' ? d.caloriesMA : d.caloriesRaw) != null);

  // 配色規則の遵守（lib/vizPalette.ts の順序）
  const weightColor = seriesColor(theme, 0); // blue (#2a78d6 / #3987e5)
  const bodyFatColor = seriesColor(theme, 1); // orange (#eb6834 / #d95926)
  const muscleColor = seriesColor(theme, 2); // green (#1baf7a / #199e70)
  const caloriesColor = seriesColor(theme, 3); // yellow (#eda100 / #c98500)

  const handleClick = (entry: any) => {
    if (!onSelectDate) return;
    const date = entry?.activePayload?.[0]?.payload?.date || entry?.payload?.date;
    if (date) onSelectDate(date);
  };

  return (
    <div
      className="rounded-2xl border p-4 sm:p-5 flex flex-col gap-3"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      {/* ヘッダー部 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm sm:text-base font-semibold uppercase tracking-wide" style={{ color: 'var(--text)' }}>
              📊 体重・体脂肪率 & 栄養推移
            </h2>
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-medium"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              {smoothing === 'ma' ? '移動平均' : '実測値'}
            </span>
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {smoothing === 'ma'
              ? '週1回の体重記録や日々の食事変動を平均値・傾向線で平滑化'
              : '記録された日ごとの実測データ'}
          </p>
        </div>

        {/* コントロール群 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 表示期間切替 */}
          <div className="flex gap-1 p-0.5 rounded-lg border" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}>
            {([
              { label: '1ヶ月', days: 30 },
              { label: '3ヶ月', days: 90 },
              { label: '全期間', days: 0 },
            ] as const).map((p) => (
              <button
                key={p.days}
                onClick={() => setPeriodFilter(p.days)}
                className="text-xs px-2 py-1 rounded-md font-medium transition-colors"
                style={{
                  background: periodFilter === p.days ? 'var(--accent)' : 'transparent',
                  color: periodFilter === p.days ? '#fff' : 'var(--text-sub)',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* 移動平均 vs 実測値切替 */}
          <div className="flex gap-1 p-0.5 rounded-lg border" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}>
            <button
              onClick={() => setSmoothing('ma')}
              title="週1回の体重や毎日のカロリーを移動平均・傾向線で表示"
              className="text-xs px-2.5 py-1 rounded-md font-medium transition-colors"
              style={{
                background: smoothing === 'ma' ? 'var(--accent)' : 'transparent',
                color: smoothing === 'ma' ? '#fff' : 'var(--text-sub)',
              }}
            >
              平均値
            </button>
            <button
              onClick={() => setSmoothing('raw')}
              title="記録日のみの生データを表示"
              className="text-xs px-2.5 py-1 rounded-md font-medium transition-colors"
              style={{
                background: smoothing === 'raw' ? 'var(--accent)' : 'transparent',
                color: smoothing === 'raw' ? '#fff' : 'var(--text-sub)',
              }}
            >
              実測値
            </button>
          </div>

          {/* 表示系列切替 */}
          <div className="flex gap-1 p-0.5 rounded-lg border" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}>
            <button
              onClick={() => setViewMode('all')}
              className="text-xs px-2 py-1 rounded-md font-medium transition-colors"
              style={{
                background: viewMode === 'all' ? 'var(--accent)' : 'transparent',
                color: viewMode === 'all' ? '#fff' : 'var(--text-sub)',
              }}
            >
              複合
            </button>
            <button
              onClick={() => setViewMode('body')}
              className="text-xs px-2 py-1 rounded-md font-medium transition-colors"
              style={{
                background: viewMode === 'body' ? 'var(--accent)' : 'transparent',
                color: viewMode === 'body' ? '#fff' : 'var(--text-sub)',
              }}
            >
              体組成
            </button>
            <button
              onClick={() => setViewMode('nutrition')}
              className="text-xs px-2 py-1 rounded-md font-medium transition-colors"
              style={{
                background: viewMode === 'nutrition' ? 'var(--accent)' : 'transparent',
                color: viewMode === 'nutrition' ? '#fff' : 'var(--text-sub)',
              }}
            >
              食事
            </button>
          </div>
        </div>
      </div>

      {/* グラフ領域（スマホでもしっかり見えるよう 380px に拡大） */}
      <div className="w-full h-[360px] sm:h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            syncId="health-sync"
            onClick={handleClick}
            margin={{ top: 12, right: hasFat ? 16 : 4, left: -14, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              interval="preserveStartEnd"
              minTickGap={24}
            />

            {/* 左 Y 軸: 体重 / 筋肉量 (kg) */}
            <YAxis
              yAxisId="weight"
              orientation="left"
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              domain={['dataMin - 0.8', 'dataMax + 0.8']}
              hide={viewMode === 'nutrition'}
              tickFormatter={(v) => `${v}k`}
            />

            {/* 右 Y 軸: 体脂肪率 (%) */}
            <YAxis
              yAxisId="bodyFat"
              orientation="right"
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              domain={['dataMin - 1', 'dataMax + 1']}
              hide={viewMode === 'nutrition' || !hasFat}
              tickFormatter={(v) => `${v}%`}
            />

            {/* 右第2 Y 軸: カロリー (kcal) */}
            <YAxis
              yAxisId="calories"
              orientation="right"
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              domain={[0, 'dataMax + 200']}
              hide={viewMode === 'body' || (viewMode === 'all' && hasFat)}
            />

            <Tooltip
              {...tooltipStyle}
              formatter={(value: any, name: any, item: any) => {
                if (value == null) return ['—', name];
                const p = item?.payload as ChartDataPoint;
                if (name === '体重 (平均)' || name === '体重') {
                  const rawInfo = p?.weightRaw != null ? ` (実測 ${p.weightRaw}kg)` : '';
                  return [`${value} kg${rawInfo}`, name];
                }
                if (name === '体脂肪率 (平均)' || name === '体脂肪率') {
                  const rawInfo = p?.bodyFatRaw != null ? ` (実測 ${p.bodyFatRaw}%)` : '';
                  return [`${value} %${rawInfo}`, name];
                }
                if (name === '筋肉量') {
                  return [`${value} kg`, name];
                }
                if (name === 'カロリー (7日平均)' || name === '摂取カロリー') {
                  const rawInfo = p?.caloriesRaw != null ? ` (当日 ${p.caloriesRaw}kcal)` : '';
                  return [`${value} kcal${rawInfo}`, name];
                }
                return [value, name];
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, color: 'var(--text-sub)', paddingTop: 8 }}
              verticalAlign="bottom"
            />

            {/* カロリー目標線 */}
            {(viewMode === 'all' || viewMode === 'nutrition') && calorieGoal && (
              <ReferenceLine
                yAxisId="calories"
                y={calorieGoal}
                stroke={caloriesColor}
                strokeDasharray="4 4"
                strokeOpacity={0.8}
                label={{
                  value: `目標 ${calorieGoal}kcal`,
                  fill: caloriesColor,
                  fontSize: 10,
                  position: 'insideTopLeft',
                }}
              />
            )}

            {/* カロリー（日別実績バー: 控えめな半透明バー） */}
            {(viewMode === 'all' || viewMode === 'nutrition') && (
              <Bar
                yAxisId="calories"
                dataKey="caloriesRaw"
                name={smoothing === 'ma' ? 'カロリー実績' : '摂取カロリー'}
                fill={caloriesColor}
                opacity={smoothing === 'ma' ? 0.2 : 0.6}
                radius={[3, 3, 0, 0]}
              />
            )}

            {/* カロリー 7日移動平均線（傾向をスムーズに表示） */}
            {(viewMode === 'all' || viewMode === 'nutrition') && smoothing === 'ma' && (
              <Line
                yAxisId="calories"
                type="monotone"
                dataKey="caloriesMA"
                name="カロリー (7日平均)"
                stroke={caloriesColor}
                strokeWidth={2.5}
                dot={false}
                connectNulls={true}
                activeDot={{ r: 4 }}
              />
            )}

            {/* 体重ライン */}
            {(viewMode === 'all' || viewMode === 'body') && hasWeight && (
              <Line
                yAxisId="weight"
                type="monotone"
                dataKey={smoothing === 'ma' ? 'weightMA' : 'weightRaw'}
                name={smoothing === 'ma' ? '体重 (平均)' : '体重'}
                stroke={weightColor}
                strokeWidth={3}
                connectNulls={true}
                dot={
                  smoothing === 'ma'
                    ? (props: any) => {
                        // 実測日のみ丸印を表示
                        const hasRaw = props.payload?.weightRaw != null;
                        if (!hasRaw) return <circle key={props.key} r={0} opacity={0} />;
                        return (
                          <circle
                            key={props.key}
                            cx={props.cx}
                            cy={props.cy}
                            r={4}
                            fill={weightColor}
                            stroke="#fff"
                            strokeWidth={1.5}
                          />
                        );
                      }
                    : { r: 3.5, fill: weightColor }
                }
                activeDot={{ r: 5 }}
              />
            )}

            {/* 体脂肪率ライン */}
            {(viewMode === 'all' || viewMode === 'body') && hasFat && (
              <Line
                yAxisId="bodyFat"
                type="monotone"
                dataKey={smoothing === 'ma' ? 'bodyFatMA' : 'bodyFatRaw'}
                name={smoothing === 'ma' ? '体脂肪率 (平均)' : '体脂肪率'}
                stroke={bodyFatColor}
                strokeWidth={2.5}
                connectNulls={true}
                dot={
                  smoothing === 'ma'
                    ? (props: any) => {
                        // 実測日のみ丸印を表示
                        const hasRaw = props.payload?.bodyFatRaw != null;
                        if (!hasRaw) return <circle key={props.key} r={0} opacity={0} />;
                        return (
                          <circle
                            key={props.key}
                            cx={props.cx}
                            cy={props.cy}
                            r={3.5}
                            fill={bodyFatColor}
                            stroke="#fff"
                            strokeWidth={1.5}
                          />
                        );
                      }
                    : { r: 3, fill: bodyFatColor }
                }
                activeDot={{ r: 4 }}
              />
            )}

            {/* 筋肉量ライン（体組成モード時） */}
            {viewMode === 'body' && hasMuscle && (
              <Line
                yAxisId="weight"
                type="monotone"
                dataKey={smoothing === 'ma' ? 'muscleMassMA' : 'muscleMassRaw'}
                name="筋肉量"
                stroke={muscleColor}
                strokeWidth={2}
                strokeDasharray="3 3"
                connectNulls={true}
                dot={false}
                activeDot={{ r: 3.5 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
