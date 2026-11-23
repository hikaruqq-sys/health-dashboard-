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

type AppSuite = 'money' | 'lifelog' | 'life' | 'other';
type WasteStatus = 'active' | 'underused' | 'wasted';

interface AppItem {
  id: string;
  suite: AppSuite;
  suiteLabel: string;
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
  lifelogView?: string;
  localPath: string;
  muted: boolean;
  wasteNote: string;
}

const TODAY = 23; // 2026-11-23
const TELEMETRY_KEY = 'agy_page_telemetry_v1';

const INITIAL_CAL_ITEMS: CalInputItem[] = [
  { id: 'c1', day: 14, icon: '🏢', label: 'Q2 IR', targetApp: 'Money: Stocks', kvKey: 'corp_q2', done: true },
  { id: 'q1', day: 21, icon: '🏢', label: 'Q3 IR', targetApp: 'Money: Stocks', kvKey: 'corp_q3', done: false },
  { id: 'q2', day: 22, icon: '🌐', label: 'Econ 11', targetApp: 'Money: Macro', kvKey: 'econ_nov', done: true },
  { id: 'q3', day: 23, icon: '🍎', label: 'Shopping CSV', targetApp: 'Lifelog: Pantry', kvKey: 'kaimono_w4', done: false },
  { id: 'q5', day: 28, icon: '📈', label: 'NISA Assets', targetApp: 'Money: Assets', kvKey: 'asset_nov', done: false },
  { id: 'q6', day: 29, icon: '🧾', label: 'MF Budget', targetApp: 'Money: Budget', kvKey: 'budget_nov', done: false },
  { id: 'q7', day: 30, icon: '📖', label: 'Books CSV', targetApp: 'Lifelog: Books', kvKey: 'books_nov', done: false },
];

const INITIAL_APPS: AppItem[] = [
  // ── 1. Money Dashboard (6 pages) ──
  {
    id: 'money-economics',
    suite: 'money',
    suiteLabel: 'Money',
    icon: '🌐',
    name: 'Money: Macro',
    score: 94,
    visit: '週3-4回・10分',
    visitScore: 93,
    design: 96,
    btnLabel: '28 / 死0',
    btnCount: 28,
    sizeLabel: '140MB',
    mb: 140,
    url: 'https://money-dashboard-iota-three.vercel.app/economics',
    localPath: '~/money-dashboard/app/economics',
    muted: false,
    wasteNote: '月移動カレンダー＋大型グラフ稼働中',
  },
  {
    id: 'money-assets',
    suite: 'money',
    suiteLabel: 'Money',
    icon: '📈',
    name: 'Money: Assets',
    score: 92,
    visit: '週2-3回・8分',
    visitScore: 90,
    design: 92,
    btnLabel: '22 / 死0',
    btnCount: 22,
    sizeLabel: '140MB',
    mb: 140,
    url: 'https://money-dashboard-iota-three.vercel.app/assets',
    localPath: '~/money-dashboard/app/assets',
    muted: false,
    wasteNote: 'NISA・投信残高トラッキング主力',
  },
  {
    id: 'money-budget',
    suite: 'money',
    suiteLabel: 'Money',
    icon: '🧾',
    name: 'Money: Budget',
    score: 90,
    visit: '週2-3回・12分',
    visitScore: 88,
    design: 90,
    btnLabel: '19 / 死0',
    btnCount: 19,
    sizeLabel: '140MB',
    mb: 140,
    url: 'https://money-dashboard-iota-three.vercel.app/budget',
    localPath: '~/money-dashboard/app/budget',
    muted: false,
    wasteNote: 'MoneyForward・Amex集計稼働中',
  },
  {
    id: 'money-home',
    suite: 'money',
    suiteLabel: 'Money',
    icon: '💰',
    name: 'Money: Home',
    score: 88,
    visit: '週2-3回・5分',
    visitScore: 85,
    design: 90,
    btnLabel: '14 / 死0',
    btnCount: 14,
    sizeLabel: '139MB',
    mb: 139,
    url: 'https://money-dashboard-iota-three.vercel.app/',
    localPath: '~/money-dashboard/app',
    muted: false,
    wasteNote: '資産・IRサマリー画面',
  },
  {
    id: 'money-companies',
    suite: 'money',
    suiteLabel: 'Money',
    icon: '🏢',
    name: 'Money: Stocks',
    score: 81,
    visit: '月2-4回・10分',
    visitScore: 72,
    design: 88,
    btnLabel: '16 / 死1',
    btnCount: 16,
    sizeLabel: '139MB',
    mb: 139,
    url: 'https://money-dashboard-iota-three.vercel.app/companies',
    localPath: '~/money-dashboard/app/companies',
    muted: false,
    wasteNote: '決算時期のみ訪問（Q3 IR未更新あり）',
  },
  {
    id: 'money-lifeplan',
    suite: 'money',
    suiteLabel: 'Money',
    icon: '🧭',
    name: 'Money: Plan',
    score: 73,
    visit: '月1回未満・3分',
    visitScore: 58,
    design: 86,
    btnLabel: '8 / 死0',
    btnCount: 8,
    sizeLabel: '139MB',
    mb: 139,
    url: 'https://money-dashboard-iota-three.vercel.app/lifeplan',
    localPath: '~/money-dashboard/app/lifeplan',
    muted: false,
    wasteNote: '長期シミュレーション（訪問頻度低・要確認）',
  },

  // ── 2. Life Dashboard (2 pages) ──
  {
    id: 'life-home',
    suite: 'life',
    suiteLabel: 'Life',
    icon: '🏠',
    name: 'Life: Hub',
    score: 95,
    visit: '毎日・8分',
    visitScore: 98,
    design: 95,
    btnLabel: '42 / 死0',
    btnCount: 42,
    sizeLabel: '376MB',
    mb: 376,
    url: 'https://health-dashboard-dusky-xi.vercel.app',
    internalTab: 'home',
    localPath: '~/health-dashboard/components/tabs/HomeTab.tsx',
    muted: false,
    wasteNote: 'メイン起点ハブ（毎日稼働）',
  },
  {
    id: 'life-health',
    suite: 'life',
    suiteLabel: 'Life',
    icon: '🏃',
    name: 'Life: Health',
    score: 89,
    visit: '毎日・5分',
    visitScore: 91,
    design: 88,
    btnLabel: '36 / 死0',
    btnCount: 36,
    sizeLabel: '377MB',
    mb: 377,
    url: 'https://health-dashboard-dusky-xi.vercel.app',
    internalTab: 'health',
    localPath: '~/health-dashboard/app/page.tsx',
    muted: false,
    wasteNote: 'Health Planet & あすけん連携稼働中',
  },

  // ── 3. Lifelog (5 pages) ──
  {
    id: 'kaimono',
    suite: 'lifelog',
    suiteLabel: 'Lifelog',
    icon: '🍎',
    name: 'Lifelog: Pantry',
    score: 88,
    visit: '週3-5回',
    visitScore: 92,
    design: 98,
    btnLabel: '81 / 死0',
    btnCount: 81,
    sizeLabel: '240KB',
    mb: 0.24,
    url: 'http://127.0.0.1:8788/?view=overview',
    lifelogView: 'overview',
    localPath: '~/.gemini/antigravity/scratch/kaimono-lifelog',
    muted: false,
    wasteNote: '買い出し・消耗品サイクル主力',
  },
  {
    id: 'kaimono-assets',
    suite: 'lifelog',
    suiteLabel: 'Lifelog',
    icon: '⚔️',
    name: 'Lifelog: Gear',
    score: 86,
    visit: '週2-4回',
    visitScore: 88,
    design: 96,
    btnLabel: '87点管理',
    btnCount: 87,
    sizeLabel: '240KB',
    mb: 0.24,
    url: 'http://127.0.0.1:8788/?view=assets',
    lifelogView: 'assets',
    localPath: '~/.gemini/antigravity/scratch/kaimono-lifelog',
    muted: false,
    wasteNote: '87アイテム減価償却・コスパ稼働中',
  },
  {
    id: 'kaimono-books',
    suite: 'lifelog',
    suiteLabel: 'Lifelog',
    icon: '📖',
    name: 'Lifelog: Books',
    score: 85,
    visit: '週2-3回',
    visitScore: 84,
    design: 95,
    btnLabel: '30冊',
    btnCount: 30,
    sizeLabel: '240KB',
    mb: 0.24,
    url: 'http://127.0.0.1:8788/?view=books',
    lifelogView: 'books',
    localPath: '~/.gemini/antigravity/scratch/kaimono-lifelog',
    muted: false,
    wasteNote: '読書ログ・学び回収稼働中',
  },
  {
    id: 'kaimono-mindset',
    suite: 'lifelog',
    suiteLabel: 'Lifelog',
    icon: '🧭',
    name: 'Lifelog: Mindset',
    score: 79,
    visit: '月2-4回',
    visitScore: 72,
    design: 94,
    btnLabel: '12ノード',
    btnCount: 12,
    sizeLabel: '240KB',
    mb: 0.24,
    url: 'http://127.0.0.1:8788/?view=mindset-map',
    lifelogView: 'mindset-map',
    localPath: '~/.gemini/antigravity/scratch/kaimono-lifelog',
    muted: false,
    wasteNote: '月次振り返り用（更新頻度やや低）',
  },
  {
    id: 'kaimono-self',
    suite: 'lifelog',
    suiteLabel: 'Lifelog',
    icon: '🪞',
    name: 'Lifelog: Profile',
    score: 75,
    visit: '月1-2回',
    visitScore: 65,
    design: 92,
    btnLabel: '6セクション',
    btnCount: 6,
    sizeLabel: '240KB',
    mb: 0.24,
    url: 'http://127.0.0.1:8788/?view=self-analysis',
    lifelogView: 'self-analysis',
    localPath: '~/.gemini/antigravity/scratch/kaimono-lifelog',
    muted: false,
    wasteNote: '固定プロフィール（アクセス頻度低・要確認）',
  },

  // ── 4. その他 Web & ローカルアプリ 全11件 ──
  {
    id: 'tvid',
    suite: 'other',
    suiteLabel: 'Other',
    icon: '🎥',
    name: 'Tennis Video',
    score: 86,
    visit: '週2-3回・25分',
    visitScore: 91,
    design: 85,
    btnLabel: '138 / 死2',
    btnCount: 140,
    sizeLabel: '58MB',
    mb: 58,
    url: 'http://localhost:8090',
    localPath: '~/tennis-score/tools',
    muted: false,
    wasteNote: '試合動画編集で高稼働',
  },
  {
    id: 'spanish',
    suite: 'other',
    suiteLabel: 'Other',
    icon: '🇪🇸',
    name: 'Spanish Lab',
    score: 85,
    visit: '週4-5回・5分',
    visitScore: 82,
    design: 85,
    btnLabel: '24 / 死0',
    btnCount: 24,
    sizeLabel: '380KB',
    mb: 0.38,
    url: 'https://spanish-app-kappa-mauve.vercel.app',
    localPath: '~/spanish-learning-app',
    muted: false,
    wasteNote: '軽量・語学学習で継続稼働',
  },
  {
    id: 'tennis',
    suite: 'other',
    suiteLabel: 'Other',
    icon: '🎾',
    name: 'Tennis Score',
    score: 84,
    visit: '週2-3回・20分',
    visitScore: 89,
    design: 82,
    btnLabel: '146 / 死19',
    btnCount: 165,
    sizeLabel: '876MB',
    mb: 876,
    url: 'https://tennis-score-pi.vercel.app',
    localPath: '~/tennis-score',
    muted: false,
    wasteNote: '稼働中だが死ボタン19個・容量大',
  },
  {
    id: 'rio',
    suite: 'other',
    suiteLabel: 'Other',
    icon: '🏆',
    name: 'RIO Rank',
    score: 80,
    visit: '月2-4回・3分',
    visitScore: 67,
    design: 88,
    btnLabel: '19 / 死0',
    btnCount: 19,
    sizeLabel: '212KB',
    mb: 0.21,
    url: 'https://rio-rankings.vercel.app',
    localPath: '~/rio-rankings',
    muted: false,
    wasteNote: '大会後のみアクセス（軽量）',
  },
  {
    id: 'rally',
    suite: 'other',
    suiteLabel: 'Other',
    icon: '🎬',
    name: 'Rally Cutter',
    score: 77,
    visit: '月2-3回・10分',
    visitScore: 70,
    design: 84,
    btnLabel: '9 / 死0',
    btnCount: 9,
    sizeLabel: '11MB',
    mb: 11,
    url: 'http://localhost:8088',
    localPath: '~/.gemini/antigravity/scratch/tennis-rally-cutter',
    muted: false,
    wasteNote: 'ラリー抽出補助ツール',
  },
  {
    id: 'yt',
    suite: 'other',
    suiteLabel: 'Other',
    icon: '▶️',
    name: 'YT Summary',
    score: 76,
    visit: '毎日自動',
    visitScore: 73,
    design: 72,
    btnLabel: '0 (GAS自動)',
    btnCount: 0,
    sizeLabel: '40KB',
    mb: 0.04,
    url: 'https://script.google.com',
    localPath: '~/.gemini/antigravity/scratch/youtube_summarizer',
    muted: false,
    wasteNote: 'バックグラウンド自動稼働',
  },
  {
    id: 'vauto',
    suite: 'other',
    suiteLabel: 'Other',
    icon: '🎞️',
    name: 'Video Editor',
    score: 71,
    visit: '月1-2回・8分',
    visitScore: 58,
    design: 70,
    btnLabel: '4 / 死2',
    btnCount: 6,
    sizeLabel: '502MB',
    mb: 502,
    url: 'http://localhost:8000/resolve',
    localPath: '~/video-auto-editor',
    muted: false,
    wasteNote: '502MB占有・Tennis Video Makerと機能重複気味',
  },
  {
    id: 'imgdec',
    suite: 'other',
    suiteLabel: 'Other',
    icon: '🧩',
    name: 'Image Split',
    score: 48,
    visit: '放置・0分',
    visitScore: 5,
    design: 60,
    btnLabel: '23 (放置)',
    btnCount: 23,
    sizeLabel: '305MB',
    mb: 305,
    url: '',
    localPath: '~/.gemini/antigravity/scratch/image-decomposer-app',
    muted: true,
    wasteNote: '🚨 完全放置・305MB無駄（削除候補）',
  },
  {
    id: 'pvid',
    suite: 'other',
    suiteLabel: 'Other',
    icon: '🎙️',
    name: 'Podcast Video',
    score: 47,
    visit: '休眠・0分',
    visitScore: 13,
    design: 55,
    btnLabel: '1 (休眠)',
    btnCount: 1,
    sizeLabel: '1.2GB',
    mb: 1228,
    url: '',
    localPath: '~/.gemini/antigravity/scratch/podcast-video-generator',
    muted: true,
    wasteNote: '🚨 休眠中・1.2GB無駄（削除候補）',
  },
  {
    id: 'cisland',
    suite: 'other',
    suiteLabel: 'Other',
    icon: '🏝️',
    name: 'Claude Island',
    score: 46,
    visit: '休眠・0分',
    visitScore: 5,
    design: 68,
    btnLabel: '0 (遺物)',
    btnCount: 0,
    sizeLabel: '469MB',
    mb: 469,
    url: '',
    localPath: '~/ClaudeIsland',
    muted: true,
    wasteNote: '🚨 アクセス0・469MB無駄（削除候補）',
  },
  {
    id: 'palign',
    suite: 'other',
    suiteLabel: 'Other',
    icon: '🎚️',
    name: 'Podcast Align',
    score: 34,
    visit: '休眠・0分',
    visitScore: 5,
    design: 20,
    btnLabel: '0 (削除推奨)',
    btnCount: 0,
    sizeLabel: '1.3GB',
    mb: 1331,
    url: '',
    localPath: '~/podcast-align',
    muted: true,
    wasteNote: '🚨 アクセス0・1.3GB無駄（最優先削除候補）',
  },
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
  const [suiteFilter, setSuiteFilter] = useState<'all' | AppSuite | 'waste'>('all');
  const [editingUrlId, setEditingUrlId] = useState<string | null>(null);
  const [customUrls, setCustomUrls] = useState<Record<string, string>>({});
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeUploadIdRef = useRef<string | null>(null);

  const [lifelogStats, setLifelogStats] = useState<
    Record<string, { visits: number; updates: number; last_visited_at?: string; last_updated_at?: string }>
  >({});
  const [cloudTelemetry, setCloudTelemetry] = useState<
    Record<string, { visits: number; dwellSec: number; lastVisitedAt: string }>
  >({});
  const [appAccessLogs, setAppAccessLogs] = useState<Record<string, { count: number; lastAt: string }>>({});

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
      const savedAccess = localStorage.getItem('hd_app_access_logs_v1');
      if (savedAccess) setAppAccessLogs(JSON.parse(savedAccess));
    } catch {
      // ignore
    }

    // 1. Lifelog (127.0.0.1:8788) ページ別アクセス・更新統計取得
    fetch('http://127.0.0.1:8788/api/stats')
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && d.views) setLifelogStats(d.views);
      })
      .catch(() => {});

    // 2. Supabase クラウド上の全ページ共通テレメトリ (Money Dashboard 全6ページ + Life Dashboard 全ページ) 取得
    if (supabase) {
      supabase
        .from('lifeplan_kv')
        .select('data')
        .eq('key', TELEMETRY_KEY)
        .maybeSingle()
        .then(
          ({ data }) => {
            if (data?.data) {
              setCloudTelemetry(
                data.data as Record<string, { visits: number; dwellSec: number; lastVisitedAt: string }>
              );
            }
          },
          () => {}
        );
    }
  }, []);

  const recordAppClick = (appId: string) => {
    const nowStr = new Date().toLocaleString('ja-JP', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    setAppAccessLogs((prev) => {
      const cur = prev[appId] || { count: 0, lastAt: '' };
      const next = { ...prev, [appId]: { count: cur.count + 1, lastAt: nowStr } };
      try {
        localStorage.setItem('hd_app_access_logs_v1', JSON.stringify(next));
      } catch {}
      return next;
    });

    // クラウドテレメトリにも記録
    if (supabase) {
      const curCloud = cloudTelemetry[appId] || { visits: 0, dwellSec: 0, lastVisitedAt: '' };
      const nextCloud = {
        ...cloudTelemetry,
        [appId]: {
          visits: curCloud.visits + 1,
          dwellSec: curCloud.dwellSec + 30,
          lastVisitedAt: new Date().toISOString(),
        },
      };
      setCloudTelemetry(nextCloud);
      supabase
        .from('lifeplan_kv')
        .upsert({
          key: TELEMETRY_KEY,
          data: nextCloud,
          updated_at: new Date().toISOString(),
        })
        .then();
    }
  };

  // 各ページの「実アクセス回数」と「無駄・死蔵ステータス」を計算
  const getPageTelemetryInfo = (a: AppItem): {
    liveVisits: number;
    liveUpdates: number;
    dwellMin: number;
    lastAccessStr: string;
    wasteStatus: WasteStatus;
    dynamicScore: number;
  } => {
    const ll = a.lifelogView ? lifelogStats[a.lifelogView] : undefined;
    const cloud = cloudTelemetry[a.id];
    const local = appAccessLogs[a.id];

    const liveVisits = (ll?.visits || 0) + (cloud?.visits || 0) + (local?.count || 0);
    const liveUpdates = ll?.updates || 0;
    const dwellMin = cloud?.dwellSec ? Math.max(1, Math.round(cloud.dwellSec / 60)) : 0;

    let lastAccessStr = '';
    if (ll?.last_visited_at || ll?.last_updated_at) {
      lastAccessStr = (ll.last_updated_at || ll.last_visited_at || '').slice(5, 16);
    } else if (cloud?.lastVisitedAt) {
      lastAccessStr = cloud.lastVisitedAt.slice(5, 16).replace('T', ' ');
    } else if (local?.lastAt) {
      lastAccessStr = local.lastAt;
    }

    // 無駄・死蔵判定ロジック
    let wasteStatus: WasteStatus = 'active';
    if (a.muted || a.score < 55 || a.visitScore <= 15) {
      wasteStatus = 'wasted';
    } else if (a.visitScore < 75 && liveVisits === 0) {
      wasteStatus = 'underused';
    }

    // 実アクセスがあればランキングスコアに加点（最大100）
    const bonus = Math.min(8, liveVisits * 2 + liveUpdates * 2);
    const dynamicScore = Math.min(100, a.score + bonus);

    return {
      liveVisits,
      liveUpdates,
      dwellMin,
      lastAccessStr,
      wasteStatus,
      dynamicScore,
    };
  };

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

  const enrichedApps = useMemo(() => {
    return apps
      .filter((a) => !deletedIds.includes(a.id))
      .map((a) => ({
        ...a,
        telemetry: getPageTelemetryInfo(a),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps, deletedIds, lifelogStats, cloudTelemetry, appAccessLogs]);

  const auditCounts = useMemo(() => {
    let active = 0;
    let underused = 0;
    let wasted = 0;
    enrichedApps.forEach((a) => {
      if (a.telemetry.wasteStatus === 'active') active++;
      else if (a.telemetry.wasteStatus === 'underused') underused++;
      else wasted++;
    });
    return { active, underused, wasted };
  }, [enrichedApps]);

  const visibleApps = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedApps
      .filter((a) => {
        if (suiteFilter === 'all') return true;
        if (suiteFilter === 'waste') return a.telemetry.wasteStatus !== 'active';
        return a.suite === suiteFilter;
      })
      .filter((a) => (!q ? true : a.name.toLowerCase().includes(q) || a.wasteNote.toLowerCase().includes(q)))
      .sort(
        (a, b) =>
          (a.muted ? 1 : 0) - (b.muted ? 1 : 0) ||
          b.telemetry.dynamicScore - a.telemetry.dynamicScore
      );
  }, [enrichedApps, searchQuery, suiteFilter]);

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

      {/* ROW 1: 期限別 CSV/データ取込ボタンバー */}
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

      {/* ROW 2: FULL-WIDTH LARGE NOVEMBER CALENDAR */}
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

      {/* ROW 3: 今後やるべき修正点 ＆ 作るべきアプリの案（視認性向上・折り返し表示） */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div
          className="p-3.5 rounded-lg border space-y-2.5 shadow-sm"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-black">🛠️ 今後やるべき修正点</h3>
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
                placeholder="＋修正点を追加"
                className="w-32 px-2 py-1 rounded border text-xs"
                style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
              />
              <button
                type="submit"
                className="px-2.5 py-1 rounded font-black border text-xs"
                style={{ borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)' }}
              >
                追加
              </button>
            </form>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 font-bold">
            {tasks.map((t, i) => (
              <span
                key={`${t}-${i}`}
                className="px-2.5 py-1 rounded-md border flex items-center gap-1.5 text-xs"
                style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
              >
                <span>🛠️ {t}</span>
                <button
                  type="button"
                  onClick={() => {
                    const next = tasks.filter((_, idx) => idx !== i);
                    setTasks(next);
                    localStorage.setItem('agy_home_tasks_v5', JSON.stringify(next));
                  }}
                  className="opacity-60 hover:opacity-100"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>

        <div
          className="p-3.5 rounded-lg border space-y-2.5 shadow-sm"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-black">💡 今後作るべきアプリの案</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!ideaIn.trim()) return;
                const next = [`🚀 ${ideaIn.trim()}`, ...ideas];
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
                placeholder="＋アプリアイデア"
                className="w-32 px-2 py-1 rounded border text-xs"
                style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
              />
              <button
                type="submit"
                className="px-2.5 py-1 rounded font-black border text-xs"
                style={{ borderColor: 'var(--zelda-cyan)', color: 'var(--zelda-cyan)' }}
              >
                追加
              </button>
            </form>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 font-bold">
            {ideas.map((idea, i) => (
              <span
                key={`${idea}-${i}`}
                className="px-2.5 py-1 rounded-md border flex items-center gap-1.5 text-xs"
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
                  className="opacity-60 hover:opacity-100"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ROW 4: 全アプリ・全24ページの統合ランキング ＆ アクセス有無・無駄診断 */}
      <div
        className="p-3.5 rounded-lg border space-y-3 shadow-sm"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-sm font-black">🕹️ 全アプリ・全24ページ 統合ランキング ＆ 無駄・死蔵診断</h2>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-extrabold">
              <span
                className="px-2 py-0.5 rounded border"
                style={{ background: 'rgba(111, 176, 135, 0.16)', borderColor: 'var(--zelda-zonai)', color: 'var(--zelda-zonai)' }}
              >
                🟢 稼働中 {auditCounts.active}ページ
              </span>
              <span
                className="px-2 py-0.5 rounded border"
                style={{ background: 'rgba(217, 168, 78, 0.16)', borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)' }}
              >
                🟡 低頻度・要確認 {auditCounts.underused}ページ
              </span>
              <span
                className="px-2 py-0.5 rounded border"
                style={{ background: 'rgba(239, 68, 68, 0.18)', borderColor: 'var(--f1-soft)', color: 'var(--f1-soft)' }}
              >
                🔴 無駄・死蔵 {auditCounts.wasted}ページ (削減可能 {(savedMB / 1024).toFixed(2)}GB)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
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
                ↩ Restore ({deletedIds.length})
              </button>
            )}
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 ページ名・診断で検索..."
              className="px-2.5 py-1 rounded border text-xs w-48"
              style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
            />
          </div>
        </div>

        {/* スイート・無駄診断フィルタボタン */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'all', label: `すべて表示 (${enrichedApps.length})` },
            { id: 'money', label: '💰 Money 全ページ (6)' },
            { id: 'lifelog', label: '🍎 Lifelog 全ページ (5)' },
            { id: 'life', label: '🏃 Life 全ページ (2)' },
            { id: 'other', label: '🎾 他アプリ (11)' },
            { id: 'waste', label: `🚨 無駄・低頻度のみ (${auditCounts.underused + auditCounts.wasted})` },
          ].map((f) => {
            const active = suiteFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setSuiteFilter(f.id as typeof suiteFilter)}
                className="px-2.5 py-1 rounded-lg text-xs font-extrabold border transition"
                style={{
                  background: active ? 'var(--accent)' : 'var(--bg-card2)',
                  borderColor: active ? 'var(--zelda-gold)' : 'var(--border)',
                  color: active ? '#1e1a16' : 'var(--text)',
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-left text-xs border-collapse">
            <thead style={{ background: '#212823', color: '#e4dac6' }}>
              <tr>
                <th className="py-2.5 px-3">順位 &amp; ページ名 (クリックで開く)</th>
                <th className="py-2.5 px-3">区分</th>
                <th className="py-2.5 px-3">Score</th>
                <th className="py-2.5 px-3">アクセス頻度 ＆ 実測ログ</th>
                <th className="py-2.5 px-3">稼働・無駄診断 (Audit)</th>
                <th className="py-2.5 px-3">🎨 洗練度</th>
                <th className="py-2.5 px-3">機能 / 容量</th>
                <th className="py-2.5 px-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {visibleApps.map((a, idx) => {
                const effectiveUrl = customUrls[a.id] ?? a.url;
                const isEditing = editingUrlId === a.id;
                const t = a.telemetry;

                const statusBadge =
                  t.wasteStatus === 'active'
                    ? {
                        label: '🟢 稼働中',
                        bg: 'rgba(111, 176, 135, 0.16)',
                        border: 'var(--zelda-zonai)',
                        color: 'var(--zelda-zonai)',
                      }
                    : t.wasteStatus === 'underused'
                    ? {
                        label: '🟡 低頻度 (要確認)',
                        bg: 'rgba(217, 168, 78, 0.18)',
                        border: 'var(--zelda-gold)',
                        color: 'var(--zelda-gold)',
                      }
                    : {
                        label: '🔴 無駄・死蔵',
                        bg: 'rgba(239, 68, 68, 0.20)',
                        border: 'var(--f1-soft)',
                        color: 'var(--f1-soft)',
                      };

                return (
                  <tr
                    key={a.id}
                    className={a.muted ? 'gray-done' : 'hover:bg-[var(--bg-card2)]'}
                    style={{ background: 'var(--bg-card)' }}
                  >
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
                          onClick={() => {
                            recordAppClick(a.id);
                            onNavigate(a.internalTab!);
                          }}
                          className="hover:underline text-left font-black flex items-center gap-1.5"
                        >
                          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>#{idx + 1}</span>
                          <span>{a.icon}</span>
                          <span>{a.name}</span>
                        </button>
                      ) : effectiveUrl ? (
                        <a
                          href={effectiveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => recordAppClick(a.id)}
                          className="hover:underline flex items-center gap-1.5"
                        >
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

                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-extrabold border"
                        style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)', color: 'var(--text-sub)' }}
                      >
                        {a.suiteLabel}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 font-black tabular-nums text-sm" style={{ color: 'var(--zelda-gold)' }}>
                      {t.dynamicScore}
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="font-bold">{a.visit}</div>
                      {t.liveVisits > 0 || t.liveUpdates > 0 ? (
                        <div className="text-[10px] font-extrabold" style={{ color: 'var(--zelda-cyan)' }}>
                          実測アクセス {t.liveVisits}回
                          {t.liveUpdates > 0 ? ` / 更新 ${t.liveUpdates}回` : ''}
                          {t.dwellMin > 0 ? ` (${t.dwellMin}分)` : ''}
                          {t.lastAccessStr ? ` · 最終 ${t.lastAccessStr}` : ''}
                        </div>
                      ) : (
                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          実測ログ: 未記録（クリックまたは訪問で自動計測）
                        </div>
                      )}
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className="inline-block w-fit px-2 py-0.5 rounded border text-[10px] font-black"
                          style={{
                            background: statusBadge.bg,
                            borderColor: statusBadge.border,
                            color: statusBadge.color,
                          }}
                        >
                          {statusBadge.label}
                        </span>
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          {a.wasteNote}
                        </span>
                      </div>
                    </td>

                    <td className="py-2.5 px-3 font-bold tabular-nums" style={{ color: 'var(--zelda-cyan)' }}>
                      {a.design}
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap tabular-nums">
                      <div>{a.btnLabel}</div>
                      <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{a.sizeLabel}</div>
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {a.internalTab ? (
                          <button
                            type="button"
                            onClick={() => {
                              recordAppClick(a.id);
                              onNavigate(a.internalTab!);
                            }}
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
                            onClick={() => recordAppClick(a.id)}
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
                          title="休眠・無駄候補としてマーク / 解除"
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
    </div>
  );
}
