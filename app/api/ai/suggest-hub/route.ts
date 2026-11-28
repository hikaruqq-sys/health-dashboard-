import { NextRequest, NextResponse } from 'next/server';

const CANDIDATE_FIXES = [
  {
    appId: 'money-companies',
    appName: 'Money: Stocks',
    localPath: '~/money-dashboard/app/companies',
    title: '楽天証券メールから決算日を自動同期＆決算後メモ欄を追加',
    detail: 'Gmailの銘柄情報通知メールをGAS経由で取り込み、決算発表予定日の前日にハイライト表示する。',
  },
  {
    appId: 'kaimono',
    appName: 'Lifelog: Pantry',
    localPath: '~/.gemini/antigravity/scratch/kaimono-lifelog',
    title: 'Amazon・メルカリ・JAL購入メールの自動取り込みタブ',
    detail: 'Gmailから取得したネット購入明細をワンクリックで食料・日用品・持ち物ポーチへ振り分け反映する。',
  },
  {
    appId: 'life-health',
    appName: 'Life: Health',
    localPath: '~/health-dashboard/app/page.tsx',
    title: '第1日曜日のTANITA体重＆食事CSV一括チェック',
    detail: '月1回の体重推移とPFCバランスから、テニスの試合前日に最適なカーボローディング提案を出す。',
  },
  {
    appId: 'money-economics',
    appName: 'Money: Macro',
    localPath: '~/money-dashboard/app/economics',
    title: '米雇用統計(第1金曜)・CPI発表日の自動年間カレンダー生成',
    detail: '2026〜2027年の主要経済指標発表日を自動計算し、発表翌日に未入力アラートを出す。',
  },
  {
    appId: 'tennis',
    appName: 'Tennis Score',
    localPath: '~/tennis-score',
    title: '死ボタン19件の整理＆サーブ1st確率の月別トレンド化',
    detail: '使っていないUIボタンを整理して軽量化し、試合ごとの1stサーブ確率と勝率の相関グラフを表示する。',
  },
  {
    appId: 'spanish',
    appName: 'Spanish Lab',
    localPath: '~/spanish-learning-app',
    title: 'Podcastスペイン語台本から重要フレーズを自動フラッシュカード化',
    detail: 'Podcast運用ページで生成したスペイン語台本から未習得表現を抽出し、日次復習リストへ送る。',
  },
];

const CANDIDATE_IDEAS = [
  {
    title: '🎙️ Podcast Analytics & Script Studio',
    target: 'Podcast / Spanish Lab連携',
    detail: 'iPhone思考CSV→Geminiスペイン語台本→YouTube/Spotify再生数・視聴維持率を一元管理する制作ハブ。',
  },
  {
    title: '🎬 Media Time Tracker (Netflix / Prime)',
    target: 'Lifelog: Books連携',
    detail: '読書量とNetflix/Prime視聴時間を並べて「インプット時間バランス（読む vs 観る）」を月次可視化する。',
  },
  {
    title: '📧 Gmail Auto-Router (証券IR・EC購入)',
    target: 'Money & Lifelog共通',
    detail: '楽天証券・Amazon・メルカリ・JALの定型メールをGASで自動解析し、カレンダーと家計・買い物ログへ自動振り分け。',
  },
  {
    title: '🎾 Tennis Match Prep Briefing',
    target: 'Tennis Score / Video連携',
    detail: '次の対戦相手や過去の試合動画メモから、試合前に確認すべき戦術3ポイントをiPhoneに通知するアプリ。',
  },
  {
    title: '📊 Monthly Life Review Generator',
    target: '全アプリ横断',
    detail: '月末に資産増減・体重・読書冊数・動画視聴時間・スペイン語学習量を1枚の月次レポートPDF/Markdownに自動集計。',
  },
  {
    title: '🔔 Subscription & Renewal Guard',
    target: 'Money: Budget連携',
    detail: 'Netflix/Prime/Amex年会費/サーバー費などの更新日をカレンダーに自動登録し、使っていないサブスクを警告。',
  },
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const existingFixTitles = new Set<string>(
      Array.isArray(body.existingFixTitles) ? body.existingFixTitles.map((s: string) => s.toLowerCase()) : []
    );
    const existingIdeaTitles = new Set<string>(
      Array.isArray(body.existingIdeaTitles)
        ? body.existingIdeaTitles.map((s: string) => s.replace(/^🚀\s*/, '').toLowerCase())
        : []
    );
    const dismissedTitles = new Set<string>(
      Array.isArray(body.dismissedTitles) ? body.dismissedTitles.map((s: string) => s.toLowerCase()) : []
    );

    const freshFixes = CANDIDATE_FIXES.filter(
      (f) => !existingFixTitles.has(f.title.toLowerCase()) && !dismissedTitles.has(f.title.toLowerCase())
    ).slice(0, 2);

    const freshIdeas = CANDIDATE_IDEAS.filter(
      (i) =>
        !existingIdeaTitles.has(i.title.replace(/^🚀\s*/, '').toLowerCase()) &&
        !dismissedTitles.has(i.title.toLowerCase())
    ).slice(0, 2);

    return NextResponse.json({
      ok: true,
      suggestedFixes: freshFixes.map((f, idx) => ({
        id: `ai_fix_${Date.now()}_${idx}`,
        ...f,
        subIdeas: [],
      })),
      suggestedIdeas: freshIdeas.map((i, idx) => ({
        id: `ai_idea_${Date.now()}_${idx}`,
        ...i,
        subIdeas: [],
      })),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
