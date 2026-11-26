import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const NOTES_SYNC_KEY = 'agy_home_notes_v1';

export interface SyncedFixTask {
  id: string;
  appId: string;
  appName: string;
  localPath: string;
  title: string;
  detail: string;
  subIdeas: string[];
  source?: 'web' | 'iphone';
}

export interface SyncedNewAppIdea {
  id: string;
  title: string;
  target: string;
  detail: string;
  subIdeas: string[];
  source?: 'web' | 'iphone';
}

interface NotesBundle {
  tasks: SyncedFixTask[];
  ideas: SyncedNewAppIdea[];
}

const APP_MATCHERS: { keywords: string[]; appId: string; appName: string; localPath: string }[] = [
  { keywords: ['経済指標', 'macro', 'econ', 'cpi', 'nfp'], appId: 'money-economics', appName: 'Money: Macro', localPath: '~/money-dashboard/app/economics' },
  { keywords: ['資産運用', 'nisa', 'assets', '投信'], appId: 'money-assets', appName: 'Money: Assets', localPath: '~/money-dashboard/app/assets' },
  { keywords: ['家計簿', 'budget', 'amex', 'moneyforward'], appId: 'money-budget', appName: 'Money: Budget', localPath: '~/money-dashboard/app/budget' },
  { keywords: ['企業分析', 'stocks', 'companies', 'ir', '決算'], appId: 'money-companies', appName: 'Money: Stocks', localPath: '~/money-dashboard/app/companies' },
  { keywords: ['ライフプラン', 'lifeplan', 'plan'], appId: 'money-lifeplan', appName: 'Money: Plan', localPath: '~/money-dashboard/app/lifeplan' },
  { keywords: ['money', 'マネー'], appId: 'money-home', appName: 'Money: Home', localPath: '~/money-dashboard/app' },
  { keywords: ['健康', 'health', '体重', '食事', 'カロリー'], appId: 'life-health', appName: 'Life: Health', localPath: '~/health-dashboard/app/page.tsx' },
  { keywords: ['life', 'ホーム', 'hub', 'カレンダー', 'ランキング'], appId: 'life-home', appName: 'Life: Hub', localPath: '~/health-dashboard/components/tabs/HomeTab.tsx' },
  { keywords: ['読書', '本', 'books', 'book'], appId: 'kaimono-books', appName: 'Lifelog: Books', localPath: '~/.gemini/antigravity/scratch/kaimono-lifelog' },
  { keywords: ['持ち物', 'ポーチ', 'gear'], appId: 'kaimono-assets', appName: 'Lifelog: Gear', localPath: '~/.gemini/antigravity/scratch/kaimono-lifelog' },
  { keywords: ['思考マップ', 'mindset'], appId: 'kaimono-mindset', appName: 'Lifelog: Mindset', localPath: '~/.gemini/antigravity/scratch/kaimono-lifelog' },
  { keywords: ['自己分析', 'profile'], appId: 'kaimono-self', appName: 'Lifelog: Profile', localPath: '~/.gemini/antigravity/scratch/kaimono-lifelog' },
  { keywords: ['買い物', '食料', '日用品', 'pantry', 'lifelog'], appId: 'kaimono', appName: 'Lifelog: Pantry', localPath: '~/.gemini/antigravity/scratch/kaimono-lifelog' },
  { keywords: ['tennis video', 'テニス動画', '動画メーカー'], appId: 'tvid', appName: 'Tennis Video', localPath: '~/tennis-score/tools' },
  { keywords: ['tennis', 'テニス', 'スコア'], appId: 'tennis', appName: 'Tennis Score', localPath: '~/tennis-score' },
  { keywords: ['spanish', 'スペイン語'], appId: 'spanish', appName: 'Spanish Lab', localPath: '~/spanish-learning-app' },
  { keywords: ['rio', 'ランキング'], appId: 'rio', appName: 'RIO Rank', localPath: '~/rio-rankings' },
  { keywords: ['rally', 'ラリー'], appId: 'rally', appName: 'Rally Cutter', localPath: '~/.gemini/antigravity/scratch/tennis-rally-cutter' },
  { keywords: ['youtube', 'yt'], appId: 'yt', appName: 'YT Summary', localPath: '~/.gemini/antigravity/scratch/youtube_summarizer' },
  { keywords: ['video editor', 'davinci'], appId: 'vauto', appName: 'Video Editor', localPath: '~/video-auto-editor' },
];

function parseNoteLines(rawText: string) {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^[-*・•□☐✅🛠️💡🚀]+\s*/, ''))
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  const parsedFixes: SyncedFixTask[] = [];
  const parsedIdeas: SyncedNewAppIdea[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    const isExplicitIdea = /^(新規|new|アイデア|案|app)\s*[:：]/i.test(line);
    const isExplicitFix = /^(修正|fix|改善|バグ|bug)\s*[:：]/i.test(line);

    const cleaned = line
      .replace(/^(新規|new|アイデア|案|app|修正|fix|改善|バグ|bug)\s*[:：]\s*/i, '')
      .trim();
    if (!cleaned) continue;

    // Split title | detail if user used pipe or " - " or "："
    let title = cleaned;
    let detail = '';
    const pipeMatch = cleaned.split(/\s*[|｜]\s*/);
    if (pipeMatch.length >= 2) {
      title = pipeMatch[0].trim();
      detail = pipeMatch.slice(1).join(' / ').trim();
    } else {
      const colonIdx = cleaned.search(/[:：]/);
      if (colonIdx > 0 && colonIdx < 24) {
        title = cleaned.slice(0, colonIdx).trim();
        detail = cleaned.slice(colonIdx + 1).trim();
      }
    }

    const matchedApp = APP_MATCHERS.find((m) =>
      m.keywords.some((kw) => lower.includes(kw))
    );

    if (isExplicitIdea || (!isExplicitFix && !matchedApp)) {
      parsedIdeas.push({
        id: `iphone_idea_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: title.startsWith('🚀') ? title : `🚀 ${title}`,
        target: matchedApp ? `${matchedApp.appName}連携` : 'iPhoneメモ同期',
        detail: detail || `${title}（iPhoneオフラインメモより同期）`,
        subIdeas: [],
        source: 'iphone',
      });
    } else {
      const app = matchedApp || {
        appId: 'life-home',
        appName: 'Life: Hub',
        localPath: '~/health-dashboard/components/tabs/HomeTab.tsx',
      };
      parsedFixes.push({
        id: `iphone_fix_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        appId: app.appId,
        appName: app.appName,
        localPath: app.localPath,
        title,
        detail: detail || `${app.appName} に対する修正メモ（iPhoneより同期）`,
        subIdeas: [],
        source: 'iphone',
      });
    }
  }

  return { parsedFixes, parsedIdeas };
}

export async function GET() {
  if (!supabase) return NextResponse.json({ ok: false, tasks: [], ideas: [] });
  const { data } = await supabase
    .from('lifeplan_kv')
    .select('data')
    .eq('key', NOTES_SYNC_KEY)
    .maybeSingle();
  const bundle = (data?.data as NotesBundle) || { tasks: [], ideas: [] };
  return NextResponse.json({ ok: true, tasks: bundle.tasks || [], ideas: bundle.ideas || [] });
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let rawText = '';
    let fullBundle: NotesBundle | null = null;

    if (contentType.includes('application/json')) {
      const body = await req.json();
      if (Array.isArray(body.tasks) && Array.isArray(body.ideas)) {
        fullBundle = { tasks: body.tasks, ideas: body.ideas };
      } else if (body.appName && body.text) {
        const appChoice = String(body.appName).trim();
        const noteText = String(body.text).trim();
        if (/新規|new/i.test(appChoice)) {
          rawText = `新規: ${noteText}`;
        } else {
          rawText = `修正: ${appChoice} | ${noteText}`;
        }
      } else {
        rawText = Array.isArray(body.notes) ? body.notes.join('\n') : String(body.text || body.memo || '');
      }
    } else {
      rawText = await req.text();
    }

    if (!supabase) {
      return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
    }

    if (fullBundle) {
      await supabase.from('lifeplan_kv').upsert({
        key: NOTES_SYNC_KEY,
        data: fullBundle,
        updated_at: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true, tasks: fullBundle.tasks, ideas: fullBundle.ideas });
    }

    const { parsedFixes, parsedIdeas } = parseNoteLines(rawText);

    const { data } = await supabase
      .from('lifeplan_kv')
      .select('data')
      .eq('key', NOTES_SYNC_KEY)
      .maybeSingle();

    const current: NotesBundle = (data?.data as NotesBundle) || { tasks: [], ideas: [] };
    const existingFixKeys = new Set(current.tasks.map((t) => `${t.appId}:${t.title}`.toLowerCase()));
    const existingIdeaKeys = new Set(
      current.ideas.map((i) => i.title.replace(/^🚀\s*/, '').toLowerCase())
    );

    const addedFixes = parsedFixes.filter(
      (f) => !existingFixKeys.has(`${f.appId}:${f.title}`.toLowerCase())
    );
    const addedIdeas = parsedIdeas.filter(
      (i) => !existingIdeaKeys.has(i.title.replace(/^🚀\s*/, '').toLowerCase())
    );

    const nextBundle: NotesBundle = {
      tasks: [...addedFixes, ...current.tasks],
      ideas: [...addedIdeas, ...current.ideas],
    };

    await supabase.from('lifeplan_kv').upsert({
      key: NOTES_SYNC_KEY,
      data: nextBundle,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      addedFixesCount: addedFixes.length,
      addedIdeasCount: addedIdeas.length,
      tasks: nextBundle.tasks,
      ideas: nextBundle.ideas,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
