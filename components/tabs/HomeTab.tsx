'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { loadLinkUrls, saveLinkUrl } from '@/data/links';
import type { BodyMetric, DailyNutrition } from '@/types';

interface CalInputItem {
  id: string;
  day: number;
  icon: string;
  label: string;
  targetApp: string;
  kvKey: string;
  done: boolean;
}

interface AppItem {
  id: string;
  icon: string;
  name: string;
  score: number;
  visit: string;
  visitScore: number;
  design: number;
  btnLabel: string;
  btnCount: number;
  sizeLabel: string;
  mb: number;
  url: string;
  internalTab?: string;
  localPath: string;
  muted: boolean;
}

const TODAY = 23; // 2026-11-23

const INITIAL_CAL_ITEMS: CalInputItem[] = [
  { id: 'c1', day: 14, icon: '🏢', label: 'Q2 IR', targetApp: 'Money & Assets', kvKey: 'corp_q2', done: true },
  { id: 'q1', day: 21, icon: '🏢', label: 'Q3 IR', targetApp: 'Money & Assets', kvKey: 'corp_q3', done: false },
  { id: 'q2', day: 22, icon: '📈', label: 'Econ 11', targetApp: 'Money & Assets', kvKey: 'econ_nov', done: true },
  { id: 'q3', day: 23, icon: '🍎', label: 'Shopping CSV', targetApp: 'Shopping & Items', kvKey: 'kaimono_w4', done: false },
  { id: 'q4', day: 25, icon: '🔥', label: 'Habits CSV', targetApp: 'Life Dashboard', kvKey: 'streaks_w4', done: false },
  { id: 'q5', day: 28, icon: '💰', label: 'NISA Assets', targetApp: 'Money & Assets', kvKey: 'asset_nov', done: false },
  { id: 'q6', day: 29, icon: '💳', label: 'MF Budget', targetApp: 'Money & Assets', kvKey: 'budget_nov', done: false },
  { id: 'q7', day: 30, icon: '📚', label: 'Books CSV', targetApp: 'Life Dashboard', kvKey: 'books_nov', done: false },
];

const INITIAL_APPS: AppItem[] = [
  { id: 'money', icon: '💰', name: 'Money & Assets', score: 90, visit: '週3-4回・12分', visitScore: 90, design: 90, btnLabel: '91 / 死3', btnCount: 94, sizeLabel: '837MB', mb: 837, url: 'https://money-dashboard-iota-three.vercel.app', localPath: '~/money-dashboard', muted: false },
  { id: 'health', icon: '🏠', name: 'Life Dashboard', score: 89, visit: '毎日・6分', visitScore: 91, design: 86, btnLabel: '92 / 死6', btnCount: 98, sizeLabel: '753MB', mb: 753, url: 'https://health-dashboard-dusky-xi.vercel.app', internalTab: 'health', localPath: '~/health-dashboard', muted: false },
  { id: 'kaimono', icon: '🍎', name: 'Shopping & Items', score: 86, visit: '週3-5回・15分', visitScore: 92, design: 98, btnLabel: '81 / 死0', btnCount: 81, sizeLabel: '1.2MB', mb: 1.2, url: 'http://localhost:8765', localPath: '~/.gemini/antigravity/scratch/kaimono-lifelog', muted: false },
  { id: 'tvid', icon: '🎥', name: 'Tennis Video Maker', score: 86, visit: '週2-3回・25分', visitScore: 91, design: 85, btnLabel: '138 / 死2', btnCount: 140, sizeLabel: '58MB', mb: 58, url: 'http://localhost:8090', localPath: '~/tennis-score/tools', muted: false },
  { id: 'spanish', icon: '🇪🇸', name: 'Spanish Learning', score: 85, visit: '週4-5回・5分', visitScore: 82, design: 85, btnLabel: '24 / 死0', btnCount: 24, sizeLabel: '380KB', mb: 0.38, url: 'https://spanish-app-kappa-mauve.vercel.app', localPath: '~/spanish-learning-app', muted: false },
  { id: 'tennis', icon: '🎾', name: 'Tennis Score', score: 84, visit: '週2-3回・20分', visitScore: 89, design: 82, btnLabel: '146 / 死19', btnCount: 165, sizeLabel: '876MB', mb: 876, url: 'https://tennis-score-pi.vercel.app', localPath: '~/tennis-score', muted: false },
  { id: 'rio', icon: '🏆', name: 'RIO Rankings', score: 82, visit: '月2-4回・3分', visitScore: 67, design: 88, btnLabel: '19 / 死0', btnCount: 19, sizeLabel: '212KB', mb: 0.21, url: 'https://rio-rankings.vercel.app', localPath: '~/rio-rankings', muted: false },
  { id: 'rally', icon: '🎬', name: 'Rally Auto-Cutter', score: 78, visit: '月2-3回・10分', visitScore: 70, design: 84, btnLabel: '9 / 死0', btnCount: 9, sizeLabel: '11MB', mb: 11, url: 'http://localhost:8088', localPath: '~/.gemini/antigravity/scratch/tennis-rally-cutter', muted: false },
  { id: 'yt', icon: '▶️', name: 'YouTube Summarizer', score: 76, visit: '毎日自動', visitScore: 73, design: 72, btnLabel: '0 (自動)', btnCount: 0, sizeLabel: '40KB', mb: 0.04, url: 'https://script.google.com', localPath: '~/.gemini/antigravity/scratch/youtube_summarizer', muted: false },
  { id: 'vauto', icon: '🎞️', name: 'Video Auto-Editor', score: 74, visit: '月1-2回・8分', visitScore: 62, design: 70, btnLabel: '4 / 死2', btnCount: 6, sizeLabel: '502MB', mb: 502, url: 'http://localhost:8000/resolve', localPath: '~/video-auto-editor', muted: false },
  { id: 'imgdec', icon: '🧩', name: 'Image Decomposer', score: 48, visit: '放置・0分', visitScore: 5, design: 60, btnLabel: '23 (放置)', btnCount: 23, sizeLabel: '305MB', mb: 305, url: '', localPath: '~/.gemini/antigravity/scratch/image-decomposer-app', muted: true },
  { id: 'pvid', icon: '🎙️', name: 'Podcast Video Gen', score: 47, visit: '休眠・0分', visitScore: 13, design: 55, btnLabel: '1 (休眠)', btnCount: 1, sizeLabel: '1.2GB', mb: 1228, url: '', localPath: '~/.gemini/antigravity/scratch/podcast-video-generator', muted: true },
  { id: 'cisland', icon: '🏝️', name: 'Claude Island', score: 46, visit: '休眠・0分', visitScore: 5, design: 68, btnLabel: '0 (遺物)', btnCount: 0, sizeLabel: '469MB', mb: 469, url: '', localPath: '~/ClaudeIsland', muted: true },
  { id: 'palign', icon: '🎚️', name: 'Podcast Align', score: 34, visit: '休眠・0分', visitScore: 5, design: 20, btnLabel: '0 (削除)', btnCount: 0, sizeLabel: '1.3GB', mb: 1331, url: '', localPath: '~/podcast-align', muted: true },
];

const INITIAL_TASKS = ['🎥 Delete Raw MP4s', '🏠 Fix Dead Links', '🍎 Git Init Shopping App', '🎾 Push 24 Commits'];
const INITIAL_IDEAS = ['🔐 Privacy & SSO Map', '💾 Mac Storage Miner', '🎬 DaVinci Slimmer', '🎙️ Podcast CRM', '🧊 3D Room Builder'];

export default function HomeTab({
  metrics,
  nutrition,
  onNavigate,
}: {
  metrics: BodyMetric[];
  nutrition: DailyNutrition[];
  onNavigate: (tab: string) => void;
}) {
  const [calItems, setCalItems] = useState<CalInputItem[]>(INITIAL_CAL_ITEMS);
  const [apps, setApps] = useState<AppItem[]>(INITIAL_APPS);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [tasks, setTasks] = useState<string[]>(INITIAL_TASKS);
  const [ideas, setIdeas] = useState<string[]>(INITIAL_IDEAS);
  const [taskIn, setTaskIn] = useState('');
  const [ideaIn, setIdeaIn] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingUrlId, setEditingUrlId] = useState<string | null>(null);
  const [customUrls, setCustomUrls] = useState<Record<string, string>>({});
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeUploadIdRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      setCustomUrls(loadLinkUrls());
      const savedDone = localStorage.getItem('agy_home_done_v5');
      if (savedDone) {
        const doneMap = JSON.parse(savedDone) as Record<string, { done: boolean }>;
        setCalItems((prev) =>
          prev.map((item) => (doneMap[item.id] ? { ...item, done: doneMap[item.id].done } : item))
        );
      }
      const savedDel = localStorage.getItem('agy_home_del_v5');
      if (savedDel) setDeletedIds(JSON.parse(savedDel));
      const savedMuted = localStorage.getItem('agy_home_muted_v5');
      if (savedMuted) {
        const mSet = new Set(JSON.parse(savedMuted) as string[]);
        setApps((prev) => prev.map((a) => ({ ...a, muted: mSet.has(a.id) })));
      }
      const savedTasks = localStorage.getItem('agy_home_tasks_v5');
      if (savedTasks) setTasks(JSON.parse(savedTasks));
      const savedIdeas = localStorage.getItem('agy_home_ideas_v5');
      if (savedIdeas) setIdeas(JSON.parse(savedIdeas));
    } catch {
      // ignore
    }
  }, []);

  const notify = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg((cur) => (cur === msg ? null : cur)), 3200);
  };

  const toggleQuest = (id: string) => {
    setCalItems((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, done: !c.done } : c));
      const map: Record<string, { done: boolean }> = {};
      next.forEach((x) => {
        map[x.id] = { done: x.done };
      });
      try {
        localStorage.setItem('agy_home_done_v5', JSON.stringify(map));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleIngestFile = async (questId: string, content: string, filename: string) => {
    const targetItem = calItems.find((c) => c.id === questId);
    if (supabase && targetItem) {
      await supabase
        .from('lifeplan_kv')
        .upsert({
          key: `hub_ingest_${targetItem.kvKey}`,
          data: { filename, rows: content.split(/\r?\n/).filter(Boolean).length, updatedAt: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        })
        .then();
    }
    if (targetItem && !targetItem.done) {
      toggleQuest(targetItem.id);
    }
    notify(`✓ ${filename} → ${targetItem?.targetApp ?? 'App'} へ取込完了`);
  };

  // CSVボタン表示用：期限到来(遅れ＆今日)を目立たせ、未来(未到来)や完了はグレー化
  const sortedCsvButtons = useMemo(() => {
    return [...calItems].sort((a, b) => {
      const aScore = a.done ? 3 : a.day < TODAY ? 0 : a.day === TODAY ? 1 : 2;
      const bScore = b.done ? 3 : b.day < TODAY ? 0 : b.day === TODAY ? 1 : 2;
      if (aScore !== bScore) return aScore - bScore;
      return a.day - b.day;
    });
  }, [calItems]);

  const overdueCount = calItems.filter((c) => !c.done && c.day < TODAY).length;
  const dueTodayCount = calItems.filter((c) => !c.done && c.day === TODAY).length;
  const doneCount = calItems.filter((c) => c.done).length;
  const progressPct = Math.round((doneCount / calItems.length) * 100);

  const visibleApps = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return apps
      .filter((a) => !deletedIds.includes(a.id))
      .filter((a) => (!q ? true : a.name.toLowerCase().includes(q)))
      .sort((a, b) => (a.muted ? 1 : 0) - (b.muted ? 1 : 0) || b.score - a.score);
  }, [apps, deletedIds, searchQuery]);

  const savedMB = apps
    .filter((a) => deletedIds.includes(a.id) || a.muted)
    .reduce((s, a) => s + a.mb, 0);

  return (
    <div className="space-y-4 text-xs" style={{ color: 'var(--text)' }}>
      {toastMsg && (
        <div
          className="fixed bottom-4 right-4 z-50 px-3.5 py-2 rounded-lg border-2 font-bold shadow-xl"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--zelda-gold)', color: 'var(--text)' }}
        >
          {toastMsg}
        </div>
      )}

      {/* Hidden shared file input for one-click CSV buttons */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.tsv,.json,.txt"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          const qId = activeUploadIdRef.current;
          if (file && qId) {
            await handleIngestFile(qId, await file.text(), file.name);
            e.target.value = '';
          }
        }}
      />

      {/* ROW 1: 期限別 CSV/データ取込ボタンバー (期限到来=強調 / 遅れ=赤太枠 / 未来・完了=グレー) */}
      <div
        className="p-3 rounded-lg border space-y-2.5 shadow-sm"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-sm font-black">📥 データ取込 &amp; 漏れチェック</span>
            {overdueCount > 0 && (
              <span
                className="px-2 py-0.5 rounded font-black text-[11px] border"
                style={{ background: 'rgba(239,68,68,0.2)', borderColor: 'var(--f1-soft)', color: 'var(--f1-soft)' }}
              >
                🚨 期限遅れ {overdueCount}件
              </span>
            )}
            {dueTodayCount > 0 && (
              <span
                className="px-2 py-0.5 rounded font-black text-[11px] border"
                style={{ background: 'rgba(217,168,78,0.2)', borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)' }}
              >
                ⚡ 今日が期限 {dueTodayCount}件
              </span>
            )}
            <span
              className="px-2 py-0.5 rounded font-bold text-[11px] border"
              style={{ borderColor: 'var(--zelda-zonai)', color: 'var(--zelda-zonai)' }}
            >
              ✓ 完了 {doneCount}/{calItems.length} ({progressPct}%)
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
            {metrics.length > 0 && metrics[metrics.length - 1].weight != null && (
              <span>⚖️ {metrics[metrics.length - 1].weight?.toFixed(1)}kg</span>
            )}
            {nutrition.length > 0 && (
              <span>🍽️ {Math.round(nutrition[nutrition.length - 1].totalCalories)}kcal</span>
            )}
          </div>
        </div>

        {/* All CSV / Input Action Buttons (Overdue = Red Highlight, Today = Gold Highlight, Future/Done = Gray) */}
        <div className="flex flex-wrap items-center gap-2">
          {sortedCsvButtons.map((item) => {
            const isOverdue = !item.done && item.day < TODAY;
            const isToday = !item.done && item.day === TODAY;
            const isFutureOrDone = item.done || item.day > TODAY;

            return (
              <div
                key={item.id}
                className={`flex items-center rounded-lg border-2 overflow-hidden transition ${
                  isFutureOrDone ? 'gray-done' : isOverdue ? 'shadow-md' : ''
                }`}
                style={{
                  background: isOverdue
                    ? 'rgba(239,68,68,0.18)'
                    : isToday
                    ? 'rgba(217,168,78,0.2)'
                    : 'var(--bg-card2)',
                  borderColor: isOverdue
                    ? 'var(--f1-soft)'
                    : isToday
                    ? 'var(--zelda-gold)'
                    : 'var(--border)',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    activeUploadIdRef.current = item.id;
                    fileInputRef.current?.click();
                  }}
                  title={`${item.targetApp} へCSVを取り込む`}
                  className="px-2.5 py-1.5 flex items-center gap-1.5 font-extrabold text-xs hover:opacity-80"
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                  <span
                    className="text-[10px] font-bold"
                    style={{
                      color: isOverdue ? 'var(--f1-soft)' : isToday ? 'var(--zelda-gold)' : 'var(--text-muted)',
                    }}
                  >
                    {item.done
                      ? '✓済'
                      : isOverdue
                      ? `🚨11/${item.day}遅`
                      : isToday
                      ? '⚡今日'
                      : `11/${item.day}`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleQuest(item.id)}
                  title={item.done ? '未完了に戻す' : '手動で完了(グレー)にする'}
                  className="px-2 py-1.5 border-l text-[11px] font-black hover:bg-black/15"
                  style={{ borderColor: 'var(--border)' }}
                >
                  {item.done ? '↩' : '✓'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ROW 2: FULL-WIDTH LARGE NOVEMBER CALENDAR (12 cols) */}
      <div
        className="p-3.5 rounded-lg border space-y-2.5 shadow-sm"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-black">📅 2026年11月 インプットカレンダー</h2>
          <div className="flex items-center gap-3 text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
            <span>🚨 赤枠＝期限遅れ</span>
            <span>⚡ 金枠＝今日期限</span>
            <span>⚪ グレー＝完了・期限前</span>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2 text-center text-xs font-extrabold" style={{ color: 'var(--text-muted)' }}>
          <span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span><span>日</span>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={`b-${idx}`}
              className="rounded-lg border min-h-[76px] opacity-15"
              style={{ borderStyle: 'dashed', borderColor: 'var(--border)' }}
            />
          ))}
          {Array.from({ length: 30 }).map((_, idx) => {
            const d = idx + 1;
            const items = calItems.filter((c) => c.day === d);
            const hasOverdue = items.some((c) => !c.done && d < TODAY);
            const hasTodayDue = items.some((c) => !c.done && d === TODAY);
            const allDone = items.length > 0 && items.every((c) => c.done);
            const isFutureOnly = items.length > 0 && d > TODAY && !allDone;

            return (
              <div
                key={d}
                className={`p-2 rounded-lg border-2 min-h-[76px] flex flex-col justify-between transition ${
                  allDone ? 'gray-done' : isFutureOnly ? 'opacity-60' : ''
                }`}
                style={{
                  background: hasOverdue
                    ? 'rgba(239,68,68,0.12)'
                    : hasTodayDue
                    ? 'rgba(217,168,78,0.12)'
                    : 'var(--bg-card2)',
                  borderColor:
                    d === TODAY
                      ? 'var(--zelda-gold)'
                      : hasOverdue
                      ? 'var(--f1-soft)'
                      : 'var(--border)',
                }}
              >
                <div
                  className="flex justify-between items-center text-[11px] font-black"
                  style={{ color: d === TODAY ? 'var(--zelda-gold)' : hasOverdue ? 'var(--f1-soft)' : 'var(--text-muted)' }}
                >
                  <span>
                    11/{d}
                    {d === TODAY ? ' (今日)' : ''}
                  </span>
                  <span>{allDone ? '✓' : hasOverdue ? '🚨' : hasTodayDue ? '⚡' : ''}</span>
                </div>
                <div className="space-y-1 mt-1">
                  {items.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => toggleQuest(it.id)}
                      className={`w-full text-left text-[11px] font-extrabold px-1.5 py-1 rounded truncate ${
                        it.done ? 'line-through opacity-50' : ''
                      }`}
                      style={{
                        background: it.done
                          ? 'rgba(0,0,0,0.2)'
                          : it.day < TODAY
                          ? 'rgba(239,68,68,0.3)'
                          : it.day === TODAY
                          ? 'rgba(217,168,78,0.3)'
                          : 'rgba(255,255,255,0.06)',
                        borderLeft: `3px solid ${
                          it.done
                            ? 'var(--border)'
                            : it.day < TODAY
                            ? 'var(--f1-soft)'
                            : it.day === TODAY
                            ? 'var(--zelda-gold)'
                            : 'var(--text-muted)'
                        }`,
                      }}
                    >
                      {it.done ? '✓ ' : ''}
                      {it.icon} {it.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ROW 3: ALL 14 WEB & LOCAL APPS (NO HEIGHT CAP — ALL VISIBLE AT ONCE, WIDER SPACING) */}
      <div
        className="p-3.5 rounded-lg border space-y-2.5 shadow-sm"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-black">🕹️ All 14 Apps Launcher &amp; Ranking</h2>
            <span className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
              全アプリ一覧（クリックで直接アクセス）
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-black" style={{ color: 'var(--zelda-gold)' }}>
              🧹 Reclaimable: {(savedMB / 1024).toFixed(2)}GB
            </span>
            {deletedIds.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setDeletedIds([]);
                  localStorage.setItem('agy_home_del_v5', '[]');
                }}
                className="px-2 py-1 rounded text-[11px] font-bold border"
                style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
              >
                ↩ Restore
              </button>
            )}
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 Search app..."
              className="px-2.5 py-1 rounded border text-xs w-44"
              style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-left text-xs border-collapse">
            <thead style={{ background: '#212823', color: '#e4dac6' }}>
              <tr>
                <th className="py-2.5 px-3">App (Click to Open)</th>
                <th className="py-2.5 px-3">Score</th>
                <th className="py-2.5 px-3">Visit / Dwell</th>
                <th className="py-2.5 px-3">🎨 Design</th>
                <th className="py-2.5 px-3">Buttons (Live/Dead)</th>
                <th className="py-2.5 px-3">Size</th>
                <th className="py-2.5 px-3">Access &amp; Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {visibleApps.map((a, idx) => {
                const effectiveUrl = customUrls[a.id] ?? a.url;
                const isEditing = editingUrlId === a.id;
                return (
                  <tr key={a.id} className={a.muted ? 'gray-done' : 'hover:bg-[var(--bg-card2)]'} style={{ background: 'var(--bg-card)' }}>
                    <td className="py-2.5 px-3 font-black whitespace-nowrap">
                      {isEditing ? (
                        <input
                          autoFocus
                          defaultValue={effectiveUrl}
                          placeholder="https://... or http://localhost:..."
                          onBlur={(e) => {
                            const val = e.target.value.trim();
                            saveLinkUrl(a.id, val);
                            setCustomUrls(loadLinkUrls());
                            setEditingUrlId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                          }}
                          className="px-2 py-1 rounded border text-xs w-56"
                          style={{ background: 'var(--bg-card2)', borderColor: 'var(--zelda-gold)' }}
                        />
                      ) : a.internalTab ? (
                        <button
                          type="button"
                          onClick={() => onNavigate(a.internalTab!)}
                          className="hover:underline text-left font-black flex items-center gap-1.5"
                        >
                          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>#{idx + 1}</span>
                          <span>{a.icon}</span>
                          <span>{a.name}</span>
                        </button>
                      ) : effectiveUrl ? (
                        <a href={effectiveUrl} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1.5">
                          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>#{idx + 1}</span>
                          <span>{a.icon}</span>
                          <span>{a.name}</span>
                          <span style={{ color: 'var(--zelda-gold)' }}>↗</span>
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(a.localPath).catch(() => {});
                            notify(`📋 Copied path: ${a.localPath}`);
                          }}
                          title={`Copy path: ${a.localPath}`}
                          className="hover:underline text-left flex items-center gap-1.5"
                        >
                          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>#{idx + 1}</span>
                          <span>{a.icon}</span>
                          <span>{a.name}</span>
                          <span>📋</span>
                        </button>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-black tabular-nums" style={{ color: 'var(--zelda-gold)' }}>
                      {a.score}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">{a.visit}</td>
                    <td className="py-2.5 px-3 font-bold tabular-nums" style={{ color: 'var(--zelda-cyan)' }}>
                      {a.design}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap tabular-nums">{a.btnLabel}</td>
                    <td className="py-2.5 px-3 font-bold whitespace-nowrap tabular-nums">{a.sizeLabel}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {a.internalTab ? (
                          <button
                            type="button"
                            onClick={() => onNavigate(a.internalTab!)}
                            className="px-2.5 py-1 rounded border font-bold"
                            style={{ borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)' }}
                          >
                            Open
                          </button>
                        ) : effectiveUrl ? (
                          <a
                            href={effectiveUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 rounded border font-bold"
                            style={{ borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)' }}
                          >
                            Open ↗
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(a.localPath).catch(() => {});
                              notify(`📋 Copied: ${a.localPath}`);
                            }}
                            className="px-2.5 py-1 rounded border font-bold"
                            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                          >
                            Path
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditingUrlId(a.id)}
                          title="Edit App URL"
                          className="px-2 py-1 rounded border"
                          style={{ borderColor: 'var(--border)' }}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const next = apps.map((x) => (x.id === a.id ? { ...x, muted: !x.muted } : x));
                            setApps(next);
                            localStorage.setItem(
                              'agy_home_muted_v5',
                              JSON.stringify(next.filter((x) => x.muted).map((x) => x.id))
                            );
                          }}
                          title="Mute / Dormant"
                          className="px-2 py-1 rounded border"
                          style={{ borderColor: 'var(--border)' }}
                        >
                          {a.muted ? '↩' : '👁️'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const nextDel = [...deletedIds, a.id];
                            setDeletedIds(nextDel);
                            localStorage.setItem('agy_home_del_v5', JSON.stringify(nextDel));
                            notify(`🔥 Removed ${a.name} from active launcher`);
                          }}
                          title="Delete from launcher"
                          className="px-2 py-1 rounded border font-bold"
                          style={{ borderColor: 'var(--f1-soft)', color: 'var(--f1-soft)' }}
                        >
                          🔥
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ROW 4: NEXT TASKS & NEW APP IDEAS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
        <div
          className="p-2.5 rounded-lg border flex items-center justify-between gap-2"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap font-bold">
            {tasks.map((t, i) => (
              <span
                key={`${t}-${i}`}
                className="px-2 py-0.5 rounded border flex items-center gap-1"
                style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
              >
                <span>🛠️{t}</span>
                <button
                  type="button"
                  onClick={() => {
                    const next = tasks.filter((_, idx) => idx !== i);
                    setTasks(next);
                    localStorage.setItem('agy_home_tasks_v5', JSON.stringify(next));
                  }}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!taskIn.trim()) return;
              const next = [taskIn.trim(), ...tasks];
              setTasks(next);
              setTaskIn('');
              localStorage.setItem('agy_home_tasks_v5', JSON.stringify(next));
            }}
            className="flex gap-1 flex-shrink-0"
          >
            <input
              type="text"
              value={taskIn}
              onChange={(e) => setTaskIn(e.target.value)}
              placeholder="＋Next task"
              className="w-28 px-2 py-0.5 rounded border"
              style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
            />
            <button
              type="submit"
              className="px-2 py-0.5 rounded font-bold border"
              style={{ borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)' }}
            >
              ＋
            </button>
          </form>
        </div>

        <div
          className="p-2.5 rounded-lg border flex items-center justify-between gap-2"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap font-bold">
            {ideas.map((idea, i) => (
              <span
                key={`${idea}-${i}`}
                className="px-2 py-0.5 rounded border flex items-center gap-1"
                style={{ background: 'var(--bg-card2)', borderColor: 'var(--zelda-cyan)' }}
              >
                <span>{idea}</span>
                <button
                  type="button"
                  onClick={() => {
                    const next = ideas.filter((_, idx) => idx !== i);
                    setIdeas(next);
                    localStorage.setItem('agy_home_ideas_v5', JSON.stringify(next));
                  }}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!ideaIn.trim()) return;
              const next = [`🚀${ideaIn.trim()}`, ...ideas];
              setIdeas(next);
              setIdeaIn('');
              localStorage.setItem('agy_home_ideas_v5', JSON.stringify(next));
            }}
            className="flex gap-1 flex-shrink-0"
          >
            <input
              type="text"
              value={ideaIn}
              onChange={(e) => setIdeaIn(e.target.value)}
              placeholder="＋New app"
              className="w-28 px-2 py-0.5 rounded border"
              style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
            />
            <button
              type="submit"
              className="px-2 py-0.5 rounded font-bold border"
              style={{ borderColor: 'var(--zelda-cyan)', color: 'var(--zelda-cyan)' }}
            >
              ＋
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
