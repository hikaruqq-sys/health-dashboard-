'use client';

import { useMemo, useState } from 'react';
import { useTheme } from './ThemeProvider';
import { heatLevel, heatRamp } from '@/lib/vizPalette';

const WEEKDAY_LABELS = ['', '月', '', '水', '', '金', ''];
const CELL = 11;
const GAP = 3;

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * GitHub の草と同じ形の年間ヒートマップ。
 * 週=列 / 曜日=行 で、1月1日を含む週の日曜から12月31日を含む週の土曜までを描く。
 */
export default function HabitHeatmap({
  days,
  year,
  unit = '回',
  title,
}: {
  days: Map<string, number>;
  year: number;
  unit?: string;
  title?: string;
}) {
  const { theme } = useTheme();
  const ramp = heatRamp(theme);
  const [picked, setPicked] = useState<{ date: string; value: number } | null>(null);

  const { weeks, monthTicks, max, total, activeDays } = useMemo(() => {
    const start = new Date(year, 0, 1);
    start.setDate(start.getDate() - start.getDay()); // 直前の日曜まで戻す
    const end = new Date(year, 11, 31);
    end.setDate(end.getDate() + (6 - end.getDay())); // 直後の土曜まで進める

    const weeks: (string | null)[][] = [];
    const monthTicks: { col: number; label: string }[] = [];
    let max = 0;
    let total = 0;
    let activeDays = 0;

    const cursor = new Date(start);
    let lastMonth = -1;
    while (cursor <= end) {
      const col: (string | null)[] = [];
      for (let d = 0; d < 7; d++) {
        // 対象年の外側はセルを描かない（空白にする）
        const key = cursor.getFullYear() === year ? iso(cursor) : null;
        if (key) {
          const v = days.get(key) ?? 0;
          if (v > max) max = v;
          if (v > 0) { total += v; activeDays++; }
          if (cursor.getDate() <= 7 && cursor.getMonth() !== lastMonth) {
            lastMonth = cursor.getMonth();
            monthTicks.push({ col: weeks.length, label: `${cursor.getMonth() + 1}月` });
          }
        }
        col.push(key);
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(col);
    }
    return { weeks, monthTicks, max, total, activeDays };
  }, [days, year]);

  const width = weeks.length * (CELL + GAP);

  return (
    <div className="flex flex-col gap-2">
      {title && (
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-sub)' }}>{title}</span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {activeDays}日実施 / 計{total}{unit}
          </span>
        </div>
      )}

      <div className="overflow-x-auto pb-1">
        <div style={{ width: width + 24 }}>
          {/* 月ラベル */}
          <div className="relative h-4" style={{ marginLeft: 24 }}>
            {monthTicks.map((t) => (
              <span
                key={t.label}
                className="absolute text-[10px]"
                style={{ left: t.col * (CELL + GAP), color: 'var(--text-muted)' }}
              >
                {t.label}
              </span>
            ))}
          </div>

          <div className="flex" style={{ gap: GAP }}>
            {/* 曜日ラベル */}
            <div className="flex flex-col flex-shrink-0" style={{ gap: GAP, width: 24 - GAP }}>
              {WEEKDAY_LABELS.map((w, i) => (
                <span
                  key={i}
                  className="text-[9px] leading-none flex items-center"
                  style={{ height: CELL, color: 'var(--text-muted)' }}
                >
                  {w}
                </span>
              ))}
            </div>

            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col" style={{ gap: GAP }}>
                {week.map((key, di) => {
                  if (!key) {
                    return <div key={di} style={{ width: CELL, height: CELL }} />;
                  }
                  const value = days.get(key) ?? 0;
                  const level = heatLevel(value, max);
                  const isPicked = picked?.date === key;
                  return (
                    <button
                      key={di}
                      onClick={() => setPicked({ date: key, value })}
                      title={`${key}: ${value}${unit}`}
                      aria-label={`${key} ${value}${unit}`}
                      style={{
                        width: CELL,
                        height: CELL,
                        borderRadius: 2,
                        background: ramp[level],
                        outline: isPicked ? '2px solid var(--accent)' : 'none',
                        outlineOffset: 1,
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 凡例 ＋ 選択した日の内訳 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {picked ? `${picked.date} — ${picked.value}${unit}` : 'セルをタップすると日付が出ます'}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>少</span>
          {ramp.map((c) => (
            <span key={c} style={{ width: CELL, height: CELL, borderRadius: 2, background: c }} />
          ))}
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>多</span>
        </div>
      </div>
    </div>
  );
}
