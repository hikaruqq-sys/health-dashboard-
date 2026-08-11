/** 年 / 四半期 / 月 の経過率。Notion に置いていた3本のプログレスバー相当。 */

export interface PeriodProgress {
  label: string;
  percent: number;   // 0-100
  elapsed: number;   // 経過日数
  total: number;     // 期間の総日数
  remaining: number; // 残り日数
}

const DAY = 86_400_000;

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY);
}

function build(label: string, start: Date, end: Date, now: Date): PeriodProgress {
  const total = daysBetween(start, end);
  const elapsed = Math.min(Math.max(daysBetween(start, now), 0), total);
  return {
    label,
    total,
    elapsed,
    remaining: total - elapsed,
    percent: total === 0 ? 0 : Math.round((elapsed / total) * 100),
  };
}

export function quarterOf(date: Date): 1 | 2 | 3 | 4 {
  return (Math.floor(date.getMonth() / 3) + 1) as 1 | 2 | 3 | 4;
}

export function periodProgress(now = new Date()): PeriodProgress[] {
  const y = now.getFullYear();
  const m = now.getMonth();
  const q = quarterOf(now);

  return [
    build('Year', new Date(y, 0, 1), new Date(y + 1, 0, 1), now),
    build(`Q${q}`, new Date(y, (q - 1) * 3, 1), new Date(y, q * 3, 1), now),
    build(`${m + 1}月`, new Date(y, m, 1), new Date(y, m + 1, 1), now),
  ];
}

/** その月の日数 */
export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export const MONTH_LABELS = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月',
];
