'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { loadLinkUrls, saveLinkUrl } from '@/data/links';
import type { BodyMetric, DailyNutrition } from '@/types';

interface HubCalendarTask {
  id: string;
  date: string; // "YYYY-MM-DD"
  icon: string;
  label: string;
  targetApp: string;
  kvKey: string;
  category: 'ir' | 'econ' | 'csv' | 'health' | 'money' | 'media' | 'custom';
  done: boolean;
  recurrence?: string;
  note?: string;
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

interface EmailPurchaseItem {
  id: string;
  date: string;
  store: string;
  itemName: string;
  amount: number;
  pointsUsed?: number;
  netAmount?: number;
  isBook?: boolean;
}

const TODAY_ISO = new Date().toISOString().slice(0, 10);
const TELEMETRY_KEY = 'agy_page_telemetry_v1';
const CALENDAR_KV_KEY = 'agy_hub_calendar_v1';
const GAS_SCRIPT_SNIPPET = `function syncGmailToLifeHub() {
  const API = "https://health-dashboard-dusky-xi.vercel.app/api/gmail/ingest?key=0a0b42d75ffabbd9acd1e5fa2fe80df0";
  const LABEL_NAME = "LifeHub同期済";
  const label = GmailApp.getUserLabelByName(LABEL_NAME) || GmailApp.createLabel(LABEL_NAME);

  const queries = [
    // ① 楽天証券 決算発表予定日メール
    {
      q: 'from:service@rakuten-sec.co.jp subject:"決算発表予定日" newer_than:14d -label:' + LABEL_NAME,
      mode: "ir"
    },
    // ② ネット購入メール全般（Amazon / メルカリ / 楽天 / Yahoo / ZOZOTOWN / ヨドバシ / ユニクロ / 無印 / Apple / iHerb / JAL / 汎用EC）
    {
      q: '(from:amazon.co.jp OR from:mercari OR from:rakuten.co.jp OR from:yahoo.co.jp OR from:zozo.jp OR from:yodobashi.com OR from:biccamera.com OR from:uniqlo.com OR from:muji.com OR from:apple.com OR from:nike.com OR from:iherb.com OR from:jal.co.jp OR subject:("ご注文ありがとう" OR "ご注文確認" OR "ご注文の確認" OR "注文内容ご確認" OR "ご購入ありがとう" OR "購入が完了" OR "お買い上げありがとう" OR "領収書" OR "Order Confirmation" OR "Thank you for your order")) -category:promotions -subject:(メルマガ OR ニュースレター OR クーポン OR ポイント失効 OR 発送のお知らせ) newer_than:7d -label:' + LABEL_NAME,
      mode: "purchase"
    }
  ];

  queries.forEach(({ q, mode }) => {
    GmailApp.search(q, 0, 20).forEach(thread => {
      const msg = thread.getMessages().pop();
      const res = UrlFetchApp.fetch(API, {
        method: "post",
        contentType: "application/json",
        muteHttpExceptions: true,
        payload: JSON.stringify({
          mode,
          subject: msg.getSubject(),
          from: msg.getFrom(),
          body: msg.getPlainBody()
        })
      });
      if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) {
        thread.addLabel(label);
      }
    });
  });
}`;

// 指定年月の定期タスクを自動生成（第1金曜:米雇用 / 毎月1日:10年債 / 第1土曜:買い物CSV / 第1日曜:TANITA・食事・MF / 毎週土曜:思考CSV→Podcast / 月末最終日曜:動画視聴記録）
function generateRecurringTasksForMonth(year: number, month: number): HubCalendarTask[] {
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const fmt = (d: number) => `${ym}-${String(d).padStart(2, '0')}`;

  let firstFri = 1;
  let firstSat = 1;
  let firstSun = 1;
  let lastSun = daysInMonth;
  const allSats: number[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay(); // 0=Sun..6=Sat
    if (dow === 5 && firstFri === 1 && new Date(year, month - 1, 1).getDay() !== 5) firstFri = d;
    if (dow === 6) {
      if (allSats.length === 0) firstSat = d;
      allSats.push(d);
    }
    if (dow === 0) {
      if (firstSun === 1 && new Date(year, month - 1, 1).getDay() !== 0) firstSun = d;
      lastSun = d;
    }
  }
  if (new Date(year, month - 1, 1).getDay() === 5) firstFri = 1;
  if (new Date(year, month - 1, 1).getDay() === 0) firstSun = 1;

  const list: HubCalendarTask[] = [
    {
      id: `rec_yield_${ym}`,
      date: fmt(1),
      icon: '🏦',
      label: '日米10年債(月初)',
      targetApp: 'Money: Macro',
      kvKey: `yield_${ym}`,
      category: 'econ',
      done: fmt(1) < '2026-11-28',
      recurrence: '毎月1日',
    },
    {
      id: `rec_nfp_${ym}`,
      date: fmt(firstFri),
      icon: '💼',
      label: '米雇用統計・失業率',
      targetApp: 'Money: Macro',
      kvKey: `nfp_${ym}`,
      category: 'econ',
      done: fmt(firstFri) < '2026-11-28',
      recurrence: '毎月第1金曜',
    },
    {
      id: `rec_shopping_${ym}`,
      date: fmt(firstSat),
      icon: '🍎',
      label: '買い物詳細CSV取込',
      targetApp: 'Lifelog: Pantry',
      kvKey: `shopping_csv_${ym}`,
      category: 'csv',
      done: fmt(firstSat) < '2026-11-28',
      recurrence: '毎月第1土曜',
    },
    {
      id: `rec_health_${ym}`,
      date: fmt(firstSun),
      icon: '⚖️',
      label: 'TANITA体重・食事CSV',
      targetApp: 'Life: Health',
      kvKey: `health_csv_${ym}`,
      category: 'health',
      done: fmt(firstSun) < '2026-11-28',
      recurrence: '毎月第1日曜',
    },
    {
      id: `rec_mf_${ym}`,
      date: fmt(firstSun),
      icon: '🧾',
      label: 'MoneyForward取込',
      targetApp: 'Money: Budget',
      kvKey: `mf_budget_${ym}`,
      category: 'money',
      done: fmt(firstSun) < '2026-11-28',
      recurrence: '毎月第1日曜',
    },
    {
      id: `rec_cpi_${ym}`,
      date: fmt(Math.min(12, daysInMonth)),
      icon: '📈',
      label: '米CPI・コアPPI確認',
      targetApp: 'Money: Macro',
      kvKey: `cpi_${ym}`,
      category: 'econ',
      done: fmt(12) < '2026-11-28',
      recurrence: '毎月12日頃',
    },
    {
      id: `rec_media_${ym}`,
      date: fmt(lastSun),
      icon: '🎬',
      label: 'Netflix/Prime視聴記録',
      targetApp: 'Lifelog: Books',
      kvKey: `media_watch_${ym}`,
      category: 'media',
      done: false,
      recurrence: '月末最終日曜',
    },
  ];

  // 毎週土曜日：iPhone思考メモCSV → Podcast運用テーブル
  allSats.forEach((satDay, idx) => {
    list.push({
      id: `rec_thought_${ym}_w${idx + 1}`,
      date: fmt(satDay),
      icon: '🎙️',
      label: `思考CSV→Podcast (W${idx + 1})`,
      targetApp: 'Life: Podcast',
      kvKey: `thought_csv_${ym}_w${idx + 1}`,
      category: 'csv',
      done: fmt(satDay) < '2026-11-28',
      recurrence: '毎週土曜',
    });
  });

  // 楽天証券メールから既知の決算予定日（シード）
  if (ym === '2026-11') {
    list.push(
      { id: 'ir_4751_2026-11-11', date: '2026-11-11', icon: '🏢', label: '決算: サイバーエージェント(4751)', targetApp: 'Money: Stocks', kvKey: 'ir_4751_202611', category: 'ir', done: true, note: '楽天証券メールより' },
      { id: 'ir_7389_2026-11-13', date: '2026-11-13', icon: '🏢', label: '決算: あいちFG(7389)', targetApp: 'Money: Stocks', kvKey: 'ir_7389_202611', category: 'ir', done: true, note: '楽天証券メールより' }
    );
  }
  if (ym === '2026-12') {
    list.push(
      { id: 'econ_2026-12-04', date: '2026-12-04', icon: '💼', label: '米雇用統計(11月分) 22:30', targetApp: 'Money: Macro', kvKey: 'nfp_202611', category: 'econ', done: false, note: '公式発表予定日' },
      { id: 'econ_2026-12-10', date: '2026-12-10', icon: '📈', label: '米CPI(11月分) 22:30', targetApp: 'Money: Macro', kvKey: 'cpi_202611', category: 'econ', done: false, note: '公式発表予定日' },
      { id: 'econ_2026-12-14', date: '2026-12-14', icon: '🏭', label: '日銀短観(Q4) 08:50', targetApp: 'Money: Macro', kvKey: 'tankan_2026q4', category: 'econ', done: false, note: '公式発表予定日' }
    );
  }

  return list;
}

const INITIAL_APPS: AppItem[] = [
  // Money (6)
  { id: 'money-economics', suite: 'money', suiteLabel: 'Money', icon: '🌐', name: 'Money: Macro', score: 94, visit: '週3-4回・10分', visitScore: 93, design: 96, btnLabel: '28 / 死0', btnCount: 28, sizeLabel: '140MB', mb: 140, url: 'https://money-dashboard-iota-three.vercel.app/economics', localPath: '~/money-dashboard/app/economics', muted: false, wasteNote: '月移動カレンダー＋大型グラフ稼働中' },
  { id: 'money-assets', suite: 'money', suiteLabel: 'Money', icon: '📈', name: 'Money: Assets', score: 92, visit: '週2-3回・8分', visitScore: 90, design: 92, btnLabel: '22 / 死0', btnCount: 22, sizeLabel: '140MB', mb: 140, url: 'https://money-dashboard-iota-three.vercel.app/assets', localPath: '~/money-dashboard/app/assets', muted: false, wasteNote: 'NISA・投信残高トラッキング主力' },
  { id: 'money-budget', suite: 'money', suiteLabel: 'Money', icon: '🧾', name: 'Money: Budget', score: 90, visit: '週2-3回・12分', visitScore: 88, design: 90, btnLabel: '19 / 死0', btnCount: 19, sizeLabel: '140MB', mb: 140, url: 'https://money-dashboard-iota-three.vercel.app/budget', localPath: '~/money-dashboard/app/budget', muted: false, wasteNote: 'MoneyForward・Amex集計稼働中' },
  { id: 'money-home', suite: 'money', suiteLabel: 'Money', icon: '💰', name: 'Money: Home', score: 88, visit: '週2-3回・5分', visitScore: 85, design: 90, btnLabel: '14 / 死0', btnCount: 14, sizeLabel: '139MB', mb: 139, url: 'https://money-dashboard-iota-three.vercel.app/', localPath: '~/money-dashboard/app', muted: false, wasteNote: '資産・IRサマリー画面' },
  { id: 'money-companies', suite: 'money', suiteLabel: 'Money', icon: '🏢', name: 'Money: Stocks', score: 81, visit: '月2-4回・10分', visitScore: 72, design: 88, btnLabel: '16 / 死1', btnCount: 16, sizeLabel: '139MB', mb: 139, url: 'https://money-dashboard-iota-three.vercel.app/companies', localPath: '~/money-dashboard/app/companies', muted: false, wasteNote: '決算時期のみ訪問（楽天証券メール連携対応）' },
  { id: 'money-lifeplan', suite: 'money', suiteLabel: 'Money', icon: '🧭', name: 'Money: Plan', score: 73, visit: '月1回未満・3分', visitScore: 58, design: 86, btnLabel: '8 / 死0', btnCount: 8, sizeLabel: '139MB', mb: 139, url: 'https://money-dashboard-iota-three.vercel.app/lifeplan', localPath: '~/money-dashboard/app/lifeplan', muted: false, wasteNote: '長期シミュレーション（訪問頻度低・要確認）' },
  // Life (3)
  { id: 'life-home', suite: 'life', suiteLabel: 'Life', icon: '🏠', name: 'Life: Hub', score: 95, visit: '毎日・8分', visitScore: 98, design: 95, btnLabel: '45 / 死0', btnCount: 45, sizeLabel: '376MB', mb: 376, url: 'https://health-dashboard-dusky-xi.vercel.app', internalTab: 'home', localPath: '~/health-dashboard/components/tabs/HomeTab.tsx', muted: false, wasteNote: 'メイン起点ハブ（毎日稼働）' },
  { id: 'life-health', suite: 'life', suiteLabel: 'Life', icon: '🏃', name: 'Life: Health', score: 89, visit: '毎日・5分', visitScore: 91, design: 88, btnLabel: '36 / 死0', btnCount: 36, sizeLabel: '377MB', mb: 377, url: 'https://health-dashboard-dusky-xi.vercel.app', internalTab: 'health', localPath: '~/health-dashboard/app/page.tsx', muted: false, wasteNote: 'Health Planet & あすけん連携稼働中' },
  { id: 'life-podcast', suite: 'life', suiteLabel: 'Life', icon: '🎙️', name: 'Life: Podcast', score: 88, visit: '週1-2回・15分', visitScore: 86, design: 92, btnLabel: '18 / 死0', btnCount: 18, sizeLabel: '12MB', mb: 12, url: 'https://health-dashboard-dusky-xi.vercel.app', internalTab: 'podcast', localPath: '~/health-dashboard/components/tabs/PodcastTab.tsx', muted: false, wasteNote: '思考CSV→Geminiスペイン語台本→YT/Spotify運用' },
  // Lifelog (5)
  { id: 'kaimono', suite: 'lifelog', suiteLabel: 'Lifelog', icon: '🍎', name: 'Lifelog: Pantry', score: 88, visit: '週3-5回', visitScore: 92, design: 98, btnLabel: '81 / 死0', btnCount: 81, sizeLabel: '240KB', mb: 0.24, url: 'http://127.0.0.1:8788/?view=overview', lifelogView: 'overview', localPath: '~/.gemini/antigravity/scratch/kaimono-lifelog', muted: false, wasteNote: '買い出し・消耗品サイクル主力' },
  { id: 'kaimono-assets', suite: 'lifelog', suiteLabel: 'Lifelog', icon: '⚔️', name: 'Lifelog: Gear', score: 86, visit: '週2-4回', visitScore: 88, design: 96, btnLabel: '87点管理', btnCount: 87, sizeLabel: '240KB', mb: 0.24, url: 'http://127.0.0.1:8788/?view=assets', lifelogView: 'assets', localPath: '~/.gemini/antigravity/scratch/kaimono-lifelog', muted: false, wasteNote: '87アイテム減価償却・コスパ稼働中' },
  { id: 'kaimono-books', suite: 'lifelog', suiteLabel: 'Lifelog', icon: '📖', name: 'Lifelog: Books', score: 87, visit: '週2-3回', visitScore: 86, design: 96, btnLabel: '30冊+視聴', btnCount: 30, sizeLabel: '240KB', mb: 0.24, url: 'http://127.0.0.1:8788/?view=books', lifelogView: 'books', localPath: '~/.gemini/antigravity/scratch/kaimono-lifelog', muted: false, wasteNote: 'iPhone自動積読＋Netflix/Prime視聴記録対応' },
  { id: 'kaimono-mindset', suite: 'lifelog', suiteLabel: 'Lifelog', icon: '🧭', name: 'Lifelog: Mindset', score: 79, visit: '月2-4回', visitScore: 72, design: 94, btnLabel: '12ノード', btnCount: 12, sizeLabel: '240KB', mb: 0.24, url: 'http://127.0.0.1:8788/?view=mindset-map', lifelogView: 'mindset-map', localPath: '~/.gemini/antigravity/scratch/kaimono-lifelog', muted: false, wasteNote: '月次振り返り用（更新頻度やや低）' },
  { id: 'kaimono-self', suite: 'lifelog', suiteLabel: 'Lifelog', icon: '🪞', name: 'Lifelog: Profile', score: 75, visit: '月1-2回', visitScore: 65, design: 92, btnLabel: '6セクション', btnCount: 6, sizeLabel: '240KB', mb: 0.24, url: 'http://127.0.0.1:8788/?view=self-analysis', lifelogView: 'self-analysis', localPath: '~/.gemini/antigravity/scratch/kaimono-lifelog', muted: false, wasteNote: '固定プロフィール（アクセス頻度低・要確認）' },
  // Other (11)
  { id: 'tvid', suite: 'other', suiteLabel: 'Other', icon: '🎥', name: 'Tennis Video', score: 86, visit: '週2-3回・25分', visitScore: 91, design: 85, btnLabel: '138 / 死2', btnCount: 140, sizeLabel: '58MB', mb: 58, url: 'http://localhost:8090', localPath: '~/tennis-score/tools', muted: false, wasteNote: '試合動画編集で高稼働' },
  { id: 'spanish', suite: 'other', suiteLabel: 'Other', icon: '🇪🇸', name: 'Spanish Lab', score: 85, visit: '週4-5回・5分', visitScore: 82, design: 85, btnLabel: '24 / 死0', btnCount: 24, sizeLabel: '380KB', mb: 0.38, url: 'https://spanish-app-kappa-mauve.vercel.app', localPath: '~/spanish-learning-app', muted: false, wasteNote: '軽量・語学学習で継続稼働' },
  { id: 'tennis', suite: 'other', suiteLabel: 'Other', icon: '🎾', name: 'Tennis Score', score: 84, visit: '週2-3回・20分', visitScore: 89, design: 82, btnLabel: '146 / 死19', btnCount: 165, sizeLabel: '876MB', mb: 876, url: 'https://tennis-score-pi.vercel.app', localPath: '~/tennis-score', muted: false, wasteNote: '稼働中だが死ボタン19個・容量大' },
  { id: 'rio', suite: 'other', suiteLabel: 'Other', icon: '🏆', name: 'RIO Rank', score: 80, visit: '月2-4回・3分', visitScore: 67, design: 88, btnLabel: '19 / 死0', btnCount: 19, sizeLabel: '212KB', mb: 0.21, url: 'https://rio-rankings.vercel.app', localPath: '~/rio-rankings', muted: false, wasteNote: '大会後のみアクセス（軽量）' },
  { id: 'rally', suite: 'other', suiteLabel: 'Other', icon: '🎬', name: 'Rally Cutter', score: 77, visit: '月2-3回・10分', visitScore: 70, design: 84, btnLabel: '9 / 死0', btnCount: 9, sizeLabel: '11MB', mb: 11, url: 'http://localhost:8088', localPath: '~/.gemini/antigravity/scratch/tennis-rally-cutter', muted: false, wasteNote: 'ラリー抽出補助ツール' },
  { id: 'yt', suite: 'other', suiteLabel: 'Other', icon: '▶️', name: 'YT Summary', score: 76, visit: '毎日自動', visitScore: 73, design: 72, btnLabel: '0 (GAS自動)', btnCount: 0, sizeLabel: '40KB', mb: 0.04, url: 'https://script.google.com', localPath: '~/.gemini/antigravity/scratch/youtube_summarizer', muted: false, wasteNote: 'バックグラウンド自動稼働' },
  { id: 'vauto', suite: 'other', suiteLabel: 'Other', icon: '🎞️', name: 'Video Editor', score: 71, visit: '月1-2回・8分', visitScore: 58, design: 70, btnLabel: '4 / 死2', btnCount: 6, sizeLabel: '502MB', mb: 502, url: 'http://localhost:8000/resolve', localPath: '~/video-auto-editor', muted: false, wasteNote: '502MB占有・Tennis Videoと機能重複気味' },
  { id: 'imgdec', suite: 'other', suiteLabel: 'Other', icon: '🧩', name: 'Image Split', score: 48, visit: '放置・0分', visitScore: 5, design: 60, btnLabel: '23 (放置)', btnCount: 23, sizeLabel: '305MB', mb: 305, url: '', localPath: '~/.gemini/antigravity/scratch/image-decomposer-app', muted: true, wasteNote: '🚨 完全放置・305MB無駄（削除候補）' },
  { id: 'pvid', suite: 'other', suiteLabel: 'Other', icon: '🎙️', name: 'Podcast Video', score: 47, visit: '休眠・0分', visitScore: 13, design: 55, btnLabel: '1 (休眠)', btnCount: 1, sizeLabel: '1.2GB', mb: 1228, url: '', localPath: '~/.gemini/antigravity/scratch/podcast-video-generator', muted: true, wasteNote: '🚨 休眠中・1.2GB無駄（削除候補）' },
  { id: 'cisland', suite: 'other', suiteLabel: 'Other', icon: '🏝️', name: 'Claude Island', score: 46, visit: '休眠・0分', visitScore: 5, design: 68, btnLabel: '0 (遺物)', btnCount: 0, sizeLabel: '469MB', mb: 469, url: '', localPath: '~/ClaudeIsland', muted: true, wasteNote: '🚨 アクセス0・469MB無駄（削除候補）' },
  { id: 'palign', suite: 'other', suiteLabel: 'Other', icon: '🎚️', name: 'Podcast Align', score: 34, visit: '休眠・0分', visitScore: 5, design: 20, btnLabel: '0 (削除推奨)', btnCount: 0, sizeLabel: '1.3GB', mb: 1331, url: '', localPath: '~/podcast-align', muted: true, wasteNote: '🚨 アクセス0・1.3GB無駄（最優先削除候補）' },
];

const INITIAL_TASKS: FixTaskItem[] = [
  { id: 'fix-tvid-mp4', appId: 'tvid', appName: 'Tennis Video', localPath: '~/tennis-score/tools', title: 'Delete Raw MP4s', detail: '動画編集後の元MP4ファイルや書き出しキャッシュを削除して数GBの空き容量を確保する。', subIdeas: ['書き出し完了後に元動画を自動アーカイブするボタンを追加'] },
  { id: 'fix-tennis-links', appId: 'tennis', appName: 'Tennis Score', localPath: '~/tennis-score', title: 'Fix Dead Links (19件)', detail: '死ボタン19個と未実装リンクを整理・修正し、全ボタンが正常に動作する状態にする。', subIdeas: ['未プッシュの24コミットも合わせてGitHubへPush'] },
  { id: 'fix-kaimono-git', appId: 'kaimono', appName: 'Lifelog: Pantry', localPath: '~/.gemini/antigravity/scratch/kaimono-lifelog', title: 'Git Init & Cloud Sync', detail: 'ローカルサーバー運用中のLifelogをGit管理化し、Supabaseへの自動バックアップを追加する。', subIdeas: ['買い物CSV取込後の在庫アラート表示を強化'] },
  { id: 'fix-money-companies', appId: 'money-companies', appName: 'Money: Stocks', localPath: '~/money-dashboard/app/companies', title: 'Q3 IRデータ更新＆死ボタン修正', detail: '未更新のQ3決算データを最新化し、銘柄詳細のリンク切れ1件を修正する。', subIdeas: [] },
];

const INITIAL_IDEAS: NewAppIdeaItem[] = [
  { id: 'idea-privacy', title: '🔐 Privacy & SSO Map', target: '全アプリ共通', detail: '各アプリのSupabase認証・APIキー・外部連携権限を一画面で把握・点検できる管理マップ。', subIdeas: ['期限切れトークンの自動アラート機能'] },
  { id: 'idea-storage', title: '💾 Mac Storage Miner', target: 'Macローカル', detail: '肥大化したnode_modulesや動画キャッシュを自動検出し、ワンクリックで掃除する容量最適化ツール。', subIdeas: ['プロジェクト別の容量ランキング表示'] },
  { id: 'idea-davinci', title: '🎬 DaVinci Slimmer', target: 'Tennis Video連携', detail: 'DaVinci Resolveのプロジェクトとプロキシファイルを自動整理し、編集後の容量膨張を防ぐツール。', subIdeas: [] },
];

function buildFixPrompt(t: FixTaskItem): string {
  const extra = t.subIdeas.length > 0 ? `\n【追加の修正アイデア】\n${t.subIdeas.map((s) => `- ${s}`).join('\n')}` : '';
  return `${t.localPath} (${t.appName}) を以下の通り修正してください。\n【修正内容】${t.title}\n【詳細】${t.detail}${extra}`;
}

function buildIdeaPrompt(idea: NewAppIdeaItem): string {
  const extra = idea.subIdeas.length > 0 ? `\n【追加アイデア・機能】\n${idea.subIdeas.map((s) => `- ${s}`).join('\n')}` : '';
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
  // Calendar Month & Tasks State
  const [calYm, setCalYm] = useState('2026-11');
  const [customTasks, setCustomTasks] = useState<HubCalendarTask[]>([]);
  const [doneOverrides, setDoneOverrides] = useState<Record<string, boolean>>({});
  const [deletedCalIds, setDeletedCalIds] = useState<string[]>([]);
  const [editingCalTask, setEditingCalTask] = useState<HubCalendarTask | null>(null);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [newCalDate, setNewCalDate] = useState('2026-12-05');
  const [newCalIcon, setNewCalIcon] = useState('📌');
  const [newCalLabel, setNewCalLabel] = useState('');
  const [newCalTarget, setNewCalTarget] = useState('Life: Hub');

  // Apps & Ranking State
  const [apps, setApps] = useState<AppItem[]>(INITIAL_APPS);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [suiteFilter, setSuiteFilter] = useState<'all' | AppSuite | 'waste'>('all');
  const [editingUrlId, setEditingUrlId] = useState<string | null>(null);
  const [customUrls, setCustomUrls] = useState<Record<string, string>>({});

  // Fixes & New App Ideas State (with priority ordering + dismissed list)
  const [tasks, setTasks] = useState<FixTaskItem[]>(INITIAL_TASKS);
  const [ideas, setIdeas] = useState<NewAppIdeaItem[]>(INITIAL_IDEAS);
  const [dismissedTitles, setDismissedTitles] = useState<string[]>([]);
  const [fixAppId, setFixAppId] = useState<string>(INITIAL_APPS[0].id);
  const [taskIn, setTaskIn] = useState('');
  const [taskDetailIn, setTaskDetailIn] = useState('');
  const [ideaIn, setIdeaIn] = useState('');
  const [ideaDetailIn, setIdeaDetailIn] = useState('');
  const [pinnedFixId, setPinnedFixId] = useState<string | null>(null);
  const [pinnedIdeaId, setPinnedIdeaId] = useState<string | null>(null);
  const [subIdeaDrafts, setSubIdeaDrafts] = useState<Record<string, string>>({});
  const [suggestBusy, setSuggestBusy] = useState(false);

  // Modals: iPhone Hub & Gmail Ingest
  const [showIphoneModal, setShowIphoneModal] = useState(false);
  const [iphoneTab, setIphoneTab] = useState<'books' | 'notes'>('books');
  const [showGmailModal, setShowGmailModal] = useState(false);
  const [gmailRawText, setGmailRawText] = useState('');
  const [gmailMode, setGmailMode] = useState<'auto' | 'ir' | 'purchase'>('auto');
  const [emailPurchases, setEmailPurchases] = useState<EmailPurchaseItem[]>([]);

  const [capturedBooks, setCapturedBooks] = useState<
    { id: string; title: string; author: string; image_url: string; amazon_url: string; asin: string; status: string; capturedAt: string }[]
  >([]);
  const [offlineMemoText, setOfflineMemoText] = useState('');
  const [amazonUrlInput, setAmazonUrlInput] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeCsvTargetRef = useRef<'shopping' | 'meals' | 'thought' | 'mf' | null>(null);

  const [lifelogStats, setLifelogStats] = useState<
    Record<string, { visits: number; updates: number; last_visited_at?: string; last_updated_at?: string }>
  >({});
  const [cloudTelemetry, setCloudTelemetry] = useState<
    Record<string, { visits: number; dwellSec: number; lastVisitedAt: string }>
  >({});
  const [appAccessLogs, setAppAccessLogs] = useState<Record<string, { count: number; lastAt: string }>>({});

  const notify = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg((cur) => (cur === msg ? null : cur)), 3400);
  };

  useEffect(() => {
    try {
      setCustomUrls(loadLinkUrls());
      const savedDone = localStorage.getItem('agy_hub_cal_done_v1');
      if (savedDone) setDoneOverrides(JSON.parse(savedDone));
      const savedCustom = localStorage.getItem('agy_hub_cal_custom_v1');
      if (savedCustom) setCustomTasks(JSON.parse(savedCustom));
      const savedDelCal = localStorage.getItem('agy_hub_cal_del_v1');
      if (savedDelCal) setDeletedCalIds(JSON.parse(savedDelCal));
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
      const savedDismissed = localStorage.getItem('agy_home_dismissed_v1');
      if (savedDismissed) setDismissedTitles(JSON.parse(savedDismissed));
      const savedAccess = localStorage.getItem('hd_app_access_logs_v1');
      if (savedAccess) setAppAccessLogs(JSON.parse(savedAccess));
    } catch {}

    // Fetch Lifelog stats
    fetch('http://127.0.0.1:8788/api/stats')
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && d.views) setLifelogStats(d.views);
      })
      .catch(() => {});

    // Fetch Supabase telemetry & Gmail-ingested calendar tasks
    if (supabase) {
      supabase
        .from('lifeplan_kv')
        .select('data')
        .eq('key', TELEMETRY_KEY)
        .maybeSingle()
        .then(
          ({ data }) => {
            if (data?.data) setCloudTelemetry(data.data as Record<string, { visits: number; dwellSec: number; lastVisitedAt: string }>);
          },
          () => {}
        );

      supabase
        .from('lifeplan_kv')
        .select('data')
        .eq('key', CALENDAR_KV_KEY)
        .maybeSingle()
        .then(
          ({ data }) => {
            if (Array.isArray(data?.data) && data.data.length > 0) {
              setCustomTasks(data.data as HubCalendarTask[]);
              try { localStorage.setItem('agy_hub_cal_custom_v1', JSON.stringify(data.data)); } catch {}
            }
          },
          () => {}
        );
    }

    // Fetch iPhone Notes, Books, Gmail Purchases
    fetch('/api/iphone/sync-notes')
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok) {
          if (Array.isArray(d.tasks) && d.tasks.length > 0) setTasks(d.tasks);
          if (Array.isArray(d.ideas) && d.ideas.length > 0) setIdeas(d.ideas);
        }
      })
      .catch(() => {});

    fetch('/api/iphone/book-capture')
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && Array.isArray(d.books)) setCapturedBooks(d.books);
      })
      .catch(() => {});

    fetch('/api/gmail/ingest')
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && Array.isArray(d.purchases)) setEmailPurchases(d.purchases);
      })
      .catch(() => {});
  }, []);

  const persistCustomCalTasks = (next: HubCalendarTask[]) => {
    setCustomTasks(next);
    try { localStorage.setItem('agy_hub_cal_custom_v1', JSON.stringify(next)); } catch {}
    if (supabase) {
      supabase
        .from('lifeplan_kv')
        .upsert({ key: CALENDAR_KV_KEY, data: next, updated_at: new Date().toISOString() })
        .then();
    }
  };

  const persistNotesToCloud = (nextTasks: FixTaskItem[], nextIdeas: NewAppIdeaItem[]) => {
    setTasks(nextTasks);
    setIdeas(nextIdeas);
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

  const moveFixPriority = (idx: number, delta: -1 | 1) => {
    const target = idx + delta;
    if (target < 0 || target >= tasks.length) return;
    const next = [...tasks];
    const [moved] = next.splice(idx, 1);
    next.splice(target, 0, moved);
    persistNotesToCloud(next, ideas);
  };

  const handleAiSuggestHub = async () => {
    setSuggestBusy(true);
    try {
      const res = await fetch('/api/ai/suggest-hub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          existingFixTitles: tasks.map((t) => t.title),
          existingIdeaTitles: ideas.map((i) => i.title),
          dismissedTitles,
        }),
      });
      const d = await res.json();
      if (d?.ok) {
        const nextTasks = [...(d.suggestedFixes || []), ...tasks];
        const nextIdeas = [...(d.suggestedIdeas || []), ...ideas];
        persistNotesToCloud(nextTasks, nextIdeas);
        notify(`✨ プロファイルから 修正案 +${d.suggestedFixes?.length || 0}件 / 新規案 +${d.suggestedIdeas?.length || 0}件 を提案追加しました`);
      }
    } finally {
      setSuggestBusy(false);
    }
  };

  const toggleCalTaskDone = (task: HubCalendarTask) => {
    const nextVal = !task.done;
    const nextMap = { ...doneOverrides, [task.id]: nextVal };
    setDoneOverrides(nextMap);
    try { localStorage.setItem('agy_hub_cal_done_v1', JSON.stringify(nextMap)); } catch {}
    if (customTasks.some((c) => c.id === task.id)) {
      persistCustomCalTasks(customTasks.map((c) => (c.id === task.id ? { ...c, done: nextVal } : c)));
    }
  };

  const deleteCalTask = (taskId: string) => {
    const nextDel = [...deletedCalIds, taskId];
    setDeletedCalIds(nextDel);
    try { localStorage.setItem('agy_hub_cal_del_v1', JSON.stringify(nextDel)); } catch {}
    if (customTasks.some((c) => c.id === taskId)) {
      persistCustomCalTasks(customTasks.filter((c) => c.id !== taskId));
    }
    setEditingCalTask(null);
    notify('🗑️ タスクを削除しました');
  };

  // Real CSV Ingestion from Hub -> target app!
  const handleDirectCsvIngest = async (target: 'shopping' | 'meals' | 'thought' | 'mf', file: File) => {
    const content = await file.text();
    if (target === 'shopping') {
      try {
        const res = await fetch('http://127.0.0.1:8788/api/import-csv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csv_text: content }),
        });
        if (res.ok) {
          notify(`🍎 ${file.name} を Lifelog: Pantry (8788) へ直接取り込みました！`);
          return;
        }
      } catch {}
      notify(`🍎 ${file.name} をクラウドへ保存しました（MacのLifelog起動時に反映）`);
    } else if (target === 'meals') {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/meals', { method: 'POST', body: formData });
        if (res.ok) {
          notify(`🍽️ ${file.name} を Life: Health (食事データ) へ反映しました！`);
          return;
        }
      } catch {}
      notify(`🍽️ ${file.name} の食事CSVを受信しました`);
    } else if (target === 'thought') {
      const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const startIdx = /date|日時|title|タイトル|memo/i.test(lines[0] || '') ? 1 : 0;
      const existingRaw = localStorage.getItem('agy_podcast_ops_v1');
      const curEps = existingRaw ? JSON.parse(existingRaw) : [];
      const maxNo = curEps.reduce((m: number, e: { epNo: number }) => Math.max(m, e.epNo || 0), 0);
      const added = lines.slice(startIdx).map((line, idx) => {
        const cols = line.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
        return {
          id: `ep_hub_${Date.now()}_${idx}`,
          epNo: maxNo + idx + 1,
          title: (cols[1] || cols[0]).slice(0, 70),
          sourceMemo: cols.slice(2).join(' / ') || cols[0],
          status: 'IDEA',
          spanishScript: '',
          publishDate: '',
          ytViews: 0,
          ytWatchMin: 0,
          spotifyPlays: 0,
          spotifyListeners: 0,
          updatedAt: new Date().toISOString(),
        };
      });
      const nextEps = [...added, ...curEps];
      try { localStorage.setItem('agy_podcast_ops_v1', JSON.stringify(nextEps)); } catch {}
      if (supabase) {
        supabase.from('lifeplan_kv').upsert({ key: 'agy_podcast_ops_v1', data: nextEps, updated_at: new Date().toISOString() }).then();
      }
      notify(`🎙️ 思考メモCSV (${added.length}件) を Podcast 運用テーブルへ直接反映しました！`);
    } else if (target === 'mf') {
      if (supabase) {
        await supabase.from('lifeplan_kv').upsert({
          key: `hub_ingest_mf_${calYm}`,
          data: { filename: file.name, rows: content.split(/\r?\n/).filter(Boolean).length, updatedAt: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        });
      }
      notify(`🧾 MoneyForward CSV (${file.name}) を取り込みました！`);
    }
  };

  // Calendar grid for selected month (calYm)
  const { calYear, calMonth, leadingBlanks, daysInMonth, monthTasks } = useMemo(() => {
    const [y, m] = calYm.split('-').map(Number);
    const firstSun0 = new Date(y, m - 1, 1).getDay();
    const blanks = (firstSun0 + 6) % 7;
    const total = new Date(y, m, 0).getDate();

    const recurring = generateRecurringTasksForMonth(y, m);
    const mergedMap = new Map<string, HubCalendarTask>();
    recurring.forEach((t) => mergedMap.set(t.id, t));
    customTasks.filter((t) => t.date.startsWith(calYm)).forEach((t) => mergedMap.set(t.id, t));

    const all = Array.from(mergedMap.values())
      .filter((t) => !deletedCalIds.includes(t.id))
      .map((t) => (doneOverrides[t.id] !== undefined ? { ...t, done: doneOverrides[t.id] } : t))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { calYear: y, calMonth: m, leadingBlanks: blanks, daysInMonth: total, monthTasks: all };
  }, [calYm, customTasks, doneOverrides, deletedCalIds]);

  const pendingTasks = useMemo(() => monthTasks.filter((t) => !t.done), [monthTasks]);
  const overdueTasks = useMemo(() => pendingTasks.filter((t) => t.date < TODAY_ISO), [pendingTasks]);

  const shiftCalMonth = (delta: number) => {
    const [y, m] = calYm.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setCalYm(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const recordAppClick = (appId: string) => {
    const nowStr = new Date().toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    setAppAccessLogs((prev) => {
      const cur = prev[appId] || { count: 0, lastAt: '' };
      const next = { ...prev, [appId]: { count: cur.count + 1, lastAt: nowStr } };
      try { localStorage.setItem('hd_app_access_logs_v1', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const enrichedApps = useMemo(() => {
    return apps
      .filter((a) => !deletedIds.includes(a.id))
      .map((a) => {
        const ll = a.lifelogView ? lifelogStats[a.lifelogView] : undefined;
        const cloud = cloudTelemetry[a.id];
        const local = appAccessLogs[a.id];
        const liveVisits = (ll?.visits || 0) + (cloud?.visits || 0) + (local?.count || 0);
        const liveUpdates = ll?.updates || 0;
        let wasteStatus: WasteStatus = 'active';
        if (a.muted || a.score < 55 || a.visitScore <= 15) wasteStatus = 'wasted';
        else if (a.visitScore < 75 && liveVisits === 0) wasteStatus = 'underused';
        const dynamicScore = Math.min(100, a.score + Math.min(8, liveVisits * 2 + liveUpdates * 2));
        return { ...a, telemetry: { liveVisits, liveUpdates, wasteStatus, dynamicScore } };
      });
  }, [apps, deletedIds, lifelogStats, cloudTelemetry, appAccessLogs]);

  const auditCounts = useMemo(() => {
    let active = 0; let underused = 0; let wasted = 0;
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
      .sort((a, b) => (a.muted ? 1 : 0) - (b.muted ? 1 : 0) || b.telemetry.dynamicScore - a.telemetry.dynamicScore);
  }, [enrichedApps, searchQuery, suiteFilter]);

  const savedMB = apps.filter((a) => deletedIds.includes(a.id) || a.muted).reduce((s, a) => s + a.mb, 0);

  return (
    <div className="max-w-7xl mx-auto space-y-4 text-xs" style={{ color: 'var(--text)' }}>
      {toastMsg && (
        <div className="fixed bottom-4 right-4 z-50 px-3.5 py-2 rounded-lg border-2 font-bold shadow-xl" style={{ background: 'var(--bg-card)', borderColor: 'var(--zelda-gold)', color: 'var(--text)' }}>
          {toastMsg}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.tsv,.txt"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          const t = activeCsvTargetRef.current;
          if (f && t) {
            await handleDirectCsvIngest(t, f);
            e.target.value = '';
          }
        }}
      />

      {/* ========================================================= */}
      {/* ROW 1: ワンクリックCSV取込ハブ ＋ 未完了タスク一覧 ＋ iPhone/Gmail連携 */}
      {/* ========================================================= */}
      <div className="p-3.5 rounded-lg border space-y-2.5 shadow-sm" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-black mr-1">📥 Hub直接CSV取込:</span>
            <button type="button" onClick={() => { activeCsvTargetRef.current = 'shopping'; fileInputRef.current?.click(); }} className="px-2.5 py-1 rounded border font-black text-[11px] hover:opacity-80" style={{ background: 'var(--bg-card2)', borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)' }}>
              🍎 買い物CSV → Lifelog
            </button>
            <button type="button" onClick={() => { activeCsvTargetRef.current = 'meals'; fileInputRef.current?.click(); }} className="px-2.5 py-1 rounded border font-black text-[11px] hover:opacity-80" style={{ background: 'var(--bg-card2)', borderColor: 'var(--zelda-zonai)', color: 'var(--zelda-zonai)' }}>
              🍽️ 食事CSV → Health
            </button>
            <button type="button" onClick={() => { fetch('/api/health?days=30').then(() => notify('⚖️ TANITA体重データを同期しました！')).catch(() => {}); }} className="px-2.5 py-1 rounded border font-black text-[11px] hover:opacity-80" style={{ background: 'var(--bg-card2)', borderColor: 'var(--zelda-zonai)', color: 'var(--zelda-zonai)' }}>
              ⚖️ TANITA同期
            </button>
            <button type="button" onClick={() => { activeCsvTargetRef.current = 'thought'; fileInputRef.current?.click(); }} className="px-2.5 py-1 rounded border font-black text-[11px] hover:opacity-80" style={{ background: 'var(--bg-card2)', borderColor: 'var(--zelda-cyan)', color: 'var(--zelda-cyan)' }}>
              🎙️ 思考CSV → Podcast
            </button>
            <button type="button" onClick={() => { activeCsvTargetRef.current = 'mf'; fileInputRef.current?.click(); }} className="px-2.5 py-1 rounded border font-black text-[11px] hover:opacity-80" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)', color: 'var(--text)' }}>
              🧾 MF家計簿CSV
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => setShowGmailModal(true)} className="px-2.5 py-1 rounded border font-black text-[11px]" style={{ background: 'rgba(217,168,78,0.14)', borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)' }}>
              📧 Gmail取込 (決算/EC購入{emailPurchases.length > 0 ? ` ${emailPurchases.length}` : ''})
            </button>
            <button type="button" onClick={() => setShowIphoneModal(true)} className="px-2.5 py-1 rounded border font-black text-[11px]" style={{ background: 'rgba(106,174,192,0.16)', borderColor: 'var(--zelda-cyan)', color: 'var(--zelda-cyan)' }}>
              📱 iPhone連携 {capturedBooks.length > 0 ? `(📚${capturedBooks.length})` : ''}
            </button>
            {metrics.length > 0 && metrics[metrics.length - 1].weight != null && (
              <span className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>⚖️{metrics[metrics.length - 1].weight?.toFixed(1)}kg</span>
            )}
            {nutrition.length > 0 && (
              <span className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>🍽️{Math.round(nutrition[nutrition.length - 1].totalCalories)}kcal</span>
            )}
          </div>
        </div>

        {/* やっていないタスク一覧（未完了リスト） */}
        <div className="pt-2 border-t flex flex-wrap items-center gap-1.5" style={{ borderColor: 'var(--border)' }}>
          <span className="text-xs font-black" style={{ color: overdueTasks.length > 0 ? 'var(--f1-soft)' : 'var(--zelda-gold)' }}>
            🚨 未完了タスク ({pendingTasks.length}件):
          </span>
          {pendingTasks.length === 0 ? (
            <span className="text-[11px] font-bold" style={{ color: 'var(--zelda-zonai)' }}>✓ この月のタスクはすべて完了！</span>
          ) : (
            pendingTasks.map((t) => {
              const isOverdue = t.date < TODAY_ISO;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleCalTaskDone(t)}
                  title="クリックで完了にする"
                  className="px-2 py-0.5 rounded border text-[11px] font-extrabold transition hover:opacity-80"
                  style={{
                    background: isOverdue ? 'rgba(239,68,68,0.2)' : 'rgba(217,168,78,0.14)',
                    borderColor: isOverdue ? 'var(--f1-soft)' : 'var(--zelda-gold)',
                    color: isOverdue ? '#fca5a5' : 'var(--text)',
                  }}
                >
                  {isOverdue ? '🚨' : '⏳'} {t.date.slice(5)} {t.icon} {t.label}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* ROW 2: 大きな月移動カレンダー（定期タスク自動配置＋随時追加・編集対応） */}
      {/* ========================================================= */}
      <div className="p-4 rounded-lg border space-y-3 shadow-sm" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => shiftCalMonth(-1)} className="px-2.5 py-1 rounded border text-xs font-black" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}>◀ 前月</button>
            <h2 className="text-base font-black tabular-nums">📅 {calYear}年{calMonth}月 定期インプット＆決算カレンダー</h2>
            <button type="button" onClick={() => shiftCalMonth(1)} className="px-2.5 py-1 rounded border text-xs font-black" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}>次月 ▶</button>
            <button type="button" onClick={() => setCalYm('2026-11')} className="px-2 py-1 rounded border text-[11px] font-bold" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>11月</button>
            <button type="button" onClick={() => setCalYm('2026-12')} className="px-2 py-1 rounded border text-[11px] font-bold" style={{ borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)' }}>12月(予定)</button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const [y, m] = calYm.split('-').map(Number);
                const fresh = generateRecurringTasksForMonth(y, m).filter((t) => t.category === 'econ');
                const merged = [...customTasks.filter((c) => !fresh.some((f) => f.id === c.id)), ...fresh];
                persistCustomCalTasks(merged);
                notify(`🔄 ${calYear}年${calMonth}月の経済指標(第1金曜雇用統計・CPI・10年債)を最新反映しました`);
              }}
              className="px-2.5 py-1 rounded border font-black text-xs"
              style={{ borderColor: 'var(--zelda-cyan)', color: 'var(--zelda-cyan)', background: 'var(--bg-card2)' }}
            >
              🔄 経済指標の発表日を同期
            </button>
            <button
              type="button"
              onClick={() => {
                setNewCalDate(`${calYm}-15`);
                setShowAddTaskModal(true);
              }}
              className="px-3 py-1 rounded font-black text-xs"
              style={{ background: 'var(--accent)', color: '#1e1a16' }}
            >
              ＋ タスク追加
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2 text-center text-xs font-extrabold" style={{ color: 'var(--text-muted)' }}>
          <span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span><span>日</span>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: leadingBlanks }).map((_, idx) => (
            <div key={`b-${idx}`} className="rounded-lg border min-h-[86px] opacity-15" style={{ borderStyle: 'dashed', borderColor: 'var(--border)' }} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, idx) => {
            const d = idx + 1;
            const iso = `${calYm}-${String(d).padStart(2, '0')}`;
            const dayItems = monthTasks.filter((t) => t.date === iso);
            const isToday = iso === TODAY_ISO;
            const hasOverdue = dayItems.some((t) => !t.done && iso < TODAY_ISO);
            const allDone = dayItems.length > 0 && dayItems.every((t) => t.done);

            return (
              <div
                key={iso}
                className={`p-2 rounded-lg border-2 min-h-[86px] flex flex-col justify-between transition ${allDone && !isToday ? 'gray-done' : ''}`}
                style={{
                  background: hasOverdue ? 'rgba(239,68,68,0.14)' : 'var(--bg-card2)',
                  borderColor: isToday ? 'var(--zelda-gold)' : hasOverdue ? 'var(--f1-soft)' : 'var(--border)',
                }}
              >
                <div className="flex justify-between items-center text-[11px] font-black" style={{ color: isToday ? 'var(--zelda-gold)' : hasOverdue ? 'var(--f1-soft)' : 'var(--text-muted)' }}>
                  <span>{calMonth}/{d}{isToday ? ' (今日)' : ''}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setNewCalDate(iso);
                      setShowAddTaskModal(true);
                    }}
                    title="この日にタスクを追加"
                    className="opacity-40 hover:opacity-100 text-[11px]"
                  >
                    ＋
                  </button>
                </div>

                <div className="space-y-1 mt-1">
                  {dayItems.map((it) => (
                    <div key={it.id} className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => toggleCalTaskDone(it)}
                        title={`${it.label} (${it.targetApp}) — クリックで完了切替`}
                        className={`flex-1 text-left text-[10.5px] font-extrabold px-1.5 py-0.5 rounded truncate ${it.done ? 'line-through opacity-55' : ''}`}
                        style={{
                          background: it.done ? 'rgba(0,0,0,0.2)' : iso < TODAY_ISO ? 'rgba(239,68,68,0.28)' : 'rgba(217,168,78,0.2)',
                          borderLeft: `3px solid ${it.done ? 'var(--border)' : iso < TODAY_ISO ? 'var(--f1-soft)' : 'var(--zelda-gold)'}`,
                        }}
                      >
                        {it.done ? '✓ ' : ''}{it.icon} {it.label}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingCalTask(it)}
                        title="タスクを編集・削除"
                        className="text-[10px] px-0.5 opacity-60 hover:opacity-100"
                      >
                        ✎
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========================================================= */}
      {/* ROW 3: カレンダーの下：全25ページ 統合ランキング ＆ 無駄診断 */}
      {/* ========================================================= */}
      <div className="p-3.5 rounded-lg border space-y-2.5 shadow-sm" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-black">🕹️ 全{enrichedApps.length}ページ 統合ランキング ＆ 無駄診断</h2>
            <div className="flex items-center gap-1.5 text-[10.5px] font-extrabold">
              <span className="px-2 py-0.5 rounded border" style={{ background: 'rgba(111,176,135,0.16)', borderColor: 'var(--zelda-zonai)', color: 'var(--zelda-zonai)' }}>🟢稼働 {auditCounts.active}</span>
              <span className="px-2 py-0.5 rounded border" style={{ background: 'rgba(217,168,78,0.16)', borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)' }}>🟡低頻度 {auditCounts.underused}</span>
              <span className="px-2 py-0.5 rounded border" style={{ background: 'rgba(239,68,68,0.18)', borderColor: 'var(--f1-soft)', color: 'var(--f1-soft)' }}>🔴無駄 {auditCounts.wasted} ({(savedMB / 1024).toFixed(1)}GB)</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {deletedIds.length > 0 && (
              <button type="button" onClick={() => { setDeletedIds([]); localStorage.setItem('agy_home_del_v5', '[]'); }} className="px-2 py-1 rounded text-[11px] font-bold border" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}>↩ Restore</button>
            )}
            <input type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="🔍 ページ検索..." className="px-2.5 py-1 rounded border text-xs w-40" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'all', label: `All (${enrichedApps.length})` },
            { id: 'money', label: '💰 Money (6)' },
            { id: 'life', label: '🏃 Life (3)' },
            { id: 'lifelog', label: '🍎 Lifelog (5)' },
            { id: 'other', label: '🎾 Other (11)' },
            { id: 'waste', label: `🚨 無駄/低頻度 (${auditCounts.underused + auditCounts.wasted})` },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setSuiteFilter(f.id as typeof suiteFilter)}
              className="px-2.5 py-1 rounded text-xs font-extrabold border"
              style={{
                background: suiteFilter === f.id ? 'var(--accent)' : 'var(--bg-card2)',
                borderColor: suiteFilter === f.id ? 'var(--zelda-gold)' : 'var(--border)',
                color: suiteFilter === f.id ? '#1e1a16' : 'var(--text)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-left text-xs border-collapse">
            <thead style={{ background: '#212823', color: '#e4dac6' }}>
              <tr>
                <th className="py-2 px-3">順位 &amp; ページ名</th>
                <th className="py-2 px-2">Score / 頻度</th>
                <th className="py-2 px-2">稼働・無駄診断</th>
                <th className="py-2 px-2">容量</th>
                <th className="py-2 px-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {visibleApps.map((a, idx) => {
                const effectiveUrl = customUrls[a.id] ?? a.url;
                const isEditing = editingUrlId === a.id;
                const t = a.telemetry;
                const badge =
                  t.wasteStatus === 'active'
                    ? { label: '🟢 稼働', bg: 'rgba(111,176,135,0.16)', border: 'var(--zelda-zonai)', color: 'var(--zelda-zonai)' }
                    : t.wasteStatus === 'underused'
                    ? { label: '🟡 低頻度', bg: 'rgba(217,168,78,0.18)', border: 'var(--zelda-gold)', color: 'var(--zelda-gold)' }
                    : { label: '🔴 無駄', bg: 'rgba(239,68,68,0.20)', border: 'var(--f1-soft)', color: 'var(--f1-soft)' };

                return (
                  <tr key={a.id} className={a.muted ? 'gray-done' : 'hover:bg-[var(--bg-card2)]'} style={{ background: 'var(--bg-card)' }}>
                    <td className="py-1.5 px-3 font-black whitespace-nowrap">
                      {isEditing ? (
                        <input autoFocus defaultValue={effectiveUrl} onBlur={(e) => { saveLinkUrl(a.id, e.target.value.trim()); setCustomUrls(loadLinkUrls()); setEditingUrlId(null); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} className="px-2 py-0.5 rounded border text-xs w-52" style={{ background: 'var(--bg-card2)', borderColor: 'var(--zelda-gold)' }} />
                      ) : a.internalTab ? (
                        <button type="button" onClick={() => { recordAppClick(a.id); onNavigate(a.internalTab!); }} className="hover:underline flex items-center gap-1.5">
                          <span className="text-[10px] w-5" style={{ color: 'var(--text-muted)' }}>#{idx + 1}</span>
                          <span>{a.icon}</span><span>{a.name}</span>
                        </button>
                      ) : effectiveUrl ? (
                        <a href={effectiveUrl} target="_blank" rel="noopener noreferrer" onClick={() => recordAppClick(a.id)} className="hover:underline flex items-center gap-1.5">
                          <span className="text-[10px] w-5" style={{ color: 'var(--text-muted)' }}>#{idx + 1}</span>
                          <span>{a.icon}</span><span>{a.name}</span><span style={{ color: 'var(--zelda-gold)' }}>↗</span>
                        </a>
                      ) : (
                        <button type="button" onClick={() => { navigator.clipboard?.writeText(a.localPath).catch(() => {}); notify(`📋 Copied: ${a.localPath}`); }} className="hover:underline flex items-center gap-1.5">
                          <span className="text-[10px] w-5" style={{ color: 'var(--text-muted)' }}>#{idx + 1}</span>
                          <span>{a.icon}</span><span>{a.name}</span><span>📋</span>
                        </button>
                      )}
                    </td>
                    <td className="py-1.5 px-2 whitespace-nowrap">
                      <span className="font-black tabular-nums mr-2" style={{ color: 'var(--zelda-gold)' }}>{t.dynamicScore}</span>
                      <span className="text-[11px]" style={{ color: 'var(--text-sub)' }}>{a.visit}</span>
                      {t.liveVisits > 0 && <span className="ml-1.5 text-[10px] font-bold" style={{ color: 'var(--zelda-cyan)' }}>(実測{t.liveVisits})</span>}
                    </td>
                    <td className="py-1.5 px-2 whitespace-nowrap">
                      <span className="px-1.5 py-0.5 rounded border text-[10px] font-black mr-1.5" style={{ background: badge.bg, borderColor: badge.border, color: badge.color }}>{badge.label}</span>
                      <span className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{a.wasteNote}</span>
                    </td>
                    <td className="py-1.5 px-2 whitespace-nowrap tabular-nums" style={{ color: 'var(--text-muted)' }}>{a.sizeLabel}</td>
                    <td className="py-1.5 px-3 whitespace-nowrap text-right">
                      <div className="inline-flex items-center gap-1">
                        {a.internalTab ? (
                          <button type="button" onClick={() => { recordAppClick(a.id); onNavigate(a.internalTab!); }} className="px-2 py-0.5 rounded border font-bold text-[10.5px]" style={{ borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)' }}>Open</button>
                        ) : effectiveUrl ? (
                          <a href={effectiveUrl} target="_blank" rel="noopener noreferrer" onClick={() => recordAppClick(a.id)} className="px-2 py-0.5 rounded border font-bold text-[10.5px]" style={{ borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)' }}>Open↗</a>
                        ) : (
                          <button type="button" onClick={() => { navigator.clipboard?.writeText(a.localPath).catch(() => {}); notify(`📋 Copied: ${a.localPath}`); }} className="px-2 py-0.5 rounded border text-[10.5px]" style={{ borderColor: 'var(--border)' }}>Path</button>
                        )}
                        <button type="button" onClick={() => setEditingUrlId(a.id)} className="px-1.5 py-0.5 rounded border text-[10.5px]" style={{ borderColor: 'var(--border)' }}>✎</button>
                        <button type="button" onClick={() => { const next = apps.map((x) => (x.id === a.id ? { ...x, muted: !x.muted } : x)); setApps(next); localStorage.setItem('agy_home_muted_v5', JSON.stringify(next.filter((x) => x.muted).map((x) => x.id))); }} className="px-1.5 py-0.5 rounded border text-[10.5px]" style={{ borderColor: 'var(--border)' }}>{a.muted ? '↩' : '👁️'}</button>
                        <button type="button" onClick={() => { const nextDel = [...deletedIds, a.id]; setDeletedIds(nextDel); localStorage.setItem('agy_home_del_v5', JSON.stringify(nextDel)); }} className="px-1.5 py-0.5 rounded border text-[10.5px]" style={{ borderColor: 'var(--f1-soft)', color: 'var(--f1-soft)' }}>🔥</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================= */}
      {/* ROW 4: 既存アプリの修正（優先順位▲▼＆AI提案＆削除）＆ 未作成の新規アプリ案 */}
      {/* ========================================================= */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-black" style={{ color: 'var(--text-muted)' }}>
            🛠️ 修正案（優先順位 ▲▼ で並べ替え可能）＆ 💡 新規アプリ案（カーソルでAntigravityプロンプト表示）
          </span>
          <button
            type="button"
            disabled={suggestBusy}
            onClick={handleAiSuggestHub}
            className="px-3.5 py-1.5 rounded-lg border-2 font-black text-xs shadow hover:opacity-90"
            style={{ background: 'rgba(217,168,78,0.18)', borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)' }}
          >
            {suggestBusy ? '提案を生成中...' : '✨ プロファイルから修正案＆新規案を提案・更新'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 左：既存アプリの修正（優先度順） */}
          <div className="p-4 rounded-lg border space-y-3 shadow-sm" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <h3 className="text-sm font-black">🛠️ 既存アプリの修正（優先順位つき・Antigravity指示キュー）</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!taskIn.trim()) return;
                const targetApp = apps.find((a) => a.id === fixAppId) || apps[0];
                const next: FixTaskItem[] = [
                  { id: `fix_${Date.now()}`, appId: targetApp.id, appName: targetApp.name, localPath: targetApp.localPath, title: taskIn.trim(), detail: taskDetailIn.trim() || `${targetApp.name} の改善・修正`, subIdeas: [] },
                  ...tasks,
                ];
                persistNotesToCloud(next, ideas);
                setTaskIn('');
                setTaskDetailIn('');
              }}
              className="flex flex-wrap gap-1.5"
            >
              <select value={fixAppId} onChange={(e) => setFixAppId(e.target.value)} className="px-2 py-1 rounded border text-xs font-bold" style={{ background: 'var(--bg-card2)', borderColor: 'var(--zelda-gold)', color: 'var(--text)' }}>
                {apps.map((a) => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
              </select>
              <input type="text" value={taskIn} onChange={(e) => setTaskIn(e.target.value)} placeholder="＋修正タイトル" className="w-32 px-2 py-1 rounded border text-xs" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }} />
              <input type="text" value={taskDetailIn} onChange={(e) => setTaskDetailIn(e.target.value)} placeholder="詳細(任意)" className="flex-1 min-w-[100px] px-2 py-1 rounded border text-xs" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }} />
              <button type="submit" className="px-3 py-1 rounded font-black border text-xs" style={{ borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)' }}>追加</button>
            </form>

            <div className="space-y-1.5">
              {tasks.map((t, idx) => {
                const isPinned = pinnedFixId === t.id;
                const promptStr = buildFixPrompt(t);
                return (
                  <div key={t.id} className="relative group">
                    <div
                      className="px-2.5 py-1.5 rounded-md border flex items-center justify-between gap-2 text-xs transition"
                      style={{ background: isPinned ? 'rgba(217,168,78,0.2)' : 'var(--bg-card2)', borderColor: isPinned ? 'var(--zelda-gold)' : 'var(--border)' }}
                    >
                      <button type="button" onClick={() => setPinnedFixId(isPinned ? null : t.id)} className="text-left flex items-center gap-1.5 flex-1 min-w-0 font-bold">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-black" style={{ background: 'rgba(217,168,78,0.2)', color: 'var(--zelda-gold)' }}>P{idx + 1}</span>
                        <span className="truncate">🛠️ {t.appName}: {t.title}</span>
                        {t.subIdeas.length > 0 && <span className="text-[10px] px-1 rounded" style={{ color: 'var(--zelda-cyan)' }}>+{t.subIdeas.length}</span>}
                      </button>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button type="button" disabled={idx === 0} onClick={() => moveFixPriority(idx, -1)} title="優先度を上げる" className="px-1.5 py-0.5 rounded border text-[10px] disabled:opacity-25" style={{ borderColor: 'var(--border)' }}>▲</button>
                        <button type="button" disabled={idx === tasks.length - 1} onClick={() => moveFixPriority(idx, 1)} title="優先度を下げる" className="px-1.5 py-0.5 rounded border text-[10px] disabled:opacity-25" style={{ borderColor: 'var(--border)' }}>▼</button>
                        <button
                          type="button"
                          onClick={() => {
                            const nextDis = [...dismissedTitles, t.title];
                            setDismissedTitles(nextDis);
                            try { localStorage.setItem('agy_home_dismissed_v1', JSON.stringify(nextDis)); } catch {}
                            persistNotesToCloud(tasks.filter((x) => x.id !== t.id), ideas);
                          }}
                          title="不要な修正案を削除"
                          className="px-1.5 py-0.5 rounded border text-[10px]"
                          style={{ borderColor: 'var(--f1-soft)', color: 'var(--f1-soft)' }}
                        >
                          🗑
                        </button>
                      </div>
                    </div>

                    <div className={`${isPinned ? 'block' : 'hidden group-hover:block'} absolute bottom-full left-0 pb-2 z-50 w-80 sm:w-96`}>
                      <div className="p-3 rounded-lg border-2 shadow-2xl space-y-2" style={{ background: 'var(--bg-card)', borderColor: 'var(--zelda-gold)', color: 'var(--text)' }}>
                        <div className="flex justify-between">
                          <div className="text-xs font-black" style={{ color: 'var(--zelda-gold)' }}>P{idx + 1} {t.appName} — {t.title}</div>
                          {isPinned && <button type="button" onClick={() => setPinnedFixId(null)} className="text-[10px] px-1.5 rounded border" style={{ borderColor: 'var(--border)' }}>閉じる</button>}
                        </div>
                        <div className="text-[11px]" style={{ color: 'var(--text-sub)' }}>{t.detail}</div>
                        {t.subIdeas.length > 0 && (
                          <div className="space-y-0.5 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                            {t.subIdeas.map((si, sIdx) => (
                              <div key={sIdx} className="text-[11px] flex justify-between">
                                <span>• {si}</span>
                                <button type="button" onClick={() => persistNotesToCloud(tasks.map((x) => x.id === t.id ? { ...x, subIdeas: x.subIdeas.filter((_, j) => j !== sIdx) } : x), ideas)} className="opacity-50">✕</button>
                              </div>
                            ))}
                          </div>
                        )}
                        <form onSubmit={(e) => { e.preventDefault(); const v = (subIdeaDrafts[t.id] || '').trim(); if (!v) return; persistNotesToCloud(tasks.map((x) => x.id === t.id ? { ...x, subIdeas: [...x.subIdeas, v] } : x), ideas); setSubIdeaDrafts((p) => ({ ...p, [t.id]: '' })); }} className="flex gap-1">
                          <input type="text" value={subIdeaDrafts[t.id] || ''} onChange={(e) => setSubIdeaDrafts((p) => ({ ...p, [t.id]: e.target.value }))} placeholder="＋追加アイデアを追記..." className="flex-1 px-2 py-1 rounded border text-[11px]" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }} />
                          <button type="submit" className="px-2 py-1 rounded border text-[10px] font-black" style={{ borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)' }}>追記</button>
                        </form>
                        <div className="p-2 rounded border space-y-1" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}>
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black" style={{ color: 'var(--zelda-cyan)' }}>🤖 Antigravity 指示プロンプト</span>
                            <button type="button" onClick={() => { navigator.clipboard?.writeText(promptStr).catch(() => {}); notify('📋 プロンプトをコピーしました'); }} className="px-2 py-0.5 rounded font-black text-[10px]" style={{ background: 'var(--accent)', color: '#1e1a16' }}>📋 コピー</button>
                          </div>
                          <pre className="text-[10px] whitespace-pre-wrap leading-snug" style={{ color: 'var(--text-muted)' }}>{promptStr}</pre>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 右：未作成の新規アプリ案 */}
          <div className="p-4 rounded-lg border space-y-3 shadow-sm" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <h3 className="text-sm font-black">💡 未作成の新規アプリ案（不要な案は🗑削除・アイデア追記可）</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!ideaIn.trim()) return;
                const next: NewAppIdeaItem[] = [
                  { id: `idea_${Date.now()}`, title: `🚀 ${ideaIn.trim()}`, target: '新規構想', detail: ideaDetailIn.trim() || 'アプリ概要メモ未設定', subIdeas: [] },
                  ...ideas,
                ];
                persistNotesToCloud(tasks, next);
                setIdeaIn('');
                setIdeaDetailIn('');
              }}
              className="flex flex-wrap gap-1.5"
            >
              <input type="text" value={ideaIn} onChange={(e) => setIdeaIn(e.target.value)} placeholder="＋新規アプリ名" className="w-32 px-2 py-1 rounded border text-xs" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }} />
              <input type="text" value={ideaDetailIn} onChange={(e) => setIdeaDetailIn(e.target.value)} placeholder="概要メモ(任意)" className="flex-1 min-w-[100px] px-2 py-1 rounded border text-xs" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }} />
              <button type="submit" className="px-3 py-1 rounded font-black border text-xs" style={{ borderColor: 'var(--zelda-cyan)', color: 'var(--zelda-cyan)' }}>追加</button>
            </form>

            <div className="flex flex-wrap items-center gap-2 font-bold">
              {ideas.map((idea) => {
                const isPinned = pinnedIdeaId === idea.id;
                const promptStr = buildIdeaPrompt(idea);
                return (
                  <div key={idea.id} className="relative group">
                    <div className="px-2.5 py-1.5 rounded-md border flex items-center gap-1.5 text-xs" style={{ background: isPinned ? 'rgba(106,174,192,0.2)' : 'var(--bg-card2)', borderColor: 'var(--zelda-cyan)' }}>
                      <button type="button" onClick={() => setPinnedIdeaId(isPinned ? null : idea.id)} className="text-left flex items-center gap-1">
                        <span>{idea.title}</span>
                        {idea.subIdeas.length > 0 && <span className="text-[10px]" style={{ color: 'var(--zelda-gold)' }}>+{idea.subIdeas.length}</span>}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const nextDis = [...dismissedTitles, idea.title];
                          setDismissedTitles(nextDis);
                          try { localStorage.setItem('agy_home_dismissed_v1', JSON.stringify(nextDis)); } catch {}
                          persistNotesToCloud(tasks, ideas.filter((x) => x.id !== idea.id));
                        }}
                        title="不要な案を削除（再提案からも除外）"
                        className="px-1 rounded text-[10px]"
                        style={{ color: 'var(--f1-soft)' }}
                      >
                        🗑
                      </button>
                    </div>

                    <div className={`${isPinned ? 'block' : 'hidden group-hover:block'} absolute bottom-full left-0 pb-2 z-50 w-80 sm:w-96`}>
                      <div className="p-3 rounded-lg border-2 shadow-2xl space-y-2" style={{ background: 'var(--bg-card)', borderColor: 'var(--zelda-cyan)', color: 'var(--text)' }}>
                        <div className="flex justify-between">
                          <div className="text-xs font-black" style={{ color: 'var(--zelda-cyan)' }}>{idea.title}</div>
                          {isPinned && <button type="button" onClick={() => setPinnedIdeaId(null)} className="text-[10px] px-1.5 rounded border" style={{ borderColor: 'var(--border)' }}>閉じる</button>}
                        </div>
                        <div className="text-[11px] font-normal" style={{ color: 'var(--text-sub)' }}>{idea.detail}</div>
                        {idea.subIdeas.length > 0 && (
                          <div className="space-y-0.5 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                            {idea.subIdeas.map((si, sIdx) => (
                              <div key={sIdx} className="text-[11px] font-normal flex justify-between">
                                <span>• {si}</span>
                                <button type="button" onClick={() => persistNotesToCloud(tasks, ideas.map((x) => x.id === idea.id ? { ...x, subIdeas: x.subIdeas.filter((_, j) => j !== sIdx) } : x))} className="opacity-50">✕</button>
                              </div>
                            ))}
                          </div>
                        )}
                        <form onSubmit={(e) => { e.preventDefault(); const v = (subIdeaDrafts[idea.id] || '').trim(); if (!v) return; persistNotesToCloud(tasks, ideas.map((x) => x.id === idea.id ? { ...x, subIdeas: [...x.subIdeas, v] } : x)); setSubIdeaDrafts((p) => ({ ...p, [idea.id]: '' })); }} className="flex gap-1">
                          <input type="text" value={subIdeaDrafts[idea.id] || ''} onChange={(e) => setSubIdeaDrafts((p) => ({ ...p, [idea.id]: e.target.value }))} placeholder="＋このアプリ案に追記..." className="flex-1 px-2 py-1 rounded border text-[11px] font-normal" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }} />
                          <button type="submit" className="px-2 py-1 rounded border text-[10px] font-black" style={{ borderColor: 'var(--zelda-cyan)', color: 'var(--zelda-cyan)' }}>追記</button>
                        </form>
                        <div className="p-2 rounded border space-y-1" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}>
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black" style={{ color: 'var(--zelda-gold)' }}>🤖 Antigravity 作成プロンプト</span>
                            <button type="button" onClick={() => { navigator.clipboard?.writeText(promptStr).catch(() => {}); notify('📋 作成プロンプトをコピーしました'); }} className="px-2 py-0.5 rounded font-black text-[10px]" style={{ background: 'var(--accent)', color: '#1e1a16' }}>📋 コピー</button>
                          </div>
                          <pre className="text-[10px] font-normal whitespace-pre-wrap leading-snug" style={{ color: 'var(--text-muted)' }}>{promptStr}</pre>
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

      {/* ========================================================= */}
      {/* MODALS: タスク追加 / タスク編集 / Gmail取込 / iPhone連携 */}
      {/* ========================================================= */}
      {showAddTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newCalLabel.trim()) return;
              const created: HubCalendarTask = {
                id: `custom_${Date.now()}`,
                date: newCalDate,
                icon: newCalIcon || '📌',
                label: newCalLabel.trim(),
                targetApp: newCalTarget,
                kvKey: `custom_${Date.now()}`,
                category: 'custom',
                done: false,
              };
              persistCustomCalTasks([...customTasks, created]);
              setNewCalLabel('');
              setShowAddTaskModal(false);
              notify(`✓ ${newCalDate} にタスクを追加しました`);
            }}
            className="w-full max-w-md rounded-xl border-2 p-4 space-y-3 shadow-2xl"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--zelda-gold)' }}
          >
            <div className="flex justify-between items-center">
              <span className="text-sm font-black">＋ カレンダーにタスクを追加</span>
              <button type="button" onClick={() => setShowAddTaskModal(false)}>✕</button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>日付</label>
                <input type="date" value={newCalDate} onChange={(e) => setNewCalDate(e.target.value)} className="mt-1 w-full px-2 py-1.5 rounded border text-xs" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }} required />
              </div>
              <div>
                <label className="block text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>アイコン</label>
                <input type="text" value={newCalIcon} onChange={(e) => setNewCalIcon(e.target.value)} className="mt-1 w-full px-2 py-1.5 rounded border text-xs" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }} />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>タスク名</label>
              <input type="text" value={newCalLabel} onChange={(e) => setNewCalLabel(e.target.value)} placeholder="例: 決算確認・CSV取込" className="mt-1 w-full px-2 py-1.5 rounded border text-xs" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }} required />
            </div>
            <div>
              <label className="block text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>対象アプリ</label>
              <select value={newCalTarget} onChange={(e) => setNewCalTarget(e.target.value)} className="mt-1 w-full px-2 py-1.5 rounded border text-xs" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}>
                {apps.map((a) => <option key={a.id} value={a.name}>{a.icon} {a.name}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button type="submit" className="px-4 py-1.5 rounded font-black text-xs" style={{ background: 'var(--accent)', color: '#1e1a16' }}>追加する</button>
            </div>
          </form>
        </div>
      )}

      {editingCalTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const next = customTasks.some((c) => c.id === editingCalTask.id)
                ? customTasks.map((c) => (c.id === editingCalTask.id ? editingCalTask : c))
                : [...customTasks, editingCalTask];
              persistCustomCalTasks(next);
              setEditingCalTask(null);
              notify('✓ タスクを更新しました');
            }}
            className="w-full max-w-md rounded-xl border-2 p-4 space-y-3 shadow-2xl"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--zelda-cyan)' }}
          >
            <div className="flex justify-between items-center">
              <span className="text-sm font-black">✎ タスクを編集</span>
              <button type="button" onClick={() => setEditingCalTask(null)}>✕</button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>日付</label>
                <input type="date" value={editingCalTask.date} onChange={(e) => setEditingCalTask({ ...editingCalTask, date: e.target.value })} className="mt-1 w-full px-2 py-1.5 rounded border text-xs" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }} required />
              </div>
              <div>
                <label className="block text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>アイコン</label>
                <input type="text" value={editingCalTask.icon} onChange={(e) => setEditingCalTask({ ...editingCalTask, icon: e.target.value })} className="mt-1 w-full px-2 py-1.5 rounded border text-xs" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }} />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>タスク名</label>
              <input type="text" value={editingCalTask.label} onChange={(e) => setEditingCalTask({ ...editingCalTask, label: e.target.value })} className="mt-1 w-full px-2 py-1.5 rounded border text-xs" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }} required />
            </div>
            <div className="flex justify-between pt-1">
              <button type="button" onClick={() => deleteCalTask(editingCalTask.id)} className="px-3 py-1.5 rounded border font-black text-xs" style={{ borderColor: 'var(--f1-soft)', color: 'var(--f1-soft)' }}>🗑 削除</button>
              <button type="submit" className="px-4 py-1.5 rounded font-black text-xs" style={{ background: 'var(--accent)', color: '#1e1a16' }}>保存する</button>
            </div>
          </form>
        </div>
      )}

      {showGmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border-2 p-4 space-y-3 shadow-2xl" style={{ background: 'var(--bg-card)', borderColor: 'var(--zelda-gold)' }}>
            <div className="flex justify-between items-center border-b pb-2" style={{ borderColor: 'var(--border)' }}>
              <span className="text-sm font-black">📧 Gmail 自動連携（楽天証券決算メール ＆ Amazon/メルカリ/JAL購入メール）</span>
              <button type="button" onClick={() => setShowGmailModal(false)} className="px-2 py-0.5 rounded border">✕ 閉じる</button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!gmailRawText.trim()) return;
                setSyncBusy(true);
                try {
                  const res = await fetch('/api/gmail/ingest', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode: gmailMode, body: gmailRawText }),
                  });
                  const d = await res.json();
                  if (d?.ok) {
                    if (d.type === 'ir' && Array.isArray(d.items)) {
                      persistCustomCalTasks([...customTasks, ...d.items]);
                      notify(`🏢 楽天証券メールから ${d.items.length}件の決算発表日をカレンダーに追加しました！`);
                    } else if (d.type === 'purchase' && d.item) {
                      setEmailPurchases((prev) => [d.item, ...prev]);
                      notify(`🛒 ${d.item.store}: ${d.item.itemName} (¥${d.item.netAmount}) を抽出しました！`);
                    }
                    setGmailRawText('');
                  } else {
                    notify(`⚠️ ${d.error || '抽出失敗'}`);
                  }
                } finally {
                  setSyncBusy(false);
                }
              }}
              className="space-y-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold">メール本文を貼り付けて即取り込み:</span>
                <select value={gmailMode} onChange={(e) => setGmailMode(e.target.value as 'auto' | 'ir' | 'purchase')} className="px-2 py-0.5 rounded border text-xs" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}>
                  <option value="auto">自動判定 (決算 / 購入)</option>
                  <option value="ir">楽天証券 決算発表日</option>
                  <option value="purchase">Amazon / メルカリ / JAL購入</option>
                </select>
              </div>
              <textarea rows={4} value={gmailRawText} onChange={(e) => setGmailRawText(e.target.value)} placeholder="楽天証券の「武田薬品(4502):2026/10/29」や、JAL/Amazonの注文確認メールを貼り付け..." className="w-full p-2 rounded border text-xs" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }} />
              <div className="flex justify-end">
                <button type="submit" disabled={syncBusy} className="px-4 py-1.5 rounded font-black text-xs" style={{ background: 'var(--accent)', color: '#1e1a16' }}>⚡ 解析してカレンダー／買い物キューへ反映</button>
              </div>
            </form>

            {emailPurchases.length > 0 && (
              <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black" style={{ color: 'var(--zelda-cyan)' }}>
                    🛒 承認待ちキュー ({emailPurchases.length}件) — 確認してから蓄積先を選択
                  </span>
                </div>
                {emailPurchases.map((p) => {
                  const dismissQueueItem = async (id: string) => {
                    try {
                      await fetch(`/api/gmail/ingest?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
                    } catch {}
                    setEmailPurchases((prev) => prev.filter((x) => x.id !== id));
                  };
                  return (
                    <div
                      key={p.id}
                      className="p-2.5 rounded border space-y-1.5 text-[11px]"
                      style={{
                        background: 'var(--bg-card2)',
                        borderColor: p.isBook ? 'var(--zelda-cyan)' : 'var(--border)',
                      }}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <span className="font-mono text-[10px] mr-1.5" style={{ color: 'var(--text-muted)' }}>{p.date}</span>
                          <strong className="mr-1.5">{p.store}</strong>
                          {p.isBook && (
                            <span className="px-1.5 py-0.5 rounded text-[9.5px] font-black mr-1.5" style={{ background: 'rgba(106,174,192,0.2)', color: 'var(--zelda-cyan)' }}>
                              📚 本候補
                            </span>
                          )}
                          <span className="font-bold">{p.itemName}</span>
                        </div>
                        <span className="font-black whitespace-nowrap" style={{ color: 'var(--zelda-gold)' }}>
                          ¥{(p.netAmount ?? p.amount).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const safeName = p.itemName.replace(/,/g, ' ');
                              const safeStore = p.store.replace(/,/g, ' ');
                              const csv = `購入日,店名,商品名,金額\n${p.date},${safeStore},${safeName},${p.netAmount ?? p.amount}`;
                              const res = await fetch('http://127.0.0.1:8788/api/import-csv', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ csv_text: csv }),
                              });
                              if (!res.ok) throw new Error('Lifelog server error');
                              await dismissQueueItem(p.id);
                              notify(`🍎 「${p.itemName.slice(0, 20)}」を買い物詳細へ承認・蓄積しました！`);
                            } catch {
                              notify('⚠️ Lifelogローカル(8788)が起動中か確認してください');
                            }
                          }}
                          className="px-2.5 py-1 rounded border font-black text-[10.5px]"
                          style={{ borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)', background: 'rgba(217,168,78,0.12)' }}
                        >
                          🍎 買い物詳細へ承認
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const res = await fetch('http://127.0.0.1:8788/api/books/quick-add', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  title: p.itemName,
                                  author: p.store,
                                  price: p.netAmount ?? p.amount,
                                  reading_status: 'FINISHED',
                                  acquired_date: p.date,
                                }),
                              });
                              if (!res.ok) throw new Error('Lifelog server error');
                              await dismissQueueItem(p.id);
                              notify(`📖 「${p.itemName.slice(0, 20)}」を読んだ本として読書図鑑へ登録しました！`);
                            } catch {
                              notify('⚠️ Lifelogローカル(8788)が起動中か確認してください');
                            }
                          }}
                          className="px-2.5 py-1 rounded border font-black text-[10.5px]"
                          style={{
                            borderColor: 'var(--zelda-cyan)',
                            color: p.isBook ? '#1e1a16' : 'var(--zelda-cyan)',
                            background: p.isBook ? 'var(--zelda-cyan)' : 'rgba(106,174,192,0.14)',
                          }}
                        >
                          📖 読んだ本として読書図鑑へ登録
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await dismissQueueItem(p.id);
                            notify('🗑 キューから却下しました');
                          }}
                          className="px-2 py-1 rounded border text-[10.5px]"
                          style={{ borderColor: 'var(--f1-soft)', color: 'var(--f1-soft)' }}
                        >
                          🗑 却下
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="p-3 rounded-lg border space-y-1.5" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}>
              <div className="flex justify-between items-center">
                <span className="text-xs font-black" style={{ color: 'var(--zelda-gold)' }}>🤖 完全自動化：Google Apps Script (GAS) 毎日1回トリガー用コード</span>
                <button type="button" onClick={() => { navigator.clipboard?.writeText(GAS_SCRIPT_SNIPPET).catch(() => {}); notify('📋 GASコードをコピーしました'); }} className="px-2.5 py-0.5 rounded font-black text-[10px]" style={{ background: 'var(--accent)', color: '#1e1a16' }}>📋 コピー</button>
              </div>
              <pre className="text-[10px] overflow-x-auto leading-snug" style={{ color: 'var(--text-muted)' }}>{GAS_SCRIPT_SNIPPET}</pre>
            </div>
          </div>
        </div>
      )}

      {showIphoneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border-2 p-4 space-y-3 shadow-2xl" style={{ background: 'var(--bg-card)', borderColor: 'var(--zelda-cyan)' }}>
            <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black">📱 iPhone 15 Pro 連携ハブ</span>
                <button type="button" onClick={() => setIphoneTab('books')} className="px-2 py-0.5 rounded text-xs font-black border" style={{ background: iphoneTab === 'books' ? 'var(--accent)' : 'var(--bg-card2)', color: iphoneTab === 'books' ? '#1e1a16' : 'var(--text)' }}>📚 Amazon本 ({capturedBooks.length})</button>
                <button type="button" onClick={() => setIphoneTab('notes')} className="px-2 py-0.5 rounded text-xs font-black border" style={{ background: iphoneTab === 'notes' ? 'var(--accent)' : 'var(--bg-card2)', color: iphoneTab === 'notes' ? '#1e1a16' : 'var(--text)' }}>📝 メモ同期</button>
              </div>
              <button type="button" onClick={() => setShowIphoneModal(false)} className="px-2 py-0.5 rounded border">✕ 閉じる</button>
            </div>

            {iphoneTab === 'books' ? (
              <div className="space-y-3">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!amazonUrlInput.trim()) return;
                    setSyncBusy(true);
                    try {
                      const res = await fetch('/api/iphone/book-capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: amazonUrlInput.trim() }) });
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
                  <input type="url" value={amazonUrlInput} onChange={(e) => setAmazonUrlInput(e.target.value)} placeholder="Amazon URL" className="flex-1 px-2 py-1 rounded border text-xs" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }} />
                  <button type="submit" disabled={syncBusy} className="px-3 py-1 rounded font-black text-xs" style={{ background: 'var(--accent)', color: '#1e1a16' }}>＋追加</button>
                </form>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {capturedBooks.map((b) => (
                    <div key={b.id} className="p-2 rounded border flex gap-2 items-start" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}>
                      {b.image_url && <img src={b.image_url} alt={b.title} className="w-10 h-14 object-contain rounded" />}
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-xs line-clamp-2">{b.title}</div>
                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{b.author}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!offlineMemoText.trim()) return;
                  const res = await fetch('/api/iphone/sync-notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: offlineMemoText }) });
                  const d = await res.json();
                  if (d?.ok) {
                    if (Array.isArray(d.tasks)) setTasks(d.tasks);
                    if (Array.isArray(d.ideas)) setIdeas(d.ideas);
                    setOfflineMemoText('');
                    notify(`✓ 同期完了: 修正 +${d.addedFixesCount} / 新規 +${d.addedIdeasCount}`);
                  }
                }}
                className="space-y-2"
              >
                <textarea rows={4} value={offlineMemoText} onChange={(e) => setOfflineMemoText(e.target.value)} placeholder="オフラインメモを貼り付け..." className="w-full p-2 rounded border text-xs" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }} />
                <div className="flex justify-end">
                  <button type="submit" className="px-4 py-1.5 rounded font-black text-xs" style={{ background: 'var(--accent)', color: '#1e1a16' }}>⚡ 同期する</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
