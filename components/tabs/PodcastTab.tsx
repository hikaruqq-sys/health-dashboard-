'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

type EpStatus = 'IDEA' | 'SCRIPTING' | 'RECORDED' | 'EDITED' | 'PUBLISHED';

interface PodcastEpisode {
  id: string;
  epNo: number;
  title: string;
  sourceMemo: string;
  status: EpStatus;
  spanishScript: string;
  publishDate: string;
  ytViews: number;
  ytWatchMin: number;
  spotifyPlays: number;
  spotifyListeners: number;
  updatedAt: string;
}

const PODCAST_KV_KEY = 'agy_podcast_ops_v1';

const STATUS_META: Record<EpStatus, { label: string; color: string; bg: string }> = {
  IDEA: { label: '💡 ネタ(CSV)', color: 'var(--text-sub)', bg: 'var(--bg-card2)' },
  SCRIPTING: { label: '✍️ 台本作成中', color: 'var(--zelda-cyan)', bg: 'rgba(106,174,192,0.16)' },
  RECORDED: { label: '🎙️ 収録済', color: 'var(--zelda-gold)', bg: 'rgba(217,168,78,0.18)' },
  EDITED: { label: '🎬 編集済', color: '#a78bfa', bg: 'rgba(167,139,250,0.18)' },
  PUBLISHED: { label: '🚀 公開済', color: 'var(--zelda-zonai)', bg: 'rgba(111,176,135,0.2)' },
};

const INITIAL_EPISODES: PodcastEpisode[] = [
  {
    id: 'ep_1',
    epNo: 1,
    title: 'テニスと仕事のリズムづくり (Ritmo de tenis y trabajo)',
    sourceMemo: '平日の朝活と週末テニスの両立。週1の思考ログをスペイン語で話すことでアウトプット力も上がる。',
    status: 'PUBLISHED',
    spanishScript: '¡Hola a todos! Hoy quiero hablar sobre cómo combino el tenis y mi trabajo diario...',
    publishDate: '2026-11-15',
    ytViews: 142,
    ytWatchMin: 480,
    spotifyPlays: 96,
    spotifyListeners: 64,
    updatedAt: '2026-11-20T10:00:00Z',
  },
  {
    id: 'ep_2',
    epNo: 2,
    title: '40代からの資産形成とマクロ指標 (Inversión y economía)',
    sourceMemo: '米雇用統計や日米10年債利回りを見ながら長期投資を続けるコツ。感情に流されない仕組みづくり。',
    status: 'SCRIPTING',
    spanishScript: '',
    publishDate: '2026-11-30',
    ytViews: 0,
    ytWatchMin: 0,
    spotifyPlays: 0,
    spotifyListeners: 0,
    updatedAt: '2026-11-25T09:00:00Z',
  },
];

function buildGeminiSpanishPrompt(ep: PodcastEpisode): string {
  return `あなたはネイティブのスペイン語Podcast構成作家です。以下の日本語メモをもとに、5分程度の自然なスペイン語Podcast台本を作成してください。

【エピソードタイトル】${ep.title}
【元の思考メモ】
${ep.sourceMemo}

【出力フォーマット】
1. オープニング挨拶（親しみやすく短く）
2. 本編スペイン語台本（中級者でも話しやすく自然な表現・日本語対訳付き）
3. 今回覚えるべき重要スペイン語フレーズ3選
4. クロージング（次回予告・フォロー呼びかけ）`;
}

export default function PodcastTab() {
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>(INITIAL_EPISODES);
  const [statusFilter, setStatusFilter] = useState<'ALL' | EpStatus>('ALL');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newMemo, setNewMemo] = useState('');
  const [analyticsPaste, setAnalyticsPaste] = useState('');
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 3200);
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PODCAST_KV_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) setEpisodes(parsed);
      }
    } catch {}

    if (supabase) {
      supabase
        .from('lifeplan_kv')
        .select('data')
        .eq('key', PODCAST_KV_KEY)
        .maybeSingle()
        .then(
          ({ data }) => {
            if (Array.isArray(data?.data) && data.data.length > 0) {
              setEpisodes(data.data as PodcastEpisode[]);
              try {
                localStorage.setItem(PODCAST_KV_KEY, JSON.stringify(data.data));
              } catch {}
            }
          },
          () => {}
        );
    }
  }, []);

  const persist = (next: PodcastEpisode[]) => {
    setEpisodes(next);
    try {
      localStorage.setItem(PODCAST_KV_KEY, JSON.stringify(next));
    } catch {}
    if (supabase) {
      supabase
        .from('lifeplan_kv')
        .upsert({
          key: PODCAST_KV_KEY,
          data: next,
          updated_at: new Date().toISOString(),
        })
        .then();
    }
  };

  const handleCsvImport = async (file: File) => {
    const text = await file.text();
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length === 0) return;

    const startIdx = /date|日時|title|タイトル|memo|メモ/i.test(lines[0]) ? 1 : 0;
    const maxNo = episodes.reduce((m, e) => Math.max(m, e.epNo), 0);
    const added: PodcastEpisode[] = [];

    lines.slice(startIdx).forEach((line, idx) => {
      const cols = line.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
      const title = cols.length >= 2 ? cols[1] || cols[0] : cols[0];
      const memo = cols.length >= 3 ? cols.slice(2).join(' / ') : cols[0];
      if (!title) return;
      added.push({
        id: `ep_csv_${Date.now()}_${idx}`,
        epNo: maxNo + idx + 1,
        title: title.slice(0, 70),
        sourceMemo: memo,
        status: 'IDEA',
        spanishScript: '',
        publishDate: '',
        ytViews: 0,
        ytWatchMin: 0,
        spotifyPlays: 0,
        spotifyListeners: 0,
        updatedAt: new Date().toISOString(),
      });
    });

    if (added.length > 0) {
      persist([...added, ...episodes]);
      notify(`📥 思考メモCSVから ${added.length}件のPodcastネタを取り込みました`);
    }
  };

  const handleAnalyticsPaste = () => {
    // Parse lines like: "Ep1, 142, 480, 96, 64" or tab-separated from YouTube Studio / Spotify Creators
    const lines = analyticsPaste.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let updatedCount = 0;
    const next = [...episodes];

    lines.forEach((line) => {
      const cols = line.split(/[\t,]/).map((c) => c.trim());
      if (cols.length < 2) return;
      const key = cols[0].toLowerCase();
      const targetIdx = next.findIndex(
        (e) =>
          e.title.toLowerCase().includes(key) ||
          `ep${e.epNo}` === key ||
          `#${e.epNo}` === key ||
          String(e.epNo) === key
      );
      if (targetIdx >= 0) {
        const nums = cols.slice(1).map((v) => Number(v.replace(/[^\d.]/g, '')) || 0);
        next[targetIdx] = {
          ...next[targetIdx],
          ytViews: nums[0] ?? next[targetIdx].ytViews,
          ytWatchMin: nums[1] ?? next[targetIdx].ytWatchMin,
          spotifyPlays: nums[2] ?? next[targetIdx].spotifyPlays,
          spotifyListeners: nums[3] ?? next[targetIdx].spotifyListeners,
          updatedAt: new Date().toISOString(),
        };
        updatedCount++;
      }
    });

    if (updatedCount > 0) {
      persist(next);
      setAnalyticsPaste('');
      setShowAnalyticsModal(false);
      notify(`📊 ${updatedCount}エピソードのYouTube/Spotify視聴記録を更新しました`);
    } else {
      notify('⚠️ 一致するエピソードが見つかりませんでした（例: Ep1, 150, 500, 100, 70）');
    }
  };

  const totals = useMemo(() => {
    return episodes.reduce(
      (acc, e) => ({
        ytViews: acc.ytViews + (e.ytViews || 0),
        ytWatchMin: acc.ytWatchMin + (e.ytWatchMin || 0),
        spotifyPlays: acc.spotifyPlays + (e.spotifyPlays || 0),
        spotifyListeners: acc.spotifyListeners + (e.spotifyListeners || 0),
        published: acc.published + (e.status === 'PUBLISHED' ? 1 : 0),
      }),
      { ytViews: 0, ytWatchMin: 0, spotifyPlays: 0, spotifyListeners: 0, published: 0 }
    );
  }, [episodes]);

  const visible = useMemo(() => {
    return episodes
      .filter((e) => (statusFilter === 'ALL' ? true : e.status === statusFilter))
      .sort((a, b) => b.epNo - a.epNo);
  }, [episodes, statusFilter]);

  const editingEp = episodes.find((e) => e.id === editingId) || null;

  return (
    <div className="max-w-7xl mx-auto space-y-4 text-xs" style={{ color: 'var(--text)' }}>
      {toast && (
        <div
          className="fixed bottom-4 right-4 z-50 px-3.5 py-2 rounded-lg border-2 font-bold shadow-xl"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--zelda-gold)', color: 'var(--text)' }}
        >
          {toast}
        </div>
      )}

      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,.tsv,.txt"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) {
            await handleCsvImport(f);
            e.target.value = '';
          }
        }}
      />

      {/* HEADER & KPI SUMMARY */}
      <div
        className="p-4 rounded-lg border space-y-3 shadow-sm"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-black">🎙️ Podcast 運用テーブル（Notion代替・スペイン語台本＆視聴分析）</h1>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              iPhone思考CSV取込 → Geminiスペイン語台本生成 → YouTube Library / Spotify Creators 視聴記録を一元管理
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => csvInputRef.current?.click()}
              className="px-3 py-1.5 rounded-lg border-2 font-black text-xs"
              style={{ borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)', background: 'rgba(217,168,78,0.14)' }}
            >
              📥 思考メモCSV取込
            </button>
            <button
              type="button"
              onClick={() => setShowAnalyticsModal(true)}
              className="px-3 py-1.5 rounded-lg border-2 font-black text-xs"
              style={{ borderColor: 'var(--zelda-cyan)', color: 'var(--zelda-cyan)', background: 'rgba(106,174,192,0.14)' }}
            >
              📊 YT/Spotify 記録貼付
            </button>
            <a
              href="https://studio.youtube.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1.5 rounded-lg border font-bold text-xs"
              style={{ borderColor: 'var(--border)', color: 'var(--text-sub)' }}
            >
              YouTube Studio ↗
            </a>
            <a
              href="https://creators.spotify.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1.5 rounded-lg border font-bold text-xs"
              style={{ borderColor: 'var(--border)', color: 'var(--text-sub)' }}
            >
              Spotify Creators ↗
            </a>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <div className="p-2.5 rounded-lg border" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>エピソード数</div>
            <div className="text-base font-black" style={{ color: 'var(--zelda-gold)' }}>
              {episodes.length}本 <span className="text-[10px]">(公開 {totals.published})</span>
            </div>
          </div>
          <div className="p-2.5 rounded-lg border" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>▶️ YouTube 総再生</div>
            <div className="text-base font-black" style={{ color: '#f87171' }}>{totals.ytViews.toLocaleString()}回</div>
          </div>
          <div className="p-2.5 rounded-lg border" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>⏱️ YouTube 総視聴</div>
            <div className="text-base font-black" style={{ color: 'var(--zelda-gold)' }}>
              {(totals.ytWatchMin / 60).toFixed(1)}時間
            </div>
          </div>
          <div className="p-2.5 rounded-lg border" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>🎧 Spotify 総再生</div>
            <div className="text-base font-black" style={{ color: 'var(--zelda-zonai)' }}>{totals.spotifyPlays.toLocaleString()}回</div>
          </div>
          <div className="p-2.5 rounded-lg border" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>👥 Spotify リスナー</div>
            <div className="text-base font-black" style={{ color: 'var(--zelda-cyan)' }}>{totals.spotifyListeners.toLocaleString()}人</div>
          </div>
        </div>
      </div>

      {/* ADD NEW EPISODE BAR */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!newTitle.trim()) return;
          const maxNo = episodes.reduce((m, ep) => Math.max(m, ep.epNo), 0);
          const next: PodcastEpisode[] = [
            {
              id: `ep_${Date.now()}`,
              epNo: maxNo + 1,
              title: newTitle.trim(),
              sourceMemo: newMemo.trim() || newTitle.trim(),
              status: 'IDEA',
              spanishScript: '',
              publishDate: '',
              ytViews: 0,
              ytWatchMin: 0,
              spotifyPlays: 0,
              spotifyListeners: 0,
              updatedAt: new Date().toISOString(),
            },
            ...episodes,
          ];
          persist(next);
          setNewTitle('');
          setNewMemo('');
          notify('✓ 新しいPodcastネタを追加しました');
        }}
        className="p-3 rounded-lg border flex flex-wrap gap-2 items-center"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="＋ 新しいエピソードタイトル / テーマ"
          className="w-60 px-2.5 py-1.5 rounded border text-xs font-bold"
          style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
        />
        <input
          type="text"
          value={newMemo}
          onChange={(e) => setNewMemo(e.target.value)}
          placeholder="思ったことメモ（Geminiスペイン語台本の元ネタ）"
          className="flex-1 min-w-[200px] px-2.5 py-1.5 rounded border text-xs"
          style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
        />
        <button
          type="submit"
          className="px-4 py-1.5 rounded-lg font-black text-xs"
          style={{ background: 'var(--accent)', color: '#1e1a16' }}
        >
          ＋ ネタ追加
        </button>
      </form>

      {/* STATUS FILTER PILLS */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(['ALL', 'IDEA', 'SCRIPTING', 'RECORDED', 'EDITED', 'PUBLISHED'] as const).map((st) => {
          const active = statusFilter === st;
          return (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className="px-2.5 py-1 rounded-lg border text-xs font-extrabold"
              style={{
                background: active ? 'var(--accent)' : 'var(--bg-card)',
                borderColor: active ? 'var(--zelda-gold)' : 'var(--border)',
                color: active ? '#1e1a16' : 'var(--text)',
              }}
            >
              {st === 'ALL' ? `すべて (${episodes.length})` : STATUS_META[st].label}
            </button>
          );
        })}
      </div>

      {/* NOTION-STYLE PODCAST TABLE */}
      <div className="overflow-x-auto rounded-lg border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <table className="w-full text-left text-xs border-collapse">
          <thead style={{ background: '#212823', color: '#e4dac6' }}>
            <tr>
              <th className="py-2.5 px-3">Ep</th>
              <th className="py-2.5 px-3">ステータス</th>
              <th className="py-2.5 px-3">タイトル ＆ 元メモ</th>
              <th className="py-2.5 px-3">🇪🇸 Gemini台本</th>
              <th className="py-2.5 px-3">▶️ YouTube</th>
              <th className="py-2.5 px-3">🎧 Spotify</th>
              <th className="py-2.5 px-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {visible.map((ep) => (
              <tr key={ep.id} className="hover:bg-[var(--bg-card2)]">
                <td className="py-2.5 px-3 font-black tabular-nums" style={{ color: 'var(--zelda-gold)' }}>
                  #{ep.epNo}
                </td>
                <td className="py-2.5 px-3 whitespace-nowrap">
                  <select
                    value={ep.status}
                    onChange={(e) => {
                      const next = episodes.map((x) =>
                        x.id === ep.id ? { ...x, status: e.target.value as EpStatus, updatedAt: new Date().toISOString() } : x
                      );
                      persist(next);
                    }}
                    className="px-2 py-1 rounded border text-[11px] font-black"
                    style={{
                      background: STATUS_META[ep.status].bg,
                      borderColor: STATUS_META[ep.status].color,
                      color: STATUS_META[ep.status].color,
                    }}
                  >
                    {(Object.keys(STATUS_META) as EpStatus[]).map((k) => (
                      <option key={k} value={k}>
                        {STATUS_META[k].label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2.5 px-3 max-w-xs">
                  <div className="font-black text-xs">{ep.title}</div>
                  <div className="text-[10.5px] line-clamp-2 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {ep.sourceMemo}
                  </div>
                </td>
                <td className="py-2.5 px-3 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(buildGeminiSpanishPrompt(ep)).catch(() => {});
                        notify(`📋 Geminiスペイン語台本プロンプトをコピーしました (#${ep.epNo})`);
                      }}
                      className="px-2 py-1 rounded border font-black text-[10.5px]"
                      style={{ borderColor: 'var(--zelda-cyan)', color: 'var(--zelda-cyan)' }}
                    >
                      ✨ Geminiプロンプト
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(ep.id)}
                      className="px-2 py-1 rounded border font-bold text-[10.5px]"
                      style={{
                        borderColor: ep.spanishScript ? 'var(--zelda-zonai)' : 'var(--border)',
                        color: ep.spanishScript ? 'var(--zelda-zonai)' : 'var(--text-muted)',
                      }}
                    >
                      {ep.spanishScript ? '✓ 台本編集' : '台本入力'}
                    </button>
                  </div>
                </td>
                <td className="py-2.5 px-3 whitespace-nowrap tabular-nums">
                  <div className="font-bold">{ep.ytViews}回</div>
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{ep.ytWatchMin}分</div>
                </td>
                <td className="py-2.5 px-3 whitespace-nowrap tabular-nums">
                  <div className="font-bold">{ep.spotifyPlays}回</div>
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{ep.spotifyListeners}人</div>
                </td>
                <td className="py-2.5 px-3 whitespace-nowrap text-right">
                  <div className="inline-flex gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingId(ep.id)}
                      className="px-2 py-1 rounded border font-bold text-[10.5px]"
                      style={{ borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)' }}
                    >
                      詳細・編集
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        persist(episodes.filter((x) => x.id !== ep.id));
                        notify(`🗑️ #${ep.epNo} を削除しました`);
                      }}
                      className="px-2 py-1 rounded border text-[10.5px]"
                      style={{ borderColor: 'var(--f1-soft)', color: 'var(--f1-soft)' }}
                    >
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* EPISODE DETAIL / SCRIPT / ANALYTICS MODAL */}
      {editingEp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border-2 p-4 space-y-3 shadow-2xl"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--zelda-gold)', color: 'var(--text)' }}
          >
            <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--border)' }}>
              <span className="text-sm font-black">🎙️ Ep #{editingEp.epNo} 編集・台本・視聴記録</span>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="px-2.5 py-1 rounded border text-xs font-bold"
                style={{ borderColor: 'var(--border)' }}
              >
                ✕ 閉じる
              </button>
            </div>

            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] font-bold mb-1" style={{ color: 'var(--text-muted)' }}>タイトル</label>
                <input
                  type="text"
                  value={editingEp.title}
                  onChange={(e) =>
                    persist(episodes.map((x) => (x.id === editingEp.id ? { ...x, title: e.target.value } : x)))
                  }
                  className="w-full px-2.5 py-1.5 rounded border text-xs font-bold"
                  style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold mb-1" style={{ color: 'var(--text-muted)' }}>元の思考メモ</label>
                <textarea
                  rows={3}
                  value={editingEp.sourceMemo}
                  onChange={(e) =>
                    persist(episodes.map((x) => (x.id === editingEp.id ? { ...x, sourceMemo: e.target.value } : x)))
                  }
                  className="w-full p-2 rounded border text-xs"
                  style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold" style={{ color: 'var(--zelda-cyan)' }}>🇪🇸 スペイン語台本 (Gemini出力を貼付)</label>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(buildGeminiSpanishPrompt(editingEp)).catch(() => {});
                      notify('📋 Geminiプロンプトをコピーしました');
                    }}
                    className="px-2 py-0.5 rounded font-black text-[10px]"
                    style={{ background: 'var(--accent)', color: '#1e1a16' }}
                  >
                    ✨ Geminiプロンプトをコピー
                  </button>
                </div>
                <textarea
                  rows={6}
                  value={editingEp.spanishScript}
                  onChange={(e) =>
                    persist(episodes.map((x) => (x.id === editingEp.id ? { ...x, spanishScript: e.target.value } : x)))
                  }
                  placeholder="Geminiで作ったスペイン語台本をここに貼り付けて保存..."
                  className="w-full p-2 rounded border text-xs"
                  style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div>
                  <label className="block text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>公開日</label>
                  <input
                    type="date"
                    value={editingEp.publishDate}
                    onChange={(e) =>
                      persist(episodes.map((x) => (x.id === editingEp.id ? { ...x, publishDate: e.target.value } : x)))
                    }
                    className="mt-1 w-full px-2 py-1 rounded border text-xs"
                    style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>YT再生数</label>
                  <input
                    type="number"
                    value={editingEp.ytViews}
                    onChange={(e) =>
                      persist(episodes.map((x) => (x.id === editingEp.id ? { ...x, ytViews: Number(e.target.value) || 0 } : x)))
                    }
                    className="mt-1 w-full px-2 py-1 rounded border text-xs"
                    style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>YT視聴(分)</label>
                  <input
                    type="number"
                    value={editingEp.ytWatchMin}
                    onChange={(e) =>
                      persist(episodes.map((x) => (x.id === editingEp.id ? { ...x, ytWatchMin: Number(e.target.value) || 0 } : x)))
                    }
                    className="mt-1 w-full px-2 py-1 rounded border text-xs"
                    style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>Spotify再生</label>
                  <input
                    type="number"
                    value={editingEp.spotifyPlays}
                    onChange={(e) =>
                      persist(episodes.map((x) => (x.id === editingEp.id ? { ...x, spotifyPlays: Number(e.target.value) || 0 } : x)))
                    }
                    className="mt-1 w-full px-2 py-1 rounded border text-xs"
                    style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>Spotifyリスナー</label>
                  <input
                    type="number"
                    value={editingEp.spotifyListeners}
                    onChange={(e) =>
                      persist(episodes.map((x) => (x.id === editingEp.id ? { ...x, spotifyListeners: Number(e.target.value) || 0 } : x)))
                    }
                    className="mt-1 w-full px-2 py-1 rounded border text-xs"
                    style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* YOUTUBE / SPOTIFY ANALYTICS PASTE MODAL */}
      {showAnalyticsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div
            className="w-full max-w-lg rounded-xl border-2 p-4 space-y-3 shadow-2xl"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--zelda-cyan)', color: 'var(--text)' }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-black">📊 YouTube / Spotify 視聴記録の一括貼付</span>
              <button
                type="button"
                onClick={() => setShowAnalyticsModal(false)}
                className="px-2 py-0.5 rounded border text-xs"
                style={{ borderColor: 'var(--border)' }}
              >
                ✕
              </button>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              形式：<code>Ep番号(またはタイトル), YT再生数, YT視聴分, Spotify再生数, Spotifyリスナー数</code>（カンマまたはタブ区切り）
            </p>
            <textarea
              rows={5}
              value={analyticsPaste}
              onChange={(e) => setAnalyticsPaste(e.target.value)}
              placeholder={"Ep1, 180, 620, 120, 82\nEp2, 45, 160, 38, 25"}
              className="w-full p-2.5 rounded border text-xs"
              style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleAnalyticsPaste}
                className="px-4 py-1.5 rounded-lg font-black text-xs"
                style={{ background: 'var(--accent)', color: '#1e1a16' }}
              >
                ⚡ 視聴記録を反映
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
