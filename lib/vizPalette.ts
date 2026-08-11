/**
 * グラフ用のカラーパレット。
 *
 * 8色のカテゴリカル配列は、このアプリの実際のカード面（light #ffffff / dark #1e293b）に対して
 * 明度帯・彩度下限・色覚多様性(CVD)の隣接分離・通常視力の分離・コントラストを検証済み。
 * 並び順そのものが CVD 安全性の担保なので、**入れ替えたり9色目を足したりしないこと**。
 * 9系列以上になる場合は「その他」にまとめるか、スモールマルチプル（1系列ずつのグラフ）にする。
 *
 * light モードでは aqua と yellow がカード面に対して 3:1 未満なので、
 * それらを使うグラフには必ず直接ラベルか表形式の代替表示を併置する。
 */

export const SERIES_LIGHT = [
  '#2a78d6', // 1 blue
  '#eb6834', // 2 orange
  '#1baf7a', // 3 aqua
  '#eda100', // 4 yellow
  '#e87ba4', // 5 magenta
  '#008300', // 6 green
  '#4a3aa7', // 7 violet
  '#e34948', // 8 red
] as const;

export const SERIES_DARK = [
  '#3987e5', '#d95926', '#199e70', '#c98500',
  '#d55181', '#008300', '#9085e9', '#e66767',
] as const;

export function seriesColors(theme: 'light' | 'dark'): readonly string[] {
  return theme === 'dark' ? SERIES_DARK : SERIES_LIGHT;
}

export function seriesColor(theme: 'light' | 'dark', index: number): string {
  const colors = seriesColors(theme);
  return colors[index % colors.length];
}

/** 状態色（達成/未達成など）。系列色とは用途を分けて、必ずラベルや記号と併用する。 */
export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const;

/**
 * ヒートマップ用の単一色ランプ（薄い→濃い = 少ない→多い）。
 * dark モードは面が暗いので、濃さの向きを反転させて「多い＝明るい」にする。
 */
export const HEAT_LIGHT = ['#eceff3', '#cde2fb', '#9ec5f4', '#5598e7', '#2a78d6'] as const;
export const HEAT_DARK = ['#25303f', '#184f95', '#256abf', '#3987e5', '#86b6ef'] as const;

export function heatRamp(theme: 'light' | 'dark'): readonly string[] {
  return theme === 'dark' ? HEAT_DARK : HEAT_LIGHT;
}

/** 0 は必ずレベル0。1以上を max に応じて 1..4 に割り当てる。 */
export function heatLevel(value: number, max: number): number {
  if (value <= 0) return 0;
  if (max <= 1) return 4;
  const ratio = value / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

/** Recharts のツールチップに共通で渡すスタイル */
export const tooltipStyle = {
  contentStyle: {
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'var(--bg-card)',
    color: 'var(--text)',
    fontSize: 12,
  },
  labelStyle: { color: 'var(--text)' },
  itemStyle: { color: 'var(--text)' },
} as const;
