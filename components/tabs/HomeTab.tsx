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

interface FixTaskItem {
  id: string;
  appId: string;
  appName: string;
  localPath: string;
  title: string;
  detail: string;
  subIdeas: string[];
}

interface NewAppIdeaItem {
  id: string;
  title: string;
  target: string;
  detail: string;
  subIdeas: string[];
}

const INITIAL_TASKS: FixTaskItem[] = [
  {
    id: 'fix-tvid-mp4',
    appId: 'tvid',
    appName: 'Tennis Video',
    localPath: '~/tennis-score/tools',
    title: 'Delete Raw MP4s',
    detail: '動画編集後の元MP4ファイルや書き出しキャッシュを削除して数GBの空き容量を確保する。',
    subIdeas: ['書き出し完了後に元動画を自動アーカイブするボタンを追加'],
  },
  {
    id: 'fix-tennis-links',
    appId: 'tennis',
    appName: 'Tennis Score',
    localPath: '~/tennis-score',
    title: 'Fix Dead Links (19件)',
    detail: '死ボタン19個と未実装リンクを整理・修正し、全ボタンが正常に動作する状態にする。',
    subIdeas: ['未プッシュの24コミットも合わせてGitHubへPush'],
  },
  {
    id: 'fix-kaimono-git',
    appId: 'kaimono',
    appName: 'Lifelog: Pantry',
    localPath: '~/.gemini/antigravity/scratch/kaimono-lifelog',
    title: 'Git Init & Cloud Sync',
    detail: 'ローカルサーバー運用中のLifelogをGit管理化し、Supabaseへの自動バックアップを追加する。',
    subIdeas: ['買い物CSV取込後の在庫アラート表示を強化'],
  },
  {
    id: 'fix-money-companies',
    appId: 'money-companies',
    appName: 'Money: Stocks',
    localPath: '~/money-dashboard/app/companies',
    title: 'Q3 IRデータ更新＆死ボタン修正',
    detail: '未更新のQ3決算データを最新化し、銘柄詳細のリンク切れ1件を修正する。',
    subIdeas: [],
  },
  {
    id: 'fix-dormant-cleanup',
    appId: 'palign',
    appName: 'Podcast Align / Dormant 4種',
    localPath: '~/podcast-align',
    title: 'Clean 3.3GB Dormant Apps',
    detail: 'アクセス0で休眠中の4アプリ(Podcast Align / Video Gen / Claude Island / Image Split)を削除・整理する。',
    subIdeas: [],
  },
];

const INITIAL_IDEAS: NewAppIdeaItem[] = [
  {
    id: 'idea-privacy',
    title: '🔐 Privacy & SSO Map',
    target: '全アプリ共通',
    detail: '各アプリのSupabase認証・APIキー・外部連携権限を一画面で把握・点検できる管理マップ。',
    subIdeas: ['期限切れトークンの自動アラート機能'],
  },
  {
    id: 'idea-storage',
    title: '💾 Mac Storage Miner',
    target: 'Macローカル',
    detail: '肥大化したnode_modulesや動画キャッシュを自動検出し、ワンクリックで掃除する容量最適化ツール。',
    subIdeas: ['プロジェクト別の容量ランキング表示'],
  },
  {
    id: 'idea-davinci',
    title: '🎬 DaVinci Slimmer',
    target: 'Tennis Video連携',
    detail: 'DaVinci Resolveのプロジェクトとプロキシファイルを自動整理し、編集後の容量膨張を防ぐツール。',
    subIdeas: [],
  },
  {
    id: 'idea-podcast-crm',
    title: '🎙️ Podcast CRM',
    target: 'Lifelog: Books連携',
    detail: '聴いたポッドキャストを自動文字起こし・要約し、読書図鑑と同じ形式で知識をストックするアプリ。',
    subIdeas: ['ハイライト箇所のタイムスタンプ保存'],
  },
  {
    id: 'idea-room-3d',
    title: '🧊 3D Room Builder',
    target: 'Lifelog: Gear連携',
    detail: '持ち物ポーチ(87アイテム)の配置を部屋レイアウト上で可視化し、断捨離や模様替えに活かすアプリ。',
    subIdeas: [],
  },
];

function buildFixPrompt(t: FixTaskItem): string {
  const extra =
    t.subIdeas.length > 0
      ? `\n【追加の修正アイデア】\n${t.subIdeas.map((s) => `- ${s}`).join('\n')}`
      : '';
  return `${t.localPath} (${t.appName}) を以下の通り修正してください。\n【修正内容】${t.title}\n【詳細】${t.detail}${extra}`;
}

function buildIdeaPrompt(idea: NewAppIdeaItem): string {
  const extra =
    idea.subIdeas.length > 0
      ? `\n【追加アイデア・機能】\n${idea.subIdeas.map((s) => `- ${s}`).join('\n')}`
      : '';
  return `新規アプリ「${idea.title}」をウォームダーク＆羊皮紙テーマで作成してください。\n【連携・領域】${idea.target}\n【概要】${idea.detail}${extra}`;
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
  const [calItems, setCalItems] = useState<CalInputItem[]>(INITIAL_CAL_ITEMS);
  const [apps, setApps] = useState<AppItem[]>(INITIAL_APPS);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [tasks, setTasks] = useState<FixTaskItem[]>(INITIAL_TASKS);
  const [ideas, setIdeas] = useState<NewAppIdeaItem[]>(INITIAL_IDEAS);
  const [fixAppId, setFixAppId] = useState<string>(INITIAL_APPS[0].id);
  const [taskIn, setTaskIn] = useState('');
  const [taskDetailIn, setTaskDetailIn] = useState('');
  const [ideaIn, setIdeaIn] = useState('');
  const [ideaDetailIn, setIdeaDetailIn] = useState('');
  const [pinnedFixId, setPinnedFixId] = useState<string | null>(null);
  const [pinnedIdeaId, setPinnedIdeaId] = useState<string | null>(null);
  const [subIdeaDrafts, setSubIdeaDrafts] = useState<Record<string, string>>({});
  const [showIphoneModal, setShowIphoneModal] = useState(false);
  const [iphoneTab, setIphoneTab] = useState<'books' | 'notes'>('books');
  const [capturedBooks, setCapturedBooks] = useState<
    { id: string; title: string; author: string; image_url: string; amazon_url: string; asin: string; status: string; capturedAt: string }[]
  >([]);
  const [offlineMemoText, setOfflineMemoText] = useState('');
  const [amazonUrlInput, setAmazonUrlInput] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
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
      const savedTasks = localStorage.getItem('agy_home_tasks_v7');
      if (savedTasks) setTasks(JSON.parse(savedTasks));
      const savedIdeas = localStorage.getItem('agy_home_ideas_v7');
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
    // 3. iPhone連携: クラウド上の修正/新規メモ & Amazon未読本キューを取得
    fetch('/api/iphone/sync-notes')
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok) {
          if (Array.isArray(d.tasks) && d.tasks.length > 0) {
            setTasks(d.tasks);
            try { localStorage.setItem('agy_home_tasks_v7', JSON.stringify(d.tasks)); } catch {}
          }
          if (Array.isArray(d.ideas) && d.ideas.length > 0) {
            setIdeas(d.ideas);
            try { localStorage.setItem('agy_home_ideas_v7', JSON.stringify(d.ideas)); } catch {}
          }
        }
      })
      .catch(() => {});

    fetch('/api/iphone/book-capture')
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && Array.isArray(d.books)) {
          setCapturedBooks(d.books);
        }
      })
      .catch(() => {});
  }, []);

  const persistNotesToCloud = (nextTasks: FixTaskItem[], nextIdeas: NewAppIdeaItem[]) => {
    try {
      localStorage.setItem('agy_home_tasks_v7', JSON.stringify(nextTasks));
      localStorage.setItem('agy_home_ideas_v7', JSON.stringify(nextIdeas));
    } catch {}
    fetch('/api/iphone/sync-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks: nextTasks, ideas: nextIdeas }),
    }).catch(() => {});
  };

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
    <div className="max-w-7xl mx-auto space-y-3 text-xs" style={{ color: 'var(--text)' }}>
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

      {/* TOP BAR: コンパクト CSV取込 & 漏れチェック */}
      <div
        className="px-3 py-2.5 rounded-lg border flex flex-wrap items-center justify-between gap-2 shadow-sm"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-black">📥 CSV取込:</span>
          {overdueCount > 0 && (
            <span
              className="px-2 py-0.5 rounded font-black text-[10px] border"
              style={{ background: 'rgba(239,68,68,0.2)', borderColor: 'var(--f1-soft)', color: 'var(--f1-soft)' }}
            >
              🚨 遅れ {overdueCount}
            </span>
          )}
          {dueTodayCount > 0 && (
            <span
              className="px-2 py-0.5 rounded font-black text-[10px] border"
              style={{ background: 'rgba(217,168,78,0.2)', borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)' }}
            >
              ⚡ 今日 {dueTodayCount}
            </span>
          )}
          <span
            className="px-2 py-0.5 rounded font-bold text-[10px] border"
            style={{ borderColor: 'var(--zelda-zonai)', color: 'var(--zelda-zonai)' }}
          >
            ✓ {doneCount}/{calItems.length} ({progressPct}%)
          </span>

          <div className="flex flex-wrap items-center gap-1.5 ml-1">
            {sortedCsvButtons.map((item) => {
              const isOverdue = !item.done && item.day < TODAY;
              const isToday = !item.done && item.day === TODAY;
              const isFutureOrDone = item.done || item.day > TODAY;

              return (
                <div
                  key={item.id}
                  className={`flex items-center rounded border overflow-hidden transition ${
                    isFutureOrDone ? 'gray-done' : isOverdue ? 'border-2 shadow-sm' : 'border-2'
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
                    className="px-2 py-1 flex items-center gap-1 font-extrabold text-[11px] hover:opacity-80"
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                    <span
                      className="text-[10px] font-bold"
                      style={{
                        color: isOverdue ? 'var(--f1-soft)' : isToday ? 'var(--zelda-gold)' : 'var(--text-muted)',
                      }}
                    >
                      {item.done ? '✓' : isOverdue ? `🚨11/${item.day}` : isToday ? '⚡今日' : `11/${item.day}`}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleQuest(item.id)}
                    title={item.done ? '未完了に戻す' : '手動で完了(グレー)にする'}
                    className="px-1.5 py-1 border-l text-[10px] font-black hover:bg-black/15"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    {item.done ? '↩' : '✓'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
          <button
            type="button"
            onClick={() => setShowIphoneModal(true)}
            className="px-2.5 py-1 rounded border font-black flex items-center gap-1.5 transition hover:opacity-85"
            style={{
              background: capturedBooks.length > 0 ? 'rgba(106, 174, 192, 0.2)' : 'var(--bg-card2)',
              borderColor: 'var(--zelda-cyan)',
              color: 'var(--zelda-cyan)',
            }}
          >
            <span>📱 iPhone連携</span>
            {capturedBooks.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px]" style={{ background: 'var(--zelda-gold)', color: '#1e1a16' }}>
                📚{capturedBooks.length}
              </span>
            )}
          </button>
          {metrics.length > 0 && metrics[metrics.length - 1].weight != null && (
            <span>⚖️ {metrics[metrics.length - 1].weight?.toFixed(1)}kg</span>
          )}
          {nutrition.length > 0 && (
            <span>🍽️ {Math.round(nutrition[nutrition.length - 1].totalCalories)}kcal</span>
          )}
        </div>
      </div>

      {/* iPhone 15 Pro 連携モーダル（Amazon本ワンタップ追加 ＆ オフラインメモ同期） */}
      {showIphoneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border-2 p-4 space-y-3 shadow-2xl"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--zelda-cyan)', color: 'var(--text)' }}
          >
            <div className="flex items-center justify-between border-b pb-2.5" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2">
                <span className="text-base font-black">📱 iPhone 15 Pro 連携ハブ</span>
                <div className="flex gap-1 ml-2">
                  <button
                    type="button"
                    onClick={() => setIphoneTab('books')}
                    className="px-2.5 py-1 rounded text-xs font-black border"
                    style={{
                      background: iphoneTab === 'books' ? 'var(--accent)' : 'var(--bg-card2)',
                      borderColor: iphoneTab === 'books' ? 'var(--zelda-gold)' : 'var(--border)',
                      color: iphoneTab === 'books' ? '#1e1a16' : 'var(--text)',
                    }}
                  >
                    📚 Amazon本 → 未読リスト ({capturedBooks.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setIphoneTab('notes')}
                    className="px-2.5 py-1 rounded text-xs font-black border"
                    style={{
                      background: iphoneTab === 'notes' ? 'var(--accent)' : 'var(--bg-card2)',
                      borderColor: iphoneTab === 'notes' ? 'var(--zelda-gold)' : 'var(--border)',
                      color: iphoneTab === 'notes' ? '#1e1a16' : 'var(--text)',
                    }}
                  >
                    📝 オフラインメモ同期
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIphoneModal(false)}
                className="px-2.5 py-1 rounded border text-xs font-bold"
                style={{ borderColor: 'var(--border)' }}
              >
                ✕ 閉じる
              </button>
            </div>

            {iphoneTab === 'books' ? (
              <div className="space-y-3">
                {/* URLテスト・手動追加バー */}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!amazonUrlInput.trim()) return;
                    setSyncBusy(true);
                    try {
                      const res = await fetch('/api/iphone/book-capture', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: amazonUrlInput.trim() }),
                      });
                      const d = await res.json();
                      if (d?.ok && d.book) {
                        setCapturedBooks((prev) => [d.book, ...prev.filter((b) => b.id !== d.book.id)]);
                        setAmazonUrlInput('');
                        notify(`📚 「${d.book.title}」を未読リストへ追加しました`);
                      }
                    } finally {
                      setSyncBusy(false);
                    }
                  }}
                  className="flex gap-1.5"
                >
                  <input
                    type="url"
                    value={amazonUrlInput}
                    onChange={(e) => setAmazonUrlInput(e.target.value)}
                    placeholder="Amazon共有URL (https://amzn.asia/d/... または amazon.co.jp/dp/...)"
                    className="flex-1 px-2.5 py-1.5 rounded border text-xs"
                    style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
                  />
                  <button
                    type="submit"
                    disabled={syncBusy}
                    className="px-3 py-1.5 rounded font-black text-xs"
                    style={{ background: 'var(--accent)', color: '#1e1a16' }}
                  >
                    {syncBusy ? '取得中...' : '＋未読本へ追加'}
                  </button>
                </form>

                {/* 取得済未読本リスト */}
                {capturedBooks.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black" style={{ color: 'var(--zelda-gold)' }}>
                        iPhone / クラウド未読キュー ({capturedBooks.length}冊)
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          let okCount = 0;
                          for (const b of capturedBooks) {
                            try {
                              const r = await fetch('http://127.0.0.1:8788/api/books/quick-add', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  title: b.title,
                                  author: b.author,
                                  image_url: b.image_url,
                                }),
                              });
                              if (r.ok) okCount++;
                            } catch {}
                          }
                          if (okCount > 0) {
                            notify(`✓ ${okCount}冊を Lifelog: Books (127.0.0.1:8788) の未読リストへ同期しました`);
                          } else {
                            notify('⚠️ Lifelogローカルサーバー(8788)が起動していません（Mac上で開くと同期できます）');
                          }
                        }}
                        className="px-2.5 py-1 rounded border text-[11px] font-black"
                        style={{ borderColor: 'var(--zelda-zonai)', color: 'var(--zelda-zonai)' }}
                      >
                        ⚡ Lifelog: Books へ一括転送
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {capturedBooks.map((b) => (
                        <div
                          key={b.id}
                          className="p-2 rounded-lg border flex gap-2.5 items-start"
                          style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
                        >
                          {b.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={b.image_url} alt={b.title} className="w-12 h-16 object-cover rounded border flex-shrink-0" />
                          ) : (
                            <div className="w-12 h-16 rounded border flex items-center justify-center text-lg flex-shrink-0">📖</div>
                          )}
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <div className="font-black text-xs line-clamp-2">{b.title}</div>
                            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>著者: {b.author}</div>
                            <div className="flex items-center gap-2 pt-1">
                              {b.amazon_url && (
                                <a href={b.amazon_url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold underline" style={{ color: 'var(--zelda-cyan)' }}>
                                  Amazon ↗
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={async () => {
                                  await fetch(`/api/iphone/book-capture?id=${encodeURIComponent(b.id)}`, { method: 'DELETE' });
                                  setCapturedBooks((prev) => prev.filter((x) => x.id !== b.id));
                                }}
                                className="text-[10px] opacity-60 hover:opacity-100"
                              >
                                削除
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded border text-xs text-center" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                    まだiPhoneから追加された本はありません。Amazon URLを貼るか、下のショートカットで追加してください。
                  </div>
                )}

                {/* iOS ショートカット設定ガイド */}
                <div className="p-3 rounded-lg border space-y-1.5 text-[11px]" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}>
                  <div className="font-black" style={{ color: 'var(--zelda-cyan)' }}>
                    📲 iPhone 15 Pro「共有シート」から1タップ追加するショートカット設定
                  </div>
                  <ol className="list-decimal list-inside space-y-1" style={{ color: 'var(--text-sub)' }}>
                    <li>iOS「ショートカット」アプリで新規作成 →「共有シートに表示」をON（入力：URL・テキスト）</li>
                    <li>アクション <strong>「URLの内容を取得」</strong> を追加：URL = <code className="px-1 rounded bg-black/30">https://health-dashboard-dusky-xi.vercel.app/api/iphone/book-capture</code></li>
                    <li>方法 = <strong>POST</strong> ／ 本文 = <strong>JSON</strong> ／ キー <code className="px-1 rounded bg-black/30">url</code> に「ショートカットの入力」を指定</li>
                    <li>Amazonアプリで気になる本の「共有」→ 作成したショートカットをタップするだけで表紙・著者付きで自動登録！</li>
                  </ol>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!offlineMemoText.trim()) return;
                    setSyncBusy(true);
                    try {
                      const res = await fetch('/api/iphone/sync-notes', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: offlineMemoText }),
                      });
                      const d = await res.json();
                      if (d?.ok) {
                        if (Array.isArray(d.tasks)) setTasks(d.tasks);
                        if (Array.isArray(d.ideas)) setIdeas(d.ideas);
                        setOfflineMemoText('');
                        notify(`✓ 同期完了: 修正 +${d.addedFixesCount}件 / 新規案 +${d.addedIdeasCount}件`);
                      }
                    } finally {
                      setSyncBusy(false);
                    }
                  }}
                  className="space-y-2"
                >
                  <label className="block text-xs font-black" style={{ color: 'var(--zelda-gold)' }}>
                    iPhoneのオフラインメモを貼り付けて一括同期（自動振り分け）:
                  </label>
                  <textarea
                    rows={5}
                    value={offlineMemoText}
                    onChange={(e) => setOfflineMemoText(e.target.value)}
                    placeholder={"例:\n修正: Tennis Score | 試合一覧のソート順を最新順にする\n新規: 睡眠トラッカー | 起床時刻と体温を自動記録\nMoney 家計簿: CSV取込ボタンを大きくする"}
                    className="w-full p-2.5 rounded border text-xs font-normal"
                    style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={syncBusy}
                      className="px-4 py-1.5 rounded font-black text-xs"
                      style={{ background: 'var(--accent)', color: '#1e1a16' }}
                    >
                      {syncBusy ? '同期中...' : '⚡ 解析して既存修正／新規案へ同期'}
                    </button>
                  </div>
                </form>

                <div className="p-3 rounded-lg border space-y-1.5 text-[11px]" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}>
                  <div className="font-black" style={{ color: 'var(--zelda-cyan)' }}>
                    📲 iPhone標準「メモ」アプリ（完全オフライン）と1タップ自動同期する方法
                  </div>
                  <ol className="list-decimal list-inside space-y-1" style={{ color: 'var(--text-sub)' }}>
                    <li>オフライン時は普段通り iPhone標準「メモ」の固定メモ（例：<strong>Antigravityメモ</strong>）に1行1件でメモする</li>
                    <li>iOSショートカットを作成：<strong>「メモを検索」</strong>（名前が Antigravityメモ）→ <strong>「URLの内容を取得」</strong></li>
                    <li>URL = <code className="px-1 rounded bg-black/30">https://health-dashboard-dusky-xi.vercel.app/api/iphone/sync-notes</code> ／ 方法 = <strong>POST</strong> ／ 本文 JSONキー <code className="px-1 rounded bg-black/30">text</code> にメモ本文を指定</li>
                    <li>時間がある時にショートカットを1タップするだけで、重複なしで「既存アプリ修正」と「新規アプリ案」へ自動振り分け同期！</li>
                  </ol>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MAIN 2-COLUMN COCKPIT: 左(カレンダー＋修正/新規案) / 右(コンパクト全24ページランチャー) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3.5 items-start">
        {/* LEFT COLUMN (5 cols): 視線移動の少ないコンパクトカレンダー ＋ 修正＆新規案 */}
        <div className="xl:col-span-5 space-y-3.5">
          {/* コンパクト 11月カレンダー */}
          <div
            className="p-3 rounded-lg border space-y-2 shadow-sm"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-black">📅 2026年11月 カレンダー</h2>
              <div className="flex items-center gap-2 text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>
                <span>🚨遅れ</span>
                <span>⚡今日</span>
                <span>⚪済/前</span>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-extrabold" style={{ color: 'var(--text-muted)' }}>
              <span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span><span>日</span>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={`b-${idx}`}
                  className="rounded border min-h-[44px] opacity-15"
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
                    className={`p-1 rounded border min-h-[44px] flex flex-col justify-between transition ${
                      allDone ? 'gray-done' : isFutureOnly ? 'opacity-65' : ''
                    }`}
                    style={{
                      background: hasOverdue
                        ? 'rgba(239,68,68,0.14)'
                        : hasTodayDue
                        ? 'rgba(217,168,78,0.14)'
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
                      className="flex justify-between items-center text-[9.5px] font-black leading-none"
                      style={{ color: d === TODAY ? 'var(--zelda-gold)' : hasOverdue ? 'var(--f1-soft)' : 'var(--text-muted)' }}
                    >
                      <span>{d}{d === TODAY ? '★' : ''}</span>
                      <span>{allDone ? '✓' : hasOverdue ? '🚨' : hasTodayDue ? '⚡' : ''}</span>
                    </div>
                    <div className="space-y-0.5 mt-0.5">
                      {items.map((it) => (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() => toggleQuest(it.id)}
                          title={`${it.label} (${it.targetApp})`}
                          className={`w-full text-left text-[9px] font-extrabold px-1 py-0.5 rounded truncate leading-tight ${
                            it.done ? 'line-through opacity-50' : ''
                          }`}
                          style={{
                            background: it.done
                              ? 'rgba(0,0,0,0.2)'
                              : it.day < TODAY
                              ? 'rgba(239,68,68,0.32)'
                              : it.day === TODAY
                              ? 'rgba(217,168,78,0.32)'
                              : 'rgba(255,255,255,0.06)',
                          }}
                        >
                          {it.icon}{it.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (7 cols): コンパクト・低ノイズ全24ページランチャー */}
        <div className="xl:col-span-7">
          <div
            className="p-3 rounded-lg border space-y-2.5 shadow-sm"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-black">🕹️ 全24ページ ランチャー＆無駄診断</h2>
                <div className="flex items-center gap-1 text-[10px] font-extrabold">
                  <span className="px-1.5 py-0.5 rounded border" style={{ background: 'rgba(111,176,135,0.16)', borderColor: 'var(--zelda-zonai)', color: 'var(--zelda-zonai)' }}>
                    🟢稼働 {auditCounts.active}
                  </span>
                  <span className="px-1.5 py-0.5 rounded border" style={{ background: 'rgba(217,168,78,0.16)', borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)' }}>
                    🟡低頻度 {auditCounts.underused}
                  </span>
                  <span className="px-1.5 py-0.5 rounded border" style={{ background: 'rgba(239,68,68,0.18)', borderColor: 'var(--f1-soft)', color: 'var(--f1-soft)' }}>
                    🔴無駄 {auditCounts.wasted} ({(savedMB / 1024).toFixed(1)}GB)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {deletedIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeletedIds([]);
                      localStorage.setItem('agy_home_del_v5', '[]');
                    }}
                    className="px-2 py-1 rounded text-[10px] font-bold border"
                    style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
                  >
                    ↩ Restore
                  </button>
                )}
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="🔍 検索..."
                  className="px-2 py-1 rounded border text-[11px] w-36"
                  style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
                />
              </div>
            </div>

            {/* スイート絞り込みタブ */}
            <div className="flex flex-wrap items-center gap-1">
              {[
                { id: 'all', label: `All (${enrichedApps.length})` },
                { id: 'money', label: '💰 Money (6)' },
                { id: 'lifelog', label: '🍎 Lifelog (5)' },
                { id: 'life', label: '🏃 Life (2)' },
                { id: 'other', label: '🎾 Other (11)' },
                { id: 'waste', label: `🚨 無駄/低頻度 (${auditCounts.underused + auditCounts.wasted})` },
              ].map((f) => {
                const active = suiteFilter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSuiteFilter(f.id as typeof suiteFilter)}
                    className="px-2 py-0.5 rounded text-[11px] font-extrabold border transition"
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

            {/* 視線移動を最小化した4カラムコンパクトテーブル */}
            <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
              <table className="w-full text-left text-[11.5px] border-collapse">
                <thead style={{ background: '#212823', color: '#e4dac6' }}>
                  <tr>
                    <th className="py-2 px-2.5">順位 &amp; ページ (クリックで開く)</th>
                    <th className="py-2 px-2">Score / 頻度</th>
                    <th className="py-2 px-2">無駄診断</th>
                    <th className="py-2 px-2 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {visibleApps.map((a, idx) => {
                    const effectiveUrl = customUrls[a.id] ?? a.url;
                    const isEditing = editingUrlId === a.id;
                    const t = a.telemetry;

                    const statusBadge =
                      t.wasteStatus === 'active'
                        ? { label: '🟢 稼働', bg: 'rgba(111,176,135,0.16)', border: 'var(--zelda-zonai)', color: 'var(--zelda-zonai)' }
                        : t.wasteStatus === 'underused'
                        ? { label: '🟡 低頻度', bg: 'rgba(217,168,78,0.18)', border: 'var(--zelda-gold)', color: 'var(--zelda-gold)' }
                        : { label: '🔴 無駄', bg: 'rgba(239,68,68,0.20)', border: 'var(--f1-soft)', color: 'var(--f1-soft)' };

                    return (
                      <tr
                        key={a.id}
                        className={a.muted ? 'gray-done' : 'hover:bg-[var(--bg-card2)]'}
                        style={{ background: 'var(--bg-card)' }}
                      >
                        <td className="py-1.5 px-2.5 font-black whitespace-nowrap">
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
                              className="px-2 py-0.5 rounded border text-xs w-48"
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
                              <span className="text-[10px] w-5" style={{ color: 'var(--text-muted)' }}>#{idx + 1}</span>
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
                              <span className="text-[10px] w-5" style={{ color: 'var(--text-muted)' }}>#{idx + 1}</span>
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
                              <span className="text-[10px] w-5" style={{ color: 'var(--text-muted)' }}>#{idx + 1}</span>
                              <span>{a.icon}</span>
                              <span>{a.name}</span>
                              <span>📋</span>
                            </button>
                          )}
                        </td>

                        <td className="py-1.5 px-2 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-black tabular-nums text-xs" style={{ color: 'var(--zelda-gold)' }}>
                              {t.dynamicScore}
                            </span>
                            <span className="text-[10.5px]" style={{ color: 'var(--text-sub)' }}>
                              {a.visit}
                            </span>
                            {(t.liveVisits > 0 || t.liveUpdates > 0) && (
                              <span className="text-[10px] font-bold" style={{ color: 'var(--zelda-cyan)' }}>
                                (実測{t.liveVisits}回)
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-1.5 px-2 whitespace-nowrap">
                          <div className="flex items-center gap-1.5" title={a.wasteNote}>
                            <span
                              className="px-1.5 py-0.5 rounded border text-[10px] font-black"
                              style={{ background: statusBadge.bg, borderColor: statusBadge.border, color: statusBadge.color }}
                            >
                              {statusBadge.label}
                            </span>
                            <span className="text-[10px] truncate max-w-[140px]" style={{ color: 'var(--text-muted)' }}>
                              {a.sizeLabel}
                            </span>
                          </div>
                        </td>

                        <td className="py-1.5 px-2 whitespace-nowrap text-right">
                          <div className="inline-flex items-center gap-1">
                            {a.internalTab ? (
                              <button
                                type="button"
                                onClick={() => {
                                  recordAppClick(a.id);
                                  onNavigate(a.internalTab!);
                                }}
                                className="px-2 py-0.5 rounded border font-bold text-[10.5px]"
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
                                className="px-2 py-0.5 rounded border font-bold text-[10.5px]"
                                style={{ borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)' }}
                              >
                                Open↗
                              </a>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard?.writeText(a.localPath).catch(() => {});
                                  notify(`📋 Copied: ${a.localPath}`);
                                }}
                                className="px-2 py-0.5 rounded border font-bold text-[10.5px]"
                                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                              >
                                Path
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setEditingUrlId(a.id)}
                              title="Edit App URL"
                              className="px-1.5 py-0.5 rounded border text-[10.5px]"
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
                              title="休眠マーク / 解除"
                              className="px-1.5 py-0.5 rounded border text-[10.5px]"
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
                                notify(`🔥 Removed ${a.name}`);
                              }}
                              title="削除"
                              className="px-1.5 py-0.5 rounded border font-bold text-[10.5px]"
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
      </div>

      {/* ROW 4: 既存アプリの修正点 ＆ 未作成の新規アプリ案（ホバー/クリックで詳細・Antigravityプロンプト・追加アイデア入力） */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
        {/* 左：既存アプリの修正指示 */}
        <div
          className="p-4 rounded-lg border space-y-3 shadow-sm"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="space-y-2">
            <div>
              <h3 className="text-sm font-black">🛠️ 既存アプリの修正（Antigravity指示キュー）</h3>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                （既存アプリを選んで修正を追加・カーソルまたはクリックでAntigravityプロンプト＆追加アイデア入力）
              </span>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!taskIn.trim()) return;
                const targetApp = apps.find((a) => a.id === fixAppId) || apps[0];
                const next: FixTaskItem[] = [
                  {
                    id: `fix_${Date.now()}`,
                    appId: targetApp.id,
                    appName: targetApp.name,
                    localPath: targetApp.localPath,
                    title: taskIn.trim(),
                    detail: taskDetailIn.trim() || `${targetApp.name} の改善・修正`,
                    subIdeas: [],
                  },
                  ...tasks,
                ];
                setTasks(next);
                setTaskIn('');
                setTaskDetailIn('');
                persistNotesToCloud(next, ideas);
              }}
              className="flex flex-wrap gap-1.5"
            >
              <select
                value={fixAppId}
                onChange={(e) => setFixAppId(e.target.value)}
                className="px-2 py-1 rounded border text-xs font-bold"
                style={{ background: 'var(--bg-card2)', borderColor: 'var(--zelda-gold)', color: 'var(--text)' }}
              >
                {apps.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.icon} {a.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={taskIn}
                onChange={(e) => setTaskIn(e.target.value)}
                placeholder="＋修正タイトル"
                className="w-32 px-2 py-1 rounded border text-xs"
                style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
              />
              <input
                type="text"
                value={taskDetailIn}
                onChange={(e) => setTaskDetailIn(e.target.value)}
                placeholder="修正の詳細(任意)"
                className="flex-1 min-w-[120px] px-2 py-1 rounded border text-xs"
                style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
              />
              <button
                type="submit"
                className="px-3 py-1 rounded font-black border text-xs"
                style={{ borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)' }}
              >
                追加
              </button>
            </form>
          </div>

          <div className="flex flex-wrap items-center gap-2 font-bold">
            {tasks.map((t) => {
              const isPinned = pinnedFixId === t.id;
              const promptStr = buildFixPrompt(t);
              return (
                <div key={t.id} className="relative group">
                  <div
                    className="px-2.5 py-1 rounded-md border flex items-center gap-1.5 text-xs cursor-pointer transition"
                    style={{
                      background: isPinned ? 'rgba(217, 168, 78, 0.22)' : 'var(--bg-card2)',
                      borderColor: isPinned ? 'var(--zelda-gold)' : 'var(--border)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setPinnedFixId(isPinned ? null : t.id)}
                      className="text-left flex items-center gap-1"
                    >
                      <span>🛠️ {t.appName}: {t.title}</span>
                      {t.subIdeas.length > 0 && (
                        <span className="text-[10px] px-1 rounded" style={{ background: 'rgba(217,168,78,0.2)', color: 'var(--zelda-gold)' }}>
                          +{t.subIdeas.length}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = tasks.filter((x) => x.id !== t.id);
                        setTasks(next);
                        if (isPinned) setPinnedFixId(null);
                        persistNotesToCloud(next, ideas);
                      }}
                      className="opacity-60 hover:opacity-100"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Interactive Hover / Pinned Popover with Antigravity Prompt & Sub-Ideas */}
                  <div
                    className={`${
                      isPinned ? 'block' : 'hidden group-hover:block'
                    } absolute bottom-full left-0 pb-2 z-50 w-80 sm:w-96`}
                  >
                    <div
                      className="p-3 rounded-lg border-2 shadow-2xl space-y-2"
                      style={{ background: 'var(--bg-card)', borderColor: 'var(--zelda-gold)', color: 'var(--text)' }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-black" style={{ color: 'var(--zelda-gold)' }}>
                            🛠️ {t.appName} — {t.title}
                          </div>
                          <div className="text-[10px] font-mono" style={{ color: 'var(--zelda-cyan)' }}>
                            {t.localPath}
                          </div>
                        </div>
                        {isPinned && (
                          <button
                            type="button"
                            onClick={() => setPinnedFixId(null)}
                            className="text-[10px] px-1.5 py-0.5 rounded border"
                            style={{ borderColor: 'var(--border)' }}
                          >
                            閉じる
                          </button>
                        )}
                      </div>

                      <div className="text-[11px] font-normal leading-relaxed" style={{ color: 'var(--text-sub)' }}>
                        {t.detail}
                      </div>

                      {t.subIdeas.length > 0 && (
                        <div className="space-y-1 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                          <div className="text-[10px] font-black" style={{ color: 'var(--zelda-gold)' }}>
                            追加された修正アイデア:
                          </div>
                          {t.subIdeas.map((si, idx) => (
                            <div key={idx} className="text-[11px] font-normal flex items-center justify-between gap-1">
                              <span>• {si}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const next = tasks.map((x) =>
                                    x.id === t.id
                                      ? { ...x, subIdeas: x.subIdeas.filter((_, sIdx) => sIdx !== idx) }
                                      : x
                                  );
                                  setTasks(next);
                                  persistNotesToCloud(next, ideas);
                                }}
                                className="opacity-50 hover:opacity-100 text-[10px]"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 追加の修正アイデアを同じ項目に足すフォーム */}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const val = (subIdeaDrafts[t.id] || '').trim();
                          if (!val) return;
                          const next = tasks.map((x) =>
                            x.id === t.id ? { ...x, subIdeas: [...x.subIdeas, val] } : x
                          );
                          setTasks(next);
                          setSubIdeaDrafts((prev) => ({ ...prev, [t.id]: '' }));
                          persistNotesToCloud(next, ideas);
                        }}
                        className="flex gap-1 pt-1"
                      >
                        <input
                          type="text"
                          value={subIdeaDrafts[t.id] || ''}
                          onChange={(e) => setSubIdeaDrafts((prev) => ({ ...prev, [t.id]: e.target.value }))}
                          placeholder="＋この修正に追加アイデアを追記..."
                          className="flex-1 px-2 py-1 rounded border text-[11px] font-normal"
                          style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
                        />
                        <button
                          type="submit"
                          className="px-2 py-1 rounded border text-[10px] font-black"
                          style={{ borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)' }}
                        >
                          追記
                        </button>
                      </form>

                      {/* Antigravity指示プロンプト表示＆コピー */}
                      <div className="p-2 rounded border space-y-1.5" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black" style={{ color: 'var(--zelda-cyan)' }}>
                            🤖 Antigravity 指示プロンプト:
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(promptStr).catch(() => {});
                              notify(`📋 Antigravity用プロンプトをコピーしました (${t.appName})`);
                            }}
                            className="px-2 py-0.5 rounded font-black text-[10px]"
                            style={{ background: 'var(--accent)', color: '#1e1a16' }}
                          >
                            📋 コピー
                          </button>
                        </div>
                        <pre className="text-[10px] font-normal whitespace-pre-wrap leading-snug" style={{ color: 'var(--text-muted)' }}>
                          {promptStr}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 右：まだ存在していない新規アプリ案（同じアプリ案に何度でも追加アイデアを足せる） */}
        <div
          className="p-4 rounded-lg border space-y-3 shadow-sm"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="space-y-2">
            <div>
              <h3 className="text-sm font-black">💡 未作成の新規アプリ案（アイデア蓄積）</h3>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                （まだ存在していないアプリの構想。カーソルまたはクリックで同じアプリ案にアイデアを追記＆プロンプトコピー）
              </span>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!ideaIn.trim()) return;
                const next: NewAppIdeaItem[] = [
                  {
                    id: `idea_${Date.now()}`,
                    title: `🚀 ${ideaIn.trim()}`,
                    target: '新規構想',
                    detail: ideaDetailIn.trim() || 'アプリ概要メモ未設定',
                    subIdeas: [],
                  },
                  ...ideas,
                ];
                setIdeas(next);
                setIdeaIn('');
                setIdeaDetailIn('');
                persistNotesToCloud(tasks, next);
              }}
              className="flex flex-wrap gap-1.5"
            >
              <input
                type="text"
                value={ideaIn}
                onChange={(e) => setIdeaIn(e.target.value)}
                placeholder="＋新規アプリ名"
                className="w-32 px-2 py-1 rounded border text-xs"
                style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
              />
              <input
                type="text"
                value={ideaDetailIn}
                onChange={(e) => setIdeaDetailIn(e.target.value)}
                placeholder="概要メモ(任意)"
                className="flex-1 min-w-[120px] px-2 py-1 rounded border text-xs"
                style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
              />
              <button
                type="submit"
                className="px-3 py-1 rounded font-black border text-xs"
                style={{ borderColor: 'var(--zelda-cyan)', color: 'var(--zelda-cyan)' }}
              >
                追加
              </button>
            </form>
          </div>

          <div className="flex flex-wrap items-center gap-2 font-bold">
            {ideas.map((idea) => {
              const isPinned = pinnedIdeaId === idea.id;
              const promptStr = buildIdeaPrompt(idea);
              return (
                <div key={idea.id} className="relative group">
                  <div
                    className="px-2.5 py-1 rounded-md border flex items-center gap-1.5 text-xs cursor-pointer transition"
                    style={{
                      background: isPinned ? 'rgba(106, 174, 192, 0.2)' : 'var(--bg-card2)',
                      borderColor: 'var(--zelda-cyan)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setPinnedIdeaId(isPinned ? null : idea.id)}
                      className="text-left flex items-center gap-1"
                    >
                      <span>{idea.title}</span>
                      {idea.subIdeas.length > 0 && (
                        <span className="text-[10px] px-1 rounded" style={{ background: 'rgba(106,174,192,0.2)', color: 'var(--zelda-cyan)' }}>
                          +{idea.subIdeas.length}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = ideas.filter((x) => x.id !== idea.id);
                        setIdeas(next);
                        if (isPinned) setPinnedIdeaId(null);
                        persistNotesToCloud(tasks, next);
                      }}
                      className="opacity-60 hover:opacity-100"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Interactive Hover / Pinned Popover with Sub-Ideas & Creation Prompt */}
                  <div
                    className={`${
                      isPinned ? 'block' : 'hidden group-hover:block'
                    } absolute bottom-full left-0 pb-2 z-50 w-80 sm:w-96`}
                  >
                    <div
                      className="p-3 rounded-lg border-2 shadow-2xl space-y-2"
                      style={{ background: 'var(--bg-card)', borderColor: 'var(--zelda-cyan)', color: 'var(--text)' }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-black" style={{ color: 'var(--zelda-cyan)' }}>
                            {idea.title}
                          </div>
                          <div className="text-[10px] font-bold" style={{ color: 'var(--zelda-gold)' }}>
                            連携領域: {idea.target}
                          </div>
                        </div>
                        {isPinned && (
                          <button
                            type="button"
                            onClick={() => setPinnedIdeaId(null)}
                            className="text-[10px] px-1.5 py-0.5 rounded border"
                            style={{ borderColor: 'var(--border)' }}
                          >
                            閉じる
                          </button>
                        )}
                      </div>

                      <div className="text-[11px] font-normal leading-relaxed" style={{ color: 'var(--text-sub)' }}>
                        {idea.detail}
                      </div>

                      {idea.subIdeas.length > 0 && (
                        <div className="space-y-1 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                          <div className="text-[10px] font-black" style={{ color: 'var(--zelda-cyan)' }}>
                            追加された機能アイデア:
                          </div>
                          {idea.subIdeas.map((si, idx) => (
                            <div key={idx} className="text-[11px] font-normal flex items-center justify-between gap-1">
                              <span>• {si}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const next = ideas.map((x) =>
                                    x.id === idea.id
                                      ? { ...x, subIdeas: x.subIdeas.filter((_, sIdx) => sIdx !== idx) }
                                      : x
                                  );
                                  setIdeas(next);
                                  persistNotesToCloud(tasks, next);
                                }}
                                className="opacity-50 hover:opacity-100 text-[10px]"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 同じ新規アプリ案へ後から何度でもアイデアを追記できるフォーム */}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const val = (subIdeaDrafts[idea.id] || '').trim();
                          if (!val) return;
                          const next = ideas.map((x) =>
                            x.id === idea.id ? { ...x, subIdeas: [...x.subIdeas, val] } : x
                          );
                          setIdeas(next);
                          setSubIdeaDrafts((prev) => ({ ...prev, [idea.id]: '' }));
                          persistNotesToCloud(tasks, next);
                        }}
                        className="flex gap-1 pt-1"
                      >
                        <input
                          type="text"
                          value={subIdeaDrafts[idea.id] || ''}
                          onChange={(e) => setSubIdeaDrafts((prev) => ({ ...prev, [idea.id]: e.target.value }))}
                          placeholder="＋このアプリ案に追加アイデアを追記..."
                          className="flex-1 px-2 py-1 rounded border text-[11px] font-normal"
                          style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
                        />
                        <button
                          type="submit"
                          className="px-2 py-1 rounded border text-[10px] font-black"
                          style={{ borderColor: 'var(--zelda-cyan)', color: 'var(--zelda-cyan)' }}
                        >
                          追記
                        </button>
                      </form>

                      {/* Antigravity新規作成プロンプト表示＆コピー */}
                      <div className="p-2 rounded border space-y-1.5" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black" style={{ color: 'var(--zelda-gold)' }}>
                            🤖 Antigravity 作成プロンプト:
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(promptStr).catch(() => {});
                              notify(`📋 新規アプリ作成プロンプトをコピーしました (${idea.title})`);
                            }}
                            className="px-2 py-0.5 rounded font-black text-[10px]"
                            style={{ background: 'var(--accent)', color: '#1e1a16' }}
                          >
                            📋 コピー
                          </button>
                        </div>
                        <pre className="text-[10px] font-normal whitespace-pre-wrap leading-snug" style={{ color: 'var(--text-muted)' }}>
                          {promptStr}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
