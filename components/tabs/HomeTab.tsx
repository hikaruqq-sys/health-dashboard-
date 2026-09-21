'use client';
import { loadReceiptItems, loadViewingItems, computeValueSummaries } from '@/lib/inventory';

import { useMemo, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import Card from '../Card';
import ProgressRing from '../ProgressRing';
import { useTheme } from '../ThemeProvider';
import { useLifeData } from '../LifeDataProvider';
import { APP_LINKS, loadLinkUrls, saveLinkUrl } from '@/data/links';
import { habitNames, monthlyCounts } from '@/lib/habits';
import { periodProgress, quarterOf } from '@/lib/period';
import { seriesColor, tooltipStyle } from '@/lib/vizPalette';
import type { BodyMetric, DailyNutrition, Quarter, TargetRow } from '@/types';
import { saveTarget } from '@/lib/lifeStore';
import { CATEGORY_COLORS, QUARTER_LABELS } from '@/data/targets2026';
import { TARGET_EVIDENCES } from '@/data/receiptSeedData';
import { STATUS } from '@/lib/vizPalette';
import type { TargetStatus } from '@/types';

const QUARTERS: Quarter[] = ['q1', 'q2', 'q3', 'q4'];

function nextStatus(current: TargetStatus | undefined): TargetStatus | undefined {
  if (current === undefined) return 'done';
  if (current === 'done') return 'miss';
  return undefined;
}

function StatusButton({ status, onClick }: { status: TargetStatus | undefined; onClick: () => void }) {
  const bg = status === 'done' ? STATUS.good : status === 'miss' ? STATUS.critical : 'var(--bg-card2)';
  const label = status === 'done' ? '○' : status === 'miss' ? '×' : '–';
  const aria = status === 'done' ? '達成' : status === 'miss' ? '未達成' : '未評価';
  return (
    <button
      onClick={onClick}
      title={aria}
      aria-label={aria}
      className="w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center flex-shrink-0 border"
      style={{
        background: bg,
        color: status ? '#fff' : 'var(--text-muted)',
        borderColor: status ? bg : 'var(--border)',
      }}
    >
      {label}
    </button>
  );
}


export default function HomeTab({
  metrics,
  nutrition,
  onNavigate,
}: {
  metrics: BodyMetric[];
  nutrition: DailyNutrition[];
  onNavigate: (tab: string) => void;
}) {
  const { theme } = useTheme();
  const { logs, meta, targets, library, setTargets } = useLifeData();
  const [openId, setOpenId] = useState<string | null>(null);

  const [urls, setUrls] = useState<Record<string, string>>(() =>
    typeof window === 'undefined' ? {} : loadLinkUrls()
  );
  const [editing, setEditing] = useState<string | null>(null);

  // マウント時の日付で固定する（毎レンダーで new Date() すると下の useMemo が効かない）
  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const month = now.getMonth();
  const periods = periodProgress(now);
  // 総合達成計算
  const totalStats = useMemo(() => {
    let done = 0;
    let totalEvaluated = 0;
    targets.forEach((r) => {
      QUARTERS.forEach((q) => {
        if (r.status[q] === 'done') {
          done += 1;
          totalEvaluated += 1;
        } else if (r.status[q] === 'miss') {
          totalEvaluated += 1;
        }
      });
    });
    return {
      done,
      totalEvaluated,
      rate: totalEvaluated === 0 ? 0 : Math.round((done / totalEvaluated) * 100),
      allQuartersTotal: targets.length * 4,
    };
  }, [targets]);

  const quarterStats = useMemo(
    () =>
      QUARTERS.map((q) => {
        const done = targets.filter((t) => t.status[q] === 'done').length;
        const miss = targets.filter((t) => t.status[q] === 'miss').length;
        return { q, done, miss, unset: targets.length - done - miss, total: targets.length };
      }),
    [targets]
  );

  const byCategory = useMemo(() => {
    const map = new Map<string, TargetRow[]>();
    targets.forEach((t) => {
      if (!map.has(t.category)) map.set(t.category, []);
      map.get(t.category)!.push(t);
    });
    return map;
  }, [targets]);

  const toggleTarget = async (row: TargetRow, q: Quarter) => {
    const status = { ...row.status };
    const next = nextStatus(status[q]);
    if (next) status[q] = next;
    else delete status[q];

    const updated = { ...row, status };
    setTargets(targets.map((t) => (t.id === row.id ? updated : t)));
    await saveTarget(updated);
  };


  // 今月、月間目標を設定している習慣がどれだけ進んでいるか
  const habitProgress = useMemo(() => {
    const names = habitNames(logs);
    return names
      .map((habit) => {
        const goal = meta.find((m) => m.habit === habit)?.monthlyGoal;
        const count = monthlyCounts(logs, habit, year)[month] ?? 0;
        return { habit, goal, count };
      })
      .sort((a, b) => b.count - a.count);
  }, [logs, meta, year, month]);


  // Well-being / Ownership サマリー (9月基準)
  const valueSummaries = useMemo(() => {
    const rc = typeof window !== 'undefined' ? loadReceiptItems() : [];
    const vw = typeof window !== 'undefined' ? loadViewingItems() : [];
    return computeValueSummaries(rc, vw);
  }, []);
  const curVal = valueSummaries['2026-09'] || {
    wbAmount: 38700,
    osAmount: 6850,
    totalAmount: 56790,
    wbMinutes: 165,
    osMinutes: 195,
    totalMinutes: 360,
  };

  const currentQ = `q${quarterOf(now)}` as Quarter;
  const qDone = targets.filter((t) => t.status[currentQ] === 'done').length;

  const weightSeries = useMemo(
    () => metrics.filter((m) => m.weight != null).slice(-30).map((m) => ({ date: m.date, weight: m.weight as number })),
    [metrics]
  );
  const calorieSeries = useMemo(
    () => nutrition.slice(-14).map((d) => ({ date: d.date, kcal: Math.round(d.totalCalories) })),
    [nutrition]
  );

  const booksThisYear = library.filter(
    (i) => i.type === 'book' && i.finishedOn?.startsWith(String(year))
  ).length;

  return (
    <div className="flex flex-col gap-4">
      {/* ── 期間の経過 ── */}
      <Card title={`⏳ ${year}年の経過`}>
        <div className="flex flex-col gap-3">
          {periods.map((p) => (
            <div key={p.label} className="flex items-center gap-3">
              <span className="text-xs w-12 flex-shrink-0" style={{ color: 'var(--text-sub)' }}>{p.label}</span>
              <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg-card2)' }}>
                <div className="h-full rounded-full" style={{ width: `${p.percent}%`, background: 'var(--accent)' }} />
              </div>
              <span className="text-xs tabular-nums w-28 text-right flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                {p.percent}% · 残り{p.remaining}日
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* ── サマリ ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryTile
          label={`${currentQ.toUpperCase()} 達成`}
          value={`${qDone}`}
          unit={`/ ${targets.length}`}
          onClick={() => onNavigate('target')}
        />
        <SummaryTile
          label="今月の習慣"
          value={`${habitProgress.reduce((n, h) => n + h.count, 0)}`}
          unit="回"
          onClick={() => onNavigate('habits')}
        />
        <SummaryTile
          label="今年の読了"
          value={`${booksThisYear}`}
          unit="/ 24冊 (読了)"
          onClick={() => onNavigate('value')}
        />
        <SummaryTile
          label="最新体重"
          value={weightSeries.length ? weightSeries[weightSeries.length - 1].weight.toFixed(1) : '—'}
          unit="kg"
          onClick={() => onNavigate('health')}
        />
      </div>

      {/* ── 💎 人生価値の投下サマリー (Well-being × Ownership) ── */}
      <Card
        title="💎 9月の人生価値リソース配分"
        action={
          <button
            onClick={() => onNavigate('value')}
            className="text-xs px-2.5 py-1 rounded-lg font-medium text-[var(--accent)] hover:underline"
          >
            詳細を見る ↗
          </button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div
            onClick={() => onNavigate('value')}
            className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card2)] cursor-pointer hover:border-[var(--accent)] transition-all flex flex-col gap-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-sub)]">💰 Well-being 支出</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 font-bold">
                {curVal.totalAmount > 0 ? Math.round((curVal.wbAmount / curVal.totalAmount) * 100) : 0}%
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold text-[var(--text)]">¥{curVal.wbAmount.toLocaleString()}</span>
              <span className="text-xs text-[var(--text-muted)]">/ ¥{curVal.totalAmount.toLocaleString()}</span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] truncate">心を満たす外食・家族・生活改善</p>
          </div>

          <div
            onClick={() => onNavigate('value')}
            className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card2)] cursor-pointer hover:border-[var(--accent)] transition-all flex flex-col gap-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-sub)]">🧭 Ownership 視聴・探求時間</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                {curVal.totalMinutes > 0 ? Math.round((curVal.osMinutes / curVal.totalMinutes) * 100) : 0}%
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold text-[var(--text)]">
                {Math.floor(curVal.osMinutes / 60)}h {curVal.osMinutes % 60}m
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                / {Math.floor(curVal.totalMinutes / 60)}h {curVal.totalMinutes % 60}m
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] truncate">戦術分析・ドキュメンタリー・知性</p>
          </div>
        </div>
      </Card>

      
      {/* ── 🎯 2026年 目標達成総合ステータス（総合値） ── */}
      <Card
        title="🎯 2026年 目標達成総合ステータス"
        action={
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-muted)]">総合達成率:</span>
            <span className="text-sm font-bold text-emerald-500 tabular-nums">
              {totalStats.done}/{totalStats.totalEvaluated} ({totalStats.rate}%)
            </span>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {/* 四半期進捗リング */}
          <div className="grid grid-cols-4 gap-2 pt-1">
            {quarterStats.map(({ q, done, total }) => (
              <ProgressRing
                key={q}
                percent={total === 0 ? 0 : (done / total) * 100}
                center={`${done}`}
                sub={`/ ${total}`}
                label={`Q${quarterOf(now)}` === q.toUpperCase() ? `${q.toUpperCase()} ← 今` : q.toUpperCase()}
                color="var(--accent)"
              />
            ))}
          </div>

          {/* カテゴリ別進捗 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {Array.from(byCategory.entries()).map(([cat, rows]) => {
              let done = 0;
              let totalEvaluated = 0;
              rows.forEach((r) => {
                QUARTERS.forEach((q) => {
                  if (r.status[q] === 'done') {
                    done += 1;
                    totalEvaluated += 1;
                  } else if (r.status[q] === 'miss') {
                    totalEvaluated += 1;
                  }
                });
              });
              const rate = totalEvaluated === 0 ? 0 : Math.round((done / totalEvaluated) * 100);
              const color = CATEGORY_COLORS[cat] ?? 'var(--accent)';

              return (
                <div
                  key={cat}
                  className="p-2.5 rounded-xl border flex flex-col gap-1.5"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-card2)' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold" style={{ color: 'var(--text)' }}>
                      {cat}
                    </span>
                    <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      {done}/{totalEvaluated} ({rate}%)
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${rate}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* 📋 2026 Target 表 ＆ エビデンスドリルダウン */}
          <div className="overflow-x-auto border-t border-[var(--border)] pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[var(--text)]">📋 2026 Target 一覧（項目タップで日々の実績を展開）</span>
              <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
                <span className="flex items-center gap-1"><span style={{ width: 8, height: 8, borderRadius: 2, background: STATUS.good }} />○ 達成</span>
                <span className="flex items-center gap-1"><span style={{ width: 8, height: 8, borderRadius: 2, background: STATUS.critical }} />× 未達成</span>
                <span className="flex items-center gap-1"><span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--border)' }} />– 未評価</span>
              </div>
            </div>

            <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-2 pr-2 font-medium" style={{ color: 'var(--text-muted)' }}>カテゴリ</th>
                  <th className="text-left py-2 pr-2 font-medium" style={{ color: 'var(--text-muted)' }}>項目</th>
                  {QUARTERS.map((q) => (
                    <th key={q} className="text-left py-2 px-1.5 font-medium min-w-[170px]" style={{ color: 'var(--text-muted)' }}>
                      {QUARTER_LABELS[q]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {targets.map((row) => {
                  const isOpen = openId === row.id;
                  const evidence = TARGET_EVIDENCES.find((e) => e.item === row.item || e.targetId === row.id);

                  return (
                    <>
                      <tr
                        key={row.id}
                        className="cursor-pointer hover:bg-[var(--bg-card2)]/60 transition-colors border-b border-[var(--border)]/50"
                        onClick={() => setOpenId(isOpen ? null : row.id)}
                      >
                        <td className="py-2 pr-2 align-top whitespace-nowrap">
                          <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-sub)' }}>
                            <span style={{ width: 6, height: 6, borderRadius: 2, background: CATEGORY_COLORS[row.category] ?? 'var(--accent)' }} />
                            {row.category}
                          </span>
                        </td>
                        <td className="py-2 pr-2 align-top font-bold whitespace-nowrap" style={{ color: 'var(--text)' }}>
                          <span className="flex items-center gap-1">
                            {row.item}
                            <span className="text-[9px] text-[var(--accent)] font-normal">{isOpen ? '▲' : '▼'}</span>
                          </span>
                        </td>
                        {QUARTERS.map((q) => (
                          <td key={q} className="py-2 px-1.5 align-top" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-start gap-1.5">
                              <StatusButton status={row.status[q]} onClick={() => toggleTarget(row, q)} />
                              <span className="leading-snug text-[11px]" style={{ color: 'var(--text-sub)' }}>{row[q]}</span>
                            </div>
                          </td>
                        ))}
                      </tr>

                      {/* エビデンス展開 */}
                      {isOpen && evidence && (
                        <tr key={`${row.id}-ev`} className="bg-[var(--bg-card2)]/80">
                          <td colSpan={6} className="p-3 border-b border-[var(--border)]">
                            <div className="flex flex-col gap-2">
                              <span className="text-xs font-bold text-[var(--accent)]">
                                📝 日々のログ・実績エビデンス ({row.item})
                              </span>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                {(['q1', 'q2', 'q3'] as const).map((qKey) => (
                                  <div key={qKey} className="p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] flex flex-col gap-1">
                                    <span className="text-[10px] font-semibold text-[var(--text-sub)]">
                                      {qKey.toUpperCase()} 実績:
                                    </span>
                                    <ul className="text-[11px] text-[var(--text-sub)] space-y-0.5 list-disc list-inside">
                                      {evidence.quarterEvidence[qKey]?.map((ev, idx) => (
                                        <li key={idx} className="leading-snug">{ev}</li>
                                      )) ?? <li className="text-[var(--text-muted)] list-none">ログなし</li>}
                                    </ul>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* ── 今月の習慣リング ── */}
      {habitProgress.some((h) => h.goal) && (
        <Card title="🔥 今月の習慣（目標を設定したもの）">
          <div className="flex gap-4 overflow-x-auto pb-1">
            {habitProgress
              .filter((h) => h.goal)
              .map((h) => (
                <div key={h.habit} className="flex-shrink-0">
                  <ProgressRing
                    percent={(h.count / (h.goal as number)) * 100}
                    center={`${h.count}`}
                    sub={`/ ${h.goal}`}
                    label={h.habit}
                    color="var(--accent)"
                    size={72}
                  />
                </div>
              ))}
          </div>
        </Card>
      )}



      {/* ── 他のアプリへのリンク ── */}
      <Card title="🔗 自分のアプリ">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* 体組成・食事はこのアプリ内の「健康」タブなので、外部リンクではなくタブ切り替えにする */}
          <button
            onClick={() => onNavigate('health')}
            className="rounded-2xl border p-4 flex items-center gap-3 text-left transition-colors sm:col-span-2"
            style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
          >
            <span
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
              style={{ background: '#38bdf822' }}
            >
              🏃
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>健康</p>
              <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>体組成・食事の記録</p>
            </div>
            <span
              className="text-xs px-3 py-1.5 rounded-lg font-medium flex-shrink-0"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              開く
            </span>
          </button>

          {APP_LINKS.map((link) => {
            const url = urls[link.id] ?? link.defaultUrl;
            const isEditing = editing === link.id;
            return (
              <div
                key={link.id}
                className="rounded-2xl border p-4 flex items-center gap-3"
                style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
              >
                <span
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                  style={{ background: `${link.color}22` }}
                >
                  {link.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{link.name}</p>
                  {isEditing ? (
                    <input
                      autoFocus
                      defaultValue={url}
                      placeholder="https://..."
                      onBlur={(e) => {
                        saveLinkUrl(link.id, e.target.value.trim());
                        setUrls(loadLinkUrls());
                        setEditing(null);
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      className="text-xs px-2 py-1 rounded-lg border w-full mt-1"
                      style={{ background: 'var(--bg-card)', color: 'var(--text)', borderColor: 'var(--border)' }}
                    />
                  ) : (
                    <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{link.description}</p>
                  )}
                </div>
                {!isEditing && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setEditing(link.id)}
                      title="URLを編集"
                      className="text-xs px-2 py-1.5 rounded-lg"
                      style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}
                    >
                      ✎
                    </button>
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-3 py-1.5 rounded-lg font-medium"
                        style={{ background: 'var(--accent)', color: '#fff' }}
                      >
                        開く ↗
                      </a>
                    ) : (
                      <span className="text-xs px-2 py-1.5" style={{ color: 'var(--text-muted)' }}>URL未設定</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function SummaryTile({ label, value, unit, onClick }: {
  label: string; value: string; unit: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl border p-4 flex flex-col gap-1 text-left transition-colors"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <div className="flex items-end gap-1">
        <span className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{value}</span>
        <span className="text-sm mb-0.5" style={{ color: 'var(--text-muted)' }}>{unit}</span>
      </div>
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="h-[120px] flex items-center justify-center text-xs" style={{ color: 'var(--text-muted)' }}>
      {text}
    </div>
  );
}
