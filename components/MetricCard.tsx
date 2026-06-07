'use client';

interface MetricCardProps {
  label: string;
  value: string | number | undefined;
  unit: string;
  sub?: string;
  trend?: 'up' | 'down' | 'flat';
  trendGood?: 'up' | 'down';
}

export default function MetricCard({ label, value, unit, sub, trend, trendGood }: MetricCardProps) {
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
  const isGood = trend && trendGood && trend === trendGood;
  const isBad = trend && trendGood && trend !== 'flat' && trend !== trendGood;
  const trendColor = isGood ? '#10b981' : isBad ? '#f43f5e' : 'var(--text-muted)';

  return (
    <div className="rounded-2xl border p-4 flex flex-col gap-1" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <div className="flex items-end gap-1">
        <span className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
          {value !== undefined ? value : '—'}
        </span>
        <span className="text-sm mb-0.5" style={{ color: 'var(--text-muted)' }}>{unit}</span>
        {trend && <span className="text-sm font-semibold mb-0.5 ml-1" style={{ color: trendColor }}>{trendIcon}</span>}
      </div>
      {sub && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{sub}</span>}
    </div>
  );
}
