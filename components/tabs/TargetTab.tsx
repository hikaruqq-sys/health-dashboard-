'use client';

import { useMemo, useState } from 'react';
import Card from '../Card';
import ProgressRing from '../ProgressRing';
import { useLifeData } from '../LifeDataProvider';
import { saveTarget } from '@/lib/lifeStore';
import { CATEGORY_COLORS, QUARTER_LABELS } from '@/data/targets2026';
import { quarterOf } from '@/lib/period';
import { STATUS } from '@/lib/vizPalette';
import type { Quarter, TargetRow, TargetStatus } from '@/types';

const QUARTERS: Quarter[] = ['q1', 'q2', 'q3', 'q4'];

/** 未設定 → 達成 → 未達成 → 未設定 と3状態を回す */
function nextStatus(current: TargetStatus | undefined): TargetStatus | undefined {
  if (current === undefined) return 'done';
  if (current === 'done') return 'miss';
  return undefined;
}

export default function TargetTab() {
  const { targets, setTargets } = useLifeData();
  const [openId, setOpenId] = useState<string | null>(null);
  const currentQ = quarterOf(new Date());

  const byCategory = useMemo(() => {
    const map = new Map<string, TargetRow[]>();
    targets.forEach((t) => {
      if (!map.has(t.category)) map.set(t.category, []);
      map.get(t.category)!.push(t);
    });
    return map;
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

  const toggle = async (row: TargetRow, q: Quarter) => {
    const status = { ...row.status };
    const next = nextStatus(status[q]);
    if (next) status[q] = next;
    else delete status[q];

    const updated = { ...row, status };
    setTargets(targets.map((t) => (t.id === row.id ? updated : t)));
    await saveTarget(updated);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ── 四半期ごとの達成状況 ── */}
      <Card title="🎯 四半期の達成状況">
        <div className="grid grid-cols-4 gap-2">
          {quarterStats.map(({ q, done, total }) => (
            <ProgressRing
              key={q}
              percent={total === 0 ? 0 : (done / total) * 100}
              center={`${done}`}
              sub={`/ ${total}`}
              // 「今どの四半期か」は色ではなくラベルで示す（色は状態の意味に取っておく）
              label={`Q${currentQ}` === q.toUpperCase() ? `${q.toUpperCase()} ← 今` : q.toUpperCase()}
              color="var(--accent)"
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs pt-1" style={{ color: 'var(--text-muted)' }}>
          <span className="flex items-center gap-1.5">
            <span style={{ width: 10, height: 10, borderRadius: 3, background: STATUS.good }} />○ 達成
          </span>
          <span className="flex items-center gap-1.5">
            <span style={{ width: 10, height: 10, borderRadius: 3, background: STATUS.critical }} />× 未達成
          </span>
          <span className="flex items-center gap-1.5">
            <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--border)' }} />— 未評価
          </span>
          <span className="ml-auto">現在 Q{currentQ}</span>
        </div>
      </Card>

      {/* ── カテゴリ別の内訳 ── */}
      <Card title="📊 カテゴリ別の達成">
        <div className="flex flex-col gap-3">
          {Array.from(byCategory.entries()).map(([category, rows]) => {
            const done = rows.reduce(
              (n, r) => n + QUARTERS.filter((q) => r.status[q] === 'done').length, 0
            );
            const evaluated = rows.reduce(
              (n, r) => n + QUARTERS.filter((q) => r.status[q] !== undefined).length, 0
            );
            const pct = evaluated === 0 ? 0 : Math.round((done / evaluated) * 100);
            return (
              <div key={category} className="flex items-center gap-3">
                <span className="text-xs w-24 flex-shrink-0 truncate" style={{ color: 'var(--text-sub)' }}>
                  {category}
                </span>
                <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-card2)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: CATEGORY_COLORS[category] ?? 'var(--accent)' }}
                  />
                </div>
                <span className="text-xs tabular-nums w-20 text-right flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {done}/{evaluated || '—'} ({pct}%)
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          ○×を付けた四半期のうち達成した割合。未評価の四半期は分母に入れていません。
        </p>
      </Card>

      {/* ── 目標グリッド（Notion の Target 表） ── */}
      <Card title="📋 2026 Target">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          ○/× をタップすると「達成 → 未達成 → 未評価」の順に切り替わります。項目名をタップで全文表示。
        </p>

        {/* PC: 表形式 */}
        {/* 四半期の説明文が潰れて縦書きにならないよう、幅を確保して横スクロールさせる */}
        <div className="hidden md:block overflow-x-auto">
          <table className="text-xs" style={{ borderCollapse: 'collapse', minWidth: 1040 }}>
            <thead>
              <tr>
                <th className="text-left font-medium py-2 pr-3" style={{ color: 'var(--text-muted)' }}>カテゴリ</th>
                <th className="text-left font-medium py-2 pr-3" style={{ color: 'var(--text-muted)' }}>項目</th>
                {QUARTERS.map((q) => (
                  <th key={q} className="text-left font-medium py-2 px-2"
                    style={{ color: 'var(--text-muted)', minWidth: 200 }}>
                    {QUARTER_LABELS[q]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {targets.map((row) => (
                <tr key={row.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="py-2.5 pr-3 align-top whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--text-sub)' }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: 2,
                        background: CATEGORY_COLORS[row.category] ?? 'var(--accent)',
                      }} />
                      {row.category}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 align-top font-medium whitespace-nowrap" style={{ color: 'var(--text)' }}>
                    {row.item}
                  </td>
                  {QUARTERS.map((q) => (
                    <td key={q} className="py-2.5 px-2 align-top" style={{ minWidth: 200 }}>
                      <div className="flex items-start gap-2">
                        <StatusButton status={row.status[q]} onClick={() => toggle(row, q)} />
                        <span className="leading-relaxed" style={{ color: 'var(--text-sub)' }}>{row[q]}</span>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* モバイル: 項目ごとのカード */}
        <div className="md:hidden flex flex-col gap-2">
          {targets.map((row) => {
            const open = openId === row.id;
            return (
              <div key={row.id} className="rounded-xl border overflow-hidden"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-card2)' }}>
                <button
                  onClick={() => setOpenId(open ? null : row.id)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: 2, flexShrink: 0,
                    background: CATEGORY_COLORS[row.category] ?? 'var(--accent)',
                  }} />
                  <span className="text-sm font-medium flex-1 truncate" style={{ color: 'var(--text)' }}>{row.item}</span>
                  <span className="flex gap-1 flex-shrink-0">
                    {QUARTERS.map((q) => (
                      <span key={q} className="text-[10px] w-4 h-4 rounded flex items-center justify-center"
                        style={{
                          background:
                            row.status[q] === 'done' ? STATUS.good
                            : row.status[q] === 'miss' ? STATUS.critical
                            : 'var(--border)',
                          color: row.status[q] ? '#fff' : 'var(--text-muted)',
                        }}>
                        {row.status[q] === 'done' ? '○' : row.status[q] === 'miss' ? '×' : '–'}
                      </span>
                    ))}
                  </span>
                </button>
                {open && (
                  <div className="px-3 pb-3 flex flex-col gap-2">
                    {QUARTERS.map((q) => (
                      <div key={q} className="flex items-start gap-2">
                        <StatusButton status={row.status[q]} onClick={() => toggle(row, q)} />
                        <div className="flex-1">
                          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{QUARTER_LABELS[q]}</p>
                          <p className="text-xs" style={{ color: 'var(--text-sub)' }}>{row[q]}</p>
                        </div>
                      </div>
                    ))}
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
