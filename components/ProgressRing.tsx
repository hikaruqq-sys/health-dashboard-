'use client';

/**
 * 1つの数字を見せるためのリング（統計タイルの一種）。
 * 中央の値が主役で、リングは進捗の目安。色は状態ではなく1色で固定する。
 */
export default function ProgressRing({
  percent,
  label,
  center,
  sub,
  color,
  size = 84,
}: {
  percent: number;      // 0-100
  label: string;
  center: string;
  sub?: string;
  color: string;
  size?: number;
}) {
  const stroke = 7;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(Math.max(percent, 0), 100);
  const dash = (clamped / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
          {/* 0% のときは描かない（丸いキャップだけが点として残ってしまうため） */}
          {clamped > 0 && (
            <circle
              cx={size / 2} cy={size / 2} r={r}
              fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference - dash}`}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold leading-none" style={{ color: 'var(--text)' }}>{center}</span>
          {sub && <span className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</span>}
        </div>
      </div>
      <span className="text-xs font-medium" style={{ color: 'var(--text-sub)' }}>{label}</span>
    </div>
  );
}
