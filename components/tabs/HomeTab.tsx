'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { loadLinkUrls, saveLinkUrl } from '@/data/links';
import type { BodyMetric, DailyNutrition } from '@/types';

interface CalInputItem {
  id: string;
  day: number;
  gpId: string;
  icon: string;
  label: string;
  targetApp: string;
  onTime?: boolean | null;
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

const TODAY = 23; // 2026-11-23 (月)

const INITIAL_CAL_ITEMS: CalInputItem[] = [
  { id: 'c1', day: 14, gpId: 'gp-lv', icon: '🏢', label: 'Q2 IR', targetApp: 'Money & Assets', done: true, onTime: true },
  { id: 'q1', day: 21, gpId: 'gp-lv', icon: '🏢', label: 'Q3 IR', targetApp: 'Money & Assets', done: false, onTime: null },
  { id: 'q2', day: 22, gpId: 'gp-lv', icon: '📈', label: 'Econ 11', targetApp: 'Money & Assets', done: true, onTime: true },
  { id: 'q3', day: 23, gpId: 'gp-qat', icon: '🍎', label: 'Shopping CSV', targetApp: 'Shopping & Items', done: false, onTime: null },
  { id: 'q4', day: 25, gpId: 'gp-qat', icon: '🔥', label: 'Habits CSV', targetApp: 'Life Dashboard', done: false, onTime: null },
  { id: 'q5', day: 28, gpId: 'gp-qat', icon: '💰', label: 'NISA Assets', targetApp: 'Money & Assets', done: false, onTime: null },
  { id: 'q6', day: 29, gpId: 'gp-qat', icon: '💳', label: 'MF Budget', targetApp: 'Money & Assets', done: false, onTime: null },
  { id: 'q7', day: 30, gpId: 'gp-abu', icon: '📚', label: 'Books CSV', targetApp: 'Life Dashboard', done: false, onTime: null },
];

const RACE_DAYS: Record<number, string> = {
  15: '🇧🇷Brazil',
  22: '🇺🇸Vegas',
  29: '🇶🇦Qatar',
};

const GP_ROUNDS = [
  {
    id: 'gp-lv',
    flag: '🇺🇸',
    short: '11/22 Vegas',
    rival: 'LEC',
    path: 'M 75,25 L 32,25 L 25,52 L 55,58 L 95,38 L 145,38 L 155,65 L 185,68 L 228,45 L 232,92 L 42,92 L 42,72 L 75,25 Z',
  },
  {
    id: 'gp-qat',
    flag: '🇶🇦',
    short: '11/29 Qatar',
    rival: 'PIA',
    path: 'M 35,88 L 215,88 L 228,58 L 185,45 L 198,20 L 145,25 L 125,52 L 95,22 L 55,28 L 72,58 L 35,62 L 35,88 Z',
  },
  {
    id: 'gp-abu',
    flag: '🇦🇪',
    short: '12/06 AbuDhabi',
    rival: 'VER',
    path: 'M 85,25 L 45,25 L 22,18 L 32,88 L 175,88 L 228,72 L 218,38 L 175,42 L 172,62 L 135,58 L 125,32 L 85,25 Z',
  },
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
  const [selectedGpId, setSelectedGpId] = useState<string>('gp-qat');
  const [standMsg, setStandMsg] = useState<string>('期日内完了で順位UP!');
  const [apps, setApps] = useState<AppItem[]>(INITIAL_APPS);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [tasks, setTasks] = useState<string[]>(INITIAL_TASKS);
  const [ideas, setIdeas] = useState<string[]>(INITIAL_IDEAS);
  const [taskIn, setTaskIn] = useState('');
  const [ideaIn, setIdeaIn] = useState('');
  const [csvTarget, setCsvTarget] = useState('q3');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingUrlId, setEditingUrlId] = useState<string | null>(null);
  const [customUrls, setCustomUrls] = useState<Record<string, string>>({});
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // SVG path geometry state (calculated safely on client)
  const basePathRef = useRef<SVGPathElement | null>(null);
  const [svgCoords, setSvgCoords] = useState({
    len: 500,
    sx: 75,
    sy: 25,
    px: 75,
    py: 25,
    rx: 180,
    ry: 68,
  });

  // Load persisted state from localStorage
  useEffect(() => {
    try {
      setCustomUrls(loadLinkUrls());
      const savedDone = localStorage.getItem('agy_home_done_v5');
      if (savedDone) {
        const doneMap = JSON.parse(savedDone) as Record<string, { done: boolean; onTime?: boolean | null }>;
        setCalItems((prev) =>
          prev.map((item) => (doneMap[item.id] ? { ...item, done: doneMap[item.id].done, onTime: doneMap[item.id].onTime } : item))
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
      // ignore storage errors
    }
  }, []);

  const notify = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg((cur) => (cur === msg ? null : cur)), 3200);
  };

  const getGpProgress = (gpId: string) => {
    const qs = calItems.filter((c) => c.gpId === gpId);
    return qs.length ? qs.filter((c) => c.done).length / qs.length : 1;
  };

  const isGpCleared = (gpId: string) => getGpProgress(gpId) >= 1;

  const isGpUnlocked = (idx: number) => {
    if (idx === 0) return true;
    for (let i = 0; i < idx; i++) {
      if (!isGpCleared(GP_ROUNDS[i].id)) return false;
    }
    return true;
  };

  // Calculate Championship Rank, Points & Missing/Overdue Items
  const { pts, overdueItems, dueTodayItems, rank, drivers } = useMemo(() => {
    let score = 320;
    const overdueList: CalInputItem[] = [];
    const todayList: CalInputItem[] = [];

    calItems.forEach((c) => {
      if (c.done) {
        score += c.onTime ? 25 : 8;
      } else if (c.day < TODAY) {
        overdueList.push(c);
        score -= (TODAY - c.day) * 10;
      } else if (c.day === TODAY) {
        todayList.push(c);
      }
    });
    score += deletedIds.length * 8;

    const list = [
      { name: '🚙FORESTER', pts: score, you: true },
      { name: '🇳🇱VER', pts: 393, you: false },
      { name: '🇬🇧NOR', pts: 374, you: false },
      { name: '🇲🇨LEC', pts: 356, you: false },
      { name: '🇦🇺PIA', pts: 318, you: false },
      { name: '🇯🇵TSU', pts: 145, you: false },
    ].sort((a, b) => b.pts - a.pts);

    return {
      pts: score,
      overdueItems: overdueList,
      dueTodayItems: todayList,
      rank: list.findIndex((d) => d.you) + 1,
      drivers: list,
    };
  }, [calItems, deletedIds]);

  const selGp = GP_ROUNDS.find((g) => g.id === selectedGpId) ?? GP_ROUNDS[1];
  const selUnlocked = isGpUnlocked(GP_ROUNDS.indexOf(selGp));
  const selProg = selUnlocked ? getGpProgress(selGp.id) : 0;
  const selPct = Math.round(selProg * 100);

  // Recalculate SVG GPS coordinates when selected GP or progress changes
  useEffect(() => {
    const pathEl = basePathRef.current;
    if (!pathEl) return;
    try {
      const len = pathEl.getTotalLength() || 500;
      const sPt = pathEl.getPointAtLength(0);
      const pPt = pathEl.getPointAtLength(selProg >= 1 ? len * 0.99 : Math.max(8, len * selProg));
      const rPt = pathEl.getPointAtLength(len * 0.68);
      setSvgCoords({
        len,
        sx: sPt.x,
        sy: sPt.y,
        px: pPt.x,
        py: pPt.y,
        rx: rPt.x,
        ry: rPt.y,
      });
    } catch {
      // ignore SVG errors
    }
  }, [selGp.id, selProg]);

  const toggleQuest = (id: string) => {
    setCalItems((prev) => {
      const next = prev.map((c) => {
        if (c.id !== id) return c;
        const nextDone = !c.done;
        const onTime = nextDone ? c.day >= TODAY : null;
        setStandMsg(nextDone ? (onTime ? '🟢 +25pt 順位UP!' : '⚠️ 遅延回収 +8pt') : '↩ 未実施');
        setSelectedGpId(c.gpId);
        return { ...c, done: nextDone, onTime };
      });
      const map: Record<string, { done: boolean; onTime?: boolean | null }> = {};
      next.forEach((x) => {
        map[x.id] = { done: x.done, onTime: x.onTime };
      });
      try {
        localStorage.setItem('agy_home_done_v5', JSON.stringify(map));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleIngest = async (content: string, filename: string) => {
    const targetItem = calItems.find((c) => c.id === csvTarget);
    if (supabase) {
      await supabase
        .from('lifeplan_kv')
        .upsert({
          key: `hub_ingest_${csvTarget}`,
          data: { filename, rows: content.split(/\r?\n/).filter(Boolean).length, updatedAt: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        })
        .then();
    }
    if (targetItem && !targetItem.done) {
      toggleQuest(targetItem.id);
    }
    notify(`🟣 ${filename} をSupabase経由で別アプリへ反映しました！`);
  };

  const nextRace = GP_ROUNDS.find((g, idx) => !isGpCleared(g.id) && isGpUnlocked(idx)) ?? GP_ROUNDS[1];
  const remForNextRace = calItems.filter((c) => c.gpId === nextRace.id && !c.done).length;

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

  const missingAlerts = [...overdueItems, ...dueTodayItems];

  return (
    <div className="space-y-2.5 text-xs" style={{ color: 'var(--text)' }}>
      {toastMsg && (
        <div
          className="fixed bottom-4 right-4 z-50 px-3.5 py-2 rounded-lg border-2 font-bold shadow-xl"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--f1-purple)', color: 'var(--text)' }}
        >
          {toastMsg}
        </div>
      )}

      {/* ROW 1: TOP BAR (FORESTER + RANK + MISSING ITEMS LIST + CSV INGEST) */}
      <div
        className="flex flex-col gap-2 px-3 py-2 rounded-lg border shadow-sm"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', borderLeft: '4px solid var(--car-color)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-xs flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full border border-white/70" style={{ background: '#7c858e' }} />
              🚙 FORESTER
            </span>
            <span
              className="px-2 py-0.5 rounded font-black text-[11px] border"
              style={{ borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)' }}
            >
              P{rank} · {pts}pt
            </span>
            <span
              className="px-2 py-0.5 rounded font-black text-[11px] border"
              style={{ borderColor: 'var(--f1-soft)', color: 'var(--f1-soft)' }}
            >
              🏁 {nextRace.short}まで残{remForNextRace}件
            </span>
            {metrics.length > 0 && metrics[metrics.length - 1].weight != null && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold border" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                ⚖️ {metrics[metrics.length - 1].weight?.toFixed(1)}kg
              </span>
            )}
            {nutrition.length > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold border" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                🍽️ {Math.round(nutrition[nutrition.length - 1].totalCalories)}kcal
              </span>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleIngest('quick_sync=1', 'quick.csv');
            }}
            className="flex items-center gap-1 flex-wrap"
          >
            <select
              value={csvTarget}
              onChange={(e) => setCsvTarget(e.target.value)}
              aria-label="Target App"
              className="px-1.5 py-0.5 rounded text-[10.5px] font-bold border"
              style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
            >
              <option value="q3">🍎 Shopping CSV → Shopping & Items</option>
              <option value="q4">🔥 Habits CSV → Life Dashboard</option>
              <option value="q5">💰 NISA → Money & Assets</option>
              <option value="q6">💳 MF Budget → Money & Assets</option>
              <option value="q1">🏢 Q3 IR → Money & Assets</option>
            </select>
            <label
              className="px-2 py-0.5 rounded text-[10.5px] font-bold border cursor-pointer"
              style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
            >
              📂CSV
              <input
                type="file"
                accept=".csv,.tsv,.json,.txt"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    await handleIngest(await file.text(), file.name);
                    e.target.value = '';
                  }
                }}
              />
            </label>
            <button
              type="submit"
              className="px-2 py-0.5 rounded text-[10.5px] font-black border"
              style={{ borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)' }}
            >
              ⚡取込
            </button>
          </form>
        </div>

        {/* MISSING / OVERDUE INPUTS ICON LIST AT TOP */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
          <span className="text-[10px] font-black" style={{ color: missingAlerts.length > 0 ? 'var(--f1-soft)' : 'var(--zelda-zonai)' }}>
            {missingAlerts.length > 0 ? '🚨 漏れ・要対応:' : '✨ 漏れなし:'}
          </span>
          {missingAlerts.length === 0 ? (
            <span className="text-[10px] font-bold" style={{ color: 'var(--zelda-zonai)' }}>
              すべて完了済み（遅延ゼロ）
            </span>
          ) : (
            missingAlerts.map((item) => {
              const isLate = item.day < TODAY;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleQuest(item.id)}
                  title="クリックで完了グレー化"
                  className="px-2 py-0.5 rounded text-[10px] font-extrabold border flex items-center gap-1 transition hover:opacity-80"
                  style={{
                    background: isLate ? 'rgba(239,68,68,0.22)' : 'rgba(111,176,135,0.2)',
                    borderColor: isLate ? 'var(--f1-soft)' : 'var(--zelda-zonai)',
                    color: 'var(--text)',
                  }}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                  <span style={{ color: isLate ? 'var(--f1-soft)' : 'var(--zelda-zonai)' }}>
                    {isLate ? `11/${item.day} (-${(TODAY - item.day) * 10}pt)` : '今日 (+25pt)'}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ROW 2: CALENDAR CENTER (8 cols) + CLEAN SVG CIRCUIT MAP & STANDINGS (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5">
        {/* LEFT: November Calendar */}
        <div className="lg:col-span-8 p-2.5 rounded-lg border space-y-1.5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between text-[11px] font-black">
            <span>📅 2026年11月 インプット＆F1レースカレンダー</span>
            <span className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>
              🚨遅れ(減点) ｜ 🟢期日内(+25pt) ｜ ⚪完了グレー
            </span>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[9.5px] font-bold" style={{ color: 'var(--text-muted)' }}>
            <span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span><span>日(🏁決勝)</span>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={`b-${idx}`} className="rounded border min-h-[42px] opacity-15" style={{ borderStyle: 'dashed', borderColor: 'var(--border)' }} />
            ))}
            {Array.from({ length: 30 }).map((_, idx) => {
              const d = idx + 1;
              const items = calItems.filter((c) => c.day === d);
              const raceTag = RACE_DAYS[d];
              const hasOverdue = items.some((c) => !c.done && d < TODAY);
              const allDone = items.length > 0 && items.every((c) => c.done);
              return (
                <div
                  key={d}
                  className={`p-1 rounded border min-h-[44px] flex flex-col justify-between ${allDone ? 'gray-done' : ''}`}
                  style={{
                    background: 'var(--bg-card2)',
                    borderColor:
                      d === TODAY
                        ? 'var(--zelda-gold)'
                        : hasOverdue
                        ? 'var(--f1-soft)'
                        : raceTag
                        ? 'var(--f1-purple)'
                        : 'var(--border)',
                  }}
                >
                  <div className="flex justify-between text-[9px] font-bold" style={{ color: d === TODAY ? 'var(--zelda-gold)' : 'var(--text-muted)' }}>
                    <span>
                      {d}
                      {d === TODAY ? '今日' : ''}
                    </span>
                    <span>{raceTag ?? ''}</span>
                  </div>
                  <div className="space-y-0.5">
                    {items.map((it) => (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => toggleQuest(it.id)}
                        className={`w-full text-left text-[8.5px] font-extrabold px-1 rounded truncate ${it.done ? 'line-through opacity-50' : ''}`}
                        style={{
                          background: it.done
                            ? 'rgba(0,0,0,0.2)'
                            : it.day < TODAY
                            ? 'rgba(239,68,68,0.32)'
                            : 'rgba(111,176,135,0.24)',
                          borderLeft: `2px solid ${it.done ? 'var(--border)' : it.day < TODAY ? 'var(--f1-soft)' : 'var(--zelda-zonai)'}`,
                        }}
                      >
                        {it.done ? '✓' : '●'}
                        {it.icon}
                        {it.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Clean SVG Circuit Map + Standings */}
        <div
          className="lg:col-span-4 p-2.5 rounded-lg border flex flex-col justify-between gap-2"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="grid grid-cols-3 gap-1">
            {GP_ROUNDS.map((g, idx) => {
              const pct = Math.round(getGpProgress(g.id) * 100);
              const unlocked = isGpUnlocked(idx);
              const isSel = selectedGpId === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setSelectedGpId(g.id)}
                  className={`p-1 rounded border text-center ${pct === 100 ? 'gray-done' : !unlocked ? 'opacity-40' : ''}`}
                  style={{ background: 'var(--bg)', borderColor: isSel ? 'var(--zelda-gold)' : 'var(--border)' }}
                >
                  <div className="text-[9.5px] font-black truncate">
                    {g.flag}
                    {g.short.split(' ')[1]}
                  </div>
                  <div className="text-[9px] font-bold" style={{ color: pct === 100 ? 'var(--zelda-zonai)' : unlocked ? 'var(--zelda-gold)' : 'var(--text-muted)' }}>
                    {pct === 100 ? '🏁完' : unlocked ? `${pct}%` : '🔒'}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rounded-lg border p-2 flex flex-col items-center gap-1" style={{ background: '#181512', borderColor: 'var(--border)' }}>
            <div className="w-full flex items-center justify-between text-[10.5px] font-black">
              <span style={{ color: 'var(--zelda-gold)' }}>
                {selGp.flag} {selGp.short}
              </span>
              <span style={{ color: 'var(--f1-purple)' }}>{selUnlocked ? `${selPct}%` : '🔒LOCK'}</span>
            </div>
            <svg viewBox="0 0 260 110" className="w-full h-24 overflow-visible">
              <path
                ref={basePathRef}
                d={selGp.path}
                fill="none"
                stroke="#3f3831"
                strokeWidth="7.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={selGp.path}
                fill="none"
                stroke="#8b959e"
                strokeWidth="5.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  strokeDasharray: svgCoords.len,
                  strokeDashoffset: svgCoords.len * (1 - selProg),
                }}
              />
              <circle cx={svgCoords.sx} cy={svgCoords.sy} r="4" fill="#fff" stroke="#000" strokeWidth="1.5" />
              <circle cx={svgCoords.rx} cy={svgCoords.ry} r="4.5" fill="#38bdf8" stroke="#000" strokeWidth="1.2" />
              <text x={svgCoords.rx + 6} y={svgCoords.ry + 3} fill="#38bdf8" fontSize="8" fontWeight="900">
                {selGp.rival}
              </text>
              <circle className="car-dot-you" cx={svgCoords.px} cy={svgCoords.py} r="6" fill="#8b959e" stroke="#fff" strokeWidth="1.8" />
              <text
                x={Math.min(210, Math.max(5, svgCoords.px - 15))}
                y={Math.max(12, svgCoords.py - 9)}
                fill="#fff"
                fontSize="8.5"
                fontWeight="900"
              >
                🚙YOU
              </text>
            </svg>
            <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden">
              <div
                className="h-full transition-all duration-300"
                style={{ width: `${selPct}%`, background: 'linear-gradient(90deg, #8b959e, var(--f1-purple))' }}
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-black">
              <span style={{ color: 'var(--zelda-gold)' }}>🏆 順位表</span>
              <span style={{ color: 'var(--zelda-zonai)' }}>{standMsg}</span>
            </div>
            <div className="grid grid-cols-2 gap-1 text-[9.5px] font-extrabold">
              {drivers.map((d, i) => (
                <div
                  key={d.name}
                  className="px-1.5 py-0.5 rounded border flex justify-between"
                  style={{
                    background: d.you ? 'rgba(139,149,158,0.28)' : 'var(--bg-card2)',
                    borderColor: d.you ? '#cbd5e1' : 'var(--border)',
                  }}
                >
                  <span>
                    P{i + 1} {d.name}
                  </span>
                  <span>{d.pts}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ROW 3: ALL 14 ENGLISH APPS LAUNCHER & RANKING TABLE */}
      <div className="p-2.5 rounded-lg border space-y-1.5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px] font-black">
          <span>🕹️ All 14 Apps Launcher & Ranking (Visit/Dwell · Design · Freshness · Security · Buttons · Size)</span>
          <div className="flex items-center gap-1.5">
            <span style={{ color: 'var(--zelda-gold)' }}>🧹 Reclaimable: {(savedMB / 1024).toFixed(2)}GB</span>
            {deletedIds.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setDeletedIds([]);
                  localStorage.setItem('agy_home_del_v5', '[]');
                }}
                className="px-1.5 py-0.5 rounded text-[9.5px] border"
                style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
              >
                ↩Restore
              </button>
            )}
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 Search app..."
              className="px-2 py-0.5 rounded border text-[10px]"
              style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
            />
          </div>
        </div>

        <div className="max-h-56 overflow-auto rounded border" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-left text-[10.5px] border-collapse">
            <thead style={{ background: '#212823', color: '#e4dac6' }} className="sticky top-0 z-10">
              <tr>
                <th className="p-1.5">App (Click to Open)</th>
                <th className="p-1.5">Score</th>
                <th className="p-1.5">Visit / Dwell</th>
                <th className="p-1.5">🎨Design</th>
                <th className="p-1.5">Buttons (Live/Dead)</th>
                <th className="p-1.5">Size</th>
                <th className="p-1.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {visibleApps.map((a, idx) => {
                const effectiveUrl = customUrls[a.id] ?? a.url;
                const isEditing = editingUrlId === a.id;
                return (
                  <tr key={a.id} className={a.muted ? 'gray-done' : ''} style={{ background: 'var(--bg-card)' }}>
                    <td className="p-1.5 font-black whitespace-nowrap">
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
                          className="px-1.5 py-0.5 rounded border text-[10px] w-48"
                          style={{ background: 'var(--bg-card2)', borderColor: 'var(--zelda-gold)' }}
                        />
                      ) : a.internalTab ? (
                        <button
                          type="button"
                          onClick={() => onNavigate(a.internalTab!)}
                          className="hover:underline text-left font-black"
                        >
                          #{idx + 1} {a.icon} {a.name}
                        </button>
                      ) : effectiveUrl ? (
                        <a href={effectiveUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          #{idx + 1} {a.icon} {a.name} ↗
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(a.localPath).catch(() => {});
                            notify(`📋 Copied path: ${a.localPath}`);
                          }}
                          title={`Copy path: ${a.localPath}`}
                          className="hover:underline text-left"
                        >
                          #{idx + 1} {a.icon} {a.name} 📋
                        </button>
                      )}
                    </td>
                    <td className="p-1.5 font-black" style={{ color: 'var(--zelda-gold)' }}>
                      {a.score}
                    </td>
                    <td className="p-1.5 whitespace-nowrap">{a.visit}</td>
                    <td className="p-1.5 font-bold" style={{ color: 'var(--zelda-cyan)' }}>
                      {a.design}
                    </td>
                    <td className="p-1.5 whitespace-nowrap">{a.btnLabel}</td>
                    <td className="p-1.5 font-bold whitespace-nowrap">{a.sizeLabel}</td>
                    <td className="p-1.5 flex items-center gap-1 whitespace-nowrap">
                      {a.internalTab ? (
                        <button
                          type="button"
                          onClick={() => onNavigate(a.internalTab!)}
                          className="px-1.5 py-0.5 rounded border font-bold"
                          style={{ borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)' }}
                        >
                          Open
                        </button>
                      ) : effectiveUrl ? (
                        <a
                          href={effectiveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-1.5 py-0.5 rounded border font-bold"
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
                          className="px-1.5 py-0.5 rounded border font-bold"
                          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                        >
                          Path
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditingUrlId(a.id)}
                        title="Edit App URL"
                        className="px-1 py-0.5 rounded border"
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
                        className="px-1 py-0.5 rounded border"
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
                        className="px-1 py-0.5 rounded border font-bold"
                        style={{ borderColor: 'var(--f1-soft)', color: 'var(--f1-soft)' }}
                      >
                        🔥
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ROW 4: NEXT TASKS & NEW APP IDEAS (1-ROW PILLS) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-[10px]">
        <div
          className="p-2 rounded-lg border flex items-center justify-between gap-1.5"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap font-bold">
            {tasks.map((t, i) => (
              <span
                key={`${t}-${i}`}
                className="px-1.5 py-0.5 rounded border flex items-center gap-1"
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
              className="w-24 px-1.5 py-0.5 rounded border"
              style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
            />
            <button
              type="submit"
              className="px-1.5 py-0.5 rounded font-bold border"
              style={{ borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)' }}
            >
              ＋
            </button>
          </form>
        </div>

        <div
          className="p-2 rounded-lg border flex items-center justify-between gap-1.5"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap font-bold">
            {ideas.map((idea, i) => (
              <span
                key={`${idea}-${i}`}
                className="px-1.5 py-0.5 rounded border flex items-center gap-1"
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
              className="w-24 px-1.5 py-0.5 rounded border"
              style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
            />
            <button
              type="submit"
              className="px-1.5 py-0.5 rounded font-bold border"
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
