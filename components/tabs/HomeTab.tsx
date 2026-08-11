'use client';

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
import type { BodyMetric, DailyNutrition, Quarter } from '@/types';

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
  const { logs, meta, targets, library } = useLifeData();
  const [urls, setUrls] = useState<Record<string, string>>(() =>
    typeof window === 'undefined' ? {} : loadLinkUrls()
  );
  const [editing, setEditing] = useState<string | null>(null);

  // マウント時の日付で固定する（毎レンダーで new Date() すると下の useMemo が効かない）
  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const month = now.getMonth();
  const periods = periodProgress(now);

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
          unit="/ 24冊"
          onClick={() => onNavigate('library')}
        />
        <SummaryTile
          label="最新体重"
          value={weightSeries.length ? weightSeries[weightSeries.length - 1].weight.toFixed(1) : '—'}
          unit="kg"
          onClick={() => onNavigate('health')}
        />
      </div>

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

      {/* ── ミニグラフ ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card title="⚖️ 体重（直近30回）">
          {weightSeries.length > 1 ? (
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={weightSeries} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <YAxis domain={['dataMin - 0.5', 'dataMax + 0.5']} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} formatter={(v) => [`${v} kg`, '体重']} />
                <Line type="monotone" dataKey="weight" stroke={seriesColor(theme, 0)} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Empty text="タニタを連携すると表示されます" />
          )}
        </Card>

        <Card title="🥗 カロリー（直近14日）">
          {calorieSeries.length > 1 ? (
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={calorieSeries} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} formatter={(v) => [`${v} kcal`, 'カロリー']} />
                <Line type="monotone" dataKey="kcal" stroke={seriesColor(theme, 1)} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Empty text="食事CSVを取り込むと表示されます" />
          )}
        </Card>
      </div>

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
