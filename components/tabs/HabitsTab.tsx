'use client';

import { useMemo, useState } from 'react';
import Card from '../Card';
import FileDropZone from '../FileDropZone';
import HabitHeatmap from '../HabitHeatmap';
import HabitMonthlyChart from '../HabitMonthlyChart';
import { useLifeData } from '../LifeDataProvider';
import { parseHabitCSV, currentStreak, dayIndex, dayTotals, habitNames, longestStreak, monthlyCounts } from '@/lib/habits';
import { deleteHabitLog, saveHabitLogs, saveHabitMeta } from '@/lib/lifeStore';
import { MONTH_LABELS } from '@/lib/period';
import type { HabitMeta } from '@/types';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function HabitsTab() {
  const { logs, meta, setLogs, setMeta } = useLifeData();
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());

  const names = useMemo(() => habitNames(logs), [logs]);
  const active = selected && names.includes(selected) ? selected : names[0] ?? null;
  const metaOf = (habit: string): HabitMeta | undefined => meta.find((m) => m.habit === habit);

  const yearLogs = useMemo(() => logs.filter((l) => l.date.startsWith(String(year))), [logs, year]);
  const allDays = useMemo(() => dayTotals(yearLogs), [yearLogs]);
  const activeDays = useMemo(
    () => (active ? dayIndex(yearLogs, active) : new Map<string, number>()),
    [yearLogs, active]
  );
  const activeCounts = useMemo(
    () => (active ? monthlyCounts(logs, active, year) : new Array(12).fill(0)),
    [logs, active, year]
  );

  const years = useMemo(() => {
    const set = new Set(logs.map((l) => Number(l.date.slice(0, 4))));
    set.add(new Date().getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [logs]);

  const now = new Date();
  const thisMonth = now.getFullYear() === year ? now.getMonth() : 11;
  const today = todayIso();

  const handleImport = async (files: File[]) => {
    setImportMsg(null);
    try {
      const parsed = (
        await Promise.all(files.map(async (f) => parseHabitCSV(await f.text(), f.name)))
      ).flat();

      if (parsed.length === 0) {
        setImportMsg('日付として読める行がありませんでした。CSVの中身を確認してください。');
        return;
      }
      const merged = await saveHabitLogs(parsed);
      setLogs(merged);
      const imported = new Set(parsed.map((p) => p.habit));
      setImportMsg(`${parsed.length}件・${imported.size}習慣を取り込みました（${Array.from(imported).join(', ')}）`);
    } catch {
      setImportMsg('読み込みに失敗しました。CSV形式か確認してください。');
    }
  };

  const toggleToday = async (habit: string) => {
    const done = logs.some((l) => l.habit === habit && l.date === today);
    const next = done
      ? await deleteHabitLog(habit, today)
      : await saveHabitLogs([{ habit, date: today, count: 1 }]);
    setLogs(next);
  };

  const updateGoal = async (habit: string, goal: number | undefined) => {
    const existing = metaOf(habit);
    const next: HabitMeta = { ...existing, habit, monthlyGoal: goal };
    await saveHabitMeta(next);
    setMeta([...meta.filter((m) => m.habit !== habit), next]);
  };

  const goal = active ? metaOf(active)?.monthlyGoal : undefined;
  const thisMonthCount = activeCounts[thisMonth] ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {/* ── 今日の習慣 ── */}
      {names.length > 0 && (
        <Card title="✅ 今日の習慣" badge={new Date().toLocaleDateString('ja-JP')}>
          <div className="flex flex-wrap gap-2">
            {names.map((h) => {
              const done = logs.some((l) => l.habit === h && l.date === today);
              return (
                <button
                  key={h}
                  onClick={() => toggleToday(h)}
                  className="text-xs px-3 py-2 rounded-full border transition-colors"
                  style={{
                    background: done ? 'var(--accent)' : 'var(--bg-card2)',
                    color: done ? '#fff' : 'var(--text-sub)',
                    borderColor: done ? 'var(--accent)' : 'var(--border)',
                  }}
                >
                  {done ? '✓ ' : ''}{h}
                </button>
              );
            })}
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            タップでその日の記録をON/OFFできます。Streaksの書き出しを取り込むと過去分も埋まります。
          </p>
        </Card>
      )}

      {/* ── 年間ヒートマップ（全習慣） ── */}
      <Card
        title="🔥 年間の実施状況"
        action={
          years.length > 1 ? (
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="text-xs px-2 py-1 rounded-lg border"
              style={{ background: 'var(--bg-card2)', color: 'var(--text-sub)', borderColor: 'var(--border)' }}
            >
              {years.map((y) => <option key={y} value={y}>{y}年</option>)}
            </select>
          ) : null
        }
      >
        {logs.length === 0 ? (
          <EmptyHint />
        ) : (
          <HabitHeatmap days={allDays} year={year} unit="件" />
        )}
      </Card>

      {/* ── 習慣ごとの詳細 ── */}
      {active && (
        <Card title={`📈 ${active}`}>
          <div className="flex flex-wrap gap-2">
            {names.map((h) => (
              <button
                key={h}
                onClick={() => setSelected(h)}
                className="text-xs px-3 py-1.5 rounded-full border transition-colors"
                style={{
                  background: active === h ? 'var(--accent)' : 'var(--bg-card)',
                  color: active === h ? '#fff' : 'var(--text-sub)',
                  borderColor: active === h ? 'var(--accent)' : 'var(--border)',
                }}
              >
                {h}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="今月" value={thisMonthCount} unit="回"
              sub={goal ? `目標 ${goal}回 (${Math.round((thisMonthCount / goal) * 100)}%)` : undefined} />
            <Stat label="継続中" value={currentStreak(logs, active)} unit="日" />
            <Stat label="最長連続" value={longestStreak(logs, active)} unit="日" />
            <Stat label={`${year}年 合計`} value={activeCounts.reduce((a, b) => a + b, 0)} unit="回" />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs" style={{ color: 'var(--text-muted)' }}>月間目標</label>
            <input
              type="number"
              min={0}
              value={goal ?? ''}
              placeholder="未設定"
              onChange={(e) => updateGoal(active, e.target.value ? Number(e.target.value) : undefined)}
              className="text-xs px-2 py-1 rounded-lg border w-24"
              style={{ background: 'var(--bg-card2)', color: 'var(--text)', borderColor: 'var(--border)' }}
            />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>回 / 月</span>
          </div>

          <HabitMonthlyChart counts={activeCounts} goal={goal} currentMonth={thisMonth} />
          <HabitHeatmap days={activeDays} year={year} title={`${active}（${year}年）`} />
        </Card>
      )}

      {/* ── 月別カウント表（Notionの表と同じ形＝グラフの代替表示） ── */}
      {names.length > 0 && (
        <Card title={`📋 月別カウント（${year}年）`}>
          <div className="overflow-x-auto">
            <table className="text-xs w-full" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th className="text-left font-medium py-2 pr-3 sticky left-0"
                    style={{ color: 'var(--text-muted)', background: 'var(--bg-card)' }}>習慣</th>
                  {MONTH_LABELS.map((m) => (
                    <th key={m} className="font-medium py-2 px-2 text-right tabular-nums"
                      style={{ color: 'var(--text-muted)' }}>{m}</th>
                  ))}
                  <th className="font-medium py-2 pl-3 text-right" style={{ color: 'var(--text-muted)' }}>計</th>
                </tr>
              </thead>
              <tbody>
                {names.map((h) => {
                  const counts = monthlyCounts(logs, h, year);
                  const total = counts.reduce((a, b) => a + b, 0);
                  return (
                    <tr key={h} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="py-2 pr-3 whitespace-nowrap sticky left-0"
                        style={{ color: 'var(--text)', background: 'var(--bg-card)' }}>{h}</td>
                      {counts.map((c, i) => (
                        <td key={i} className="py-2 px-2 text-right tabular-nums"
                          style={{ color: c === 0 ? 'var(--text-muted)' : 'var(--text)' }}>
                          {i > thisMonth ? '' : c || '—'}
                        </td>
                      ))}
                      <td className="py-2 pl-3 text-right tabular-nums font-semibold" style={{ color: 'var(--text)' }}>{total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── 取り込み ── */}
      <Card title="📱 Streaksのログを取り込む">
        <FileDropZone
          label="StreaksのCSVをアップロード"
          hint="複数ファイルまとめて選択できます"
          multiple
          onFiles={handleImport}
        />
        {importMsg && <p className="text-xs" style={{ color: 'var(--text-sub)' }}>{importMsg}</p>}
        <div className="text-xs rounded-xl p-3" style={{ background: 'var(--bg-card2)', color: 'var(--text-muted)' }}>
          <p className="font-medium mb-1" style={{ color: 'var(--text-sub)' }}>エクスポート手順</p>
          <ol className="list-decimal ml-4 space-y-0.5">
            <li>Streaks → 対象のタスクを開く</li>
            <li>右上メニュー → Export → CSV</li>
            <li>ここにアップロード（複数ファイルまとめて選択可）</li>
          </ol>
          <p className="mt-2">習慣名は CSV のヘッダー、無ければファイル名から判定します。</p>
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, unit, sub }: { label: string; value: number; unit: string; sub?: string }) {
  return (
    <div className="rounded-2xl border p-4 flex flex-col gap-1"
      style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}>
      <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <div className="flex items-end gap-1">
        <span className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{value}</span>
        <span className="text-sm mb-0.5" style={{ color: 'var(--text-muted)' }}>{unit}</span>
      </div>
      {sub && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{sub}</span>}
    </div>
  );
}

function EmptyHint() {
  return (
    <p className="text-xs py-6 text-center" style={{ color: 'var(--text-muted)' }}>
      まだ記録がありません。下の「Streaksのログを取り込む」からCSVをアップロードしてください。
    </p>
  );
}
