'use client';

interface Props {
  protein: number; fat: number; carbs: number; calories: number;
  goals?: { protein: number; fat: number; carbs: number; calories: number };
}

function Gauge({ label, value, goal, unit, color }: { label: string; value: number; goal: number; unit: string; color: string }) {
  const pct = Math.min((value / goal) * 100, 100);
  const over = value > goal;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span style={{ color: 'var(--text-sub)' }}>{label}</span>
        <span style={{ color: over ? '#f43f5e' : 'var(--text)' }} className={over ? 'font-medium' : ''}>
          {Math.round(value)}/{goal}{unit}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-card2)' }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export default function MacroBar({ protein, fat, carbs, calories, goals }: Props) {
  const g = goals ?? { calories: 2000, protein: 130, fat: 55, carbs: 250 };
  return (
    <div className="rounded-2xl border p-5 flex flex-col gap-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-sub)' }}>今日の栄養</h2>
      <Gauge label="カロリー" value={calories} goal={g.calories} unit=" kcal" color="#6366f1" />
      <Gauge label="タンパク質" value={protein} goal={g.protein} unit=" g" color="#10b981" />
      <Gauge label="脂質" value={fat} goal={g.fat} unit=" g" color="#f43f5e" />
      <Gauge label="炭水化物" value={carbs} goal={g.carbs} unit=" g" color="#f59e0b" />
    </div>
  );
}
