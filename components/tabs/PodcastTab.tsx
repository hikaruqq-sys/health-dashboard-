'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

type EpStatus = 'NOT_STARTED' | 'SCRIPTING' | 'RECORDED' | 'PUBLISHED';

interface PodcastEpisode {
  id: string;
  epNo: number;
  title: string;
  publishDate: string;
  status: EpStatus;
  sourceMemo?: string;
  script: string; // Unified Notion-style script body
  // Legacy fields kept optional for backward compatibility
  videoMetadata?: string;
  alignmentScript?: string;
  recordingGuide?: string;
  ytViews?: number;
  spotifyPlays?: number;
  updatedAt: string;
}

const PODCAST_KV_KEY = 'agy_podcast_ops_v2';

const STATUS_META: Record<EpStatus, { label: string; color: string; bg: string }> = {
  NOT_STARTED: { label: '○ 未着手', color: 'var(--text-sub)', bg: 'var(--bg-card2)' },
  SCRIPTING: { label: '✍️ 台本中', color: 'var(--zelda-cyan)', bg: 'rgba(106,174,192,0.16)' },
  RECORDED: { label: '🎙️ 収録済', color: 'var(--zelda-gold)', bg: 'rgba(217,168,78,0.18)' },
  PUBLISHED: { label: '🚀 公開済', color: 'var(--zelda-zonai)', bg: 'rgba(111,176,135,0.2)' },
};

const INITIAL_EPISODES: PodcastEpisode[] = [
  {
    id: 'ep_20261115',
    epNo: 26,
    title: '¡Qué padre semana en Tokio!',
    publishDate: '2026-11-15',
    status: 'PUBLISHED',
    sourceMemo: '今週の東京は秋晴れが最高。ユニクロの定番服の耐久性、上司のモチベーション、湾岸BBQと息子との時間。',
    script: `Título
¡Qué padre semana en Tokio!（東京で過ごした最高の1週間！）

Descripción del Podcast
¿Cómo sobrevivir a la rutina de oficina en Japón sin perder la chispa?
Te cuento cómo una buena carne asada con viejos amigos y jugar con mi hijo me devolvieron toda la energía esta semana.

#VivirEnJapon #Salaryman #Mexico #VidaEnJapon #AprenderEspanol

---

¡Qué onda, amigos!
¿Alguna vez han sentido que el clima perfecto te dan ganas de escaparte de la oficina?
Esta semana en Tokio el otoño estuvo increíble y me dejó muchas lecciones.
Bienvenidos a un episodio más de Mi Vecino Salaryman.
Soy un salaryman japonés, más japonés que el sushi, pero con corazón mexicano.
Hoy quiero platicarles sobre mi última semana y cómo recuperar el control de nuestro bienestar.
Primero, hablemos de la vida de oficina y las cosas cotidianas.
Esta semana me di cuenta de algo muy curioso sobre la ropa.
Compré prendas en una tienda económica, pero al año ya no sirven.
En cambio, la durabilidad de marcas básicas japonesas como Uniqlo es realmente impresionante.
A veces lo simple y bien hecho es lo que más dura en la vida.`,
    ytViews: 142,
    spotifyPlays: 96,
    updatedAt: '2026-11-15T10:00:00Z',
  },
  {
    id: 'ep_20261108',
    epNo: 25,
    title: 'Escapar para encontrar mi rumbo',
    publishDate: '2026-11-08',
    status: 'PUBLISHED',
    script: '',
    updatedAt: '2026-11-08T10:00:00Z',
  },
  {
    id: 'ep_20261026',
    epNo: 24,
    title: 'Dueño de mi propia vida',
    publishDate: '2026-10-26',
    status: 'PUBLISHED',
    script: '',
    updatedAt: '2026-10-26T10:00:00Z',
  },
  {
    id: 'ep_20261018',
    epNo: 23,
    title: 'Cosechando Frutos de la Vida',
    publishDate: '2026-10-18',
    status: 'PUBLISHED',
    script: '',
    updatedAt: '2026-10-18T10:00:00Z',
  },
  {
    id: 'ep_20261012',
    epNo: 22,
    title: 'Dueño de mi propio rumbo',
    publishDate: '2026-10-12',
    status: 'PUBLISHED',
    script: '',
    updatedAt: '2026-10-12T10:00:00Z',
  },
  {
    id: 'ep_20261004',
    epNo: 21,
    title: 'Tenis, Chispa y Lucha Diaria',
    publishDate: '2026-10-04',
    status: 'PUBLISHED',
    script: '',
    updatedAt: '2026-10-04T10:00:00Z',
  },
];

function normalizeEpisode(raw: Record<string, unknown>, idx: number): PodcastEpisode {
  const combinedLegacy = [raw.videoMetadata, raw.alignmentScript, raw.recordingGuide]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join('\n\n---\n\n');
  const rawStatus = String(raw.status || 'NOT_STARTED');
  const status: EpStatus =
    rawStatus === 'PUBLISHED' || rawStatus === 'RECORDED' || rawStatus === 'SCRIPTING'
      ? rawStatus
      : rawStatus === 'EDITED'
        ? 'RECORDED'
        : 'NOT_STARTED';
  return {
    id: String(raw.id || `ep_${idx}`),
    epNo: Number(raw.epNo || idx + 1),
    title: String(raw.title || 'Untitled'),
    publishDate: String(raw.publishDate || ''),
    status,
    sourceMemo: String(raw.sourceMemo || ''),
    script: String(raw.script || combinedLegacy || ''),
    ytViews: Number(raw.ytViews || 0),
    spotifyPlays: Number(raw.spotifyPlays || 0),
    updatedAt: String(raw.updatedAt || new Date().toISOString()),
  };
}

function buildMiVecinoSalarymanPrompt(ep: PodcastEpisode): string {
  const memo = (ep.sourceMemo || '').trim() || ep.title;
  return `# Podcast Script Generator — "Mi Vecino Salaryman"

You are the head scriptwriter for the Mexican Spanish podcast **"Mi Vecino Salaryman"** hosted by a Japanese salaryman living in Tokyo.

## Speaker Profile
- **Identity**: 40-year-old Japanese salaryman in Tokyo. Catchphrase: *"Más japonés que el sushi, pero con corazón mexicano."*
- **Family**: Father of a 7-year-old son (never mention real names — refer to him naturally as "mi hijo").
- **Spanish Level**: DELE B1 (warm, conversational Mexican Spanish — *¡Qué onda!, ¡Qué padre!, chamba, recargar pilas*).
- **Interests**: Tennis, F1, Atlético de Madrid, asset building, technology, Japanese culture & work life.
- **Strict Privacy**: Anonymize all company, client, and colleague names.

## Source Topic / Memo
${memo}

## Required 3-Section Output Format
1. **Video Metadata**: Catchy 3-5 Spanish word Título + Descripción del Podcast + 5 hashtags: \`#VivirEnJapon #Salaryman #Mexico #VidaEnJapon #AprenderEspanol\`
2. **Subtitle & Audio Alignment Script**: Clean plain Mexican Spanish text ONLY (10-15 words/line, no timestamps/headers/JP).
3. **Recording & Practice Guide**: Timed sections (~5 min) with Japanese translation & key Mexican Spanish expressions.`;
}

export default function PodcastTab() {
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>(INITIAL_EPISODES);
  const [selectedId, setSelectedId] = useState<string>(INITIAL_EPISODES[0].id);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2800);
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PODCAST_KV_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const norm = parsed.map((x, i) => normalizeEpisode(x, i));
          setEpisodes(norm);
          setSelectedId(norm[0].id);
        }
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
              const norm = (data.data as Record<string, unknown>[]).map((x, i) => normalizeEpisode(x, i));
              setEpisodes(norm);
              setSelectedId((cur) => (norm.some((e) => e.id === cur) ? cur : norm[0].id));
              try {
                localStorage.setItem(PODCAST_KV_KEY, JSON.stringify(norm));
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

  const updateSelected = (patch: Partial<PodcastEpisode>) => {
    persist(
      episodes.map((ep) =>
        ep.id === selectedId ? { ...ep, ...patch, updatedAt: new Date().toISOString() } : ep
      )
    );
  };

  const createNewEpisode = () => {
    const maxNo = episodes.reduce((m, e) => Math.max(m, e.epNo), 0);
    const newEp: PodcastEpisode = {
      id: `ep_${Date.now()}`,
      epNo: maxNo + 1,
      title: '新しいエピソード',
      publishDate: new Date().toISOString().slice(0, 10),
      status: 'NOT_STARTED',
      sourceMemo: '',
      script: '',
      ytViews: 0,
      spotifyPlays: 0,
      updatedAt: new Date().toISOString(),
    };
    persist([newEp, ...episodes]);
    setSelectedId(newEp.id);
    notify('＋ 新しいエピソードを追加しました');
  };

  const handleCsvImport = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
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
        publishDate: new Date().toISOString().slice(0, 10),
        status: 'NOT_STARTED',
        sourceMemo: memo,
        script: '',
        ytViews: 0,
        spotifyPlays: 0,
        updatedAt: new Date().toISOString(),
      });
    });

    if (added.length > 0) {
      persist([...added, ...episodes]);
      setSelectedId(added[0].id);
      notify(`📥 CSVから ${added.length}件を取り込みました`);
    }
  };

  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return episodes
      .filter((e) => !q || e.title.toLowerCase().includes(q) || e.script.toLowerCase().includes(q))
      .sort((a, b) => (b.publishDate || '').localeCompare(a.publishDate || '') || b.epNo - a.epNo);
  }, [episodes, searchQuery]);

  const selectedEp = episodes.find((e) => e.id === selectedId) || visible[0] || null;

  return (
    <div className="max-w-[1360px] mx-auto space-y-3 text-xs" style={{ color: 'var(--text)' }}>
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

      {/* SIMPLE HEADER */}
      <div
        className="px-4 py-3 rounded-lg border flex flex-wrap items-center justify-between gap-2"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-base font-black">📻 Mi Vecino Salaryman</span>
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            全{episodes.length}本
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={createNewEpisode}
            className="px-3 py-1.5 rounded-lg font-black text-xs"
            style={{ background: 'var(--accent)', color: '#1e1a16' }}
          >
            ＋ 新規エピソード
          </button>
          <button
            type="button"
            onClick={() => csvInputRef.current?.click()}
            className="px-2.5 py-1.5 rounded-lg border font-bold text-xs"
            style={{ borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)' }}
          >
            📥 思考CSV取込
          </button>
          <a
            href="https://studio.youtube.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1.5 rounded-lg border text-[11px]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-sub)' }}
          >
            YouTube Studio ↗
          </a>
          <a
            href="https://creators.spotify.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1.5 rounded-lg border text-[11px]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-sub)' }}
          >
            Spotify Creators ↗
          </a>
        </div>
      </div>

      {/* CLEAN 2-PANE NOTION LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        {/* LEFT: EPISODE LIST */}
        <div
          className="lg:col-span-4 rounded-lg border overflow-hidden"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="p-2 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-card2)' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 タイトル・台本を検索..."
              className="w-full px-2.5 py-1.5 rounded border text-xs"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            />
          </div>

          <div className="divide-y max-h-[75vh] overflow-y-auto" style={{ borderColor: 'var(--border)' }}>
            {visible.map((ep) => {
              const isSel = selectedEp?.id === ep.id;
              return (
                <button
                  key={ep.id}
                  type="button"
                  onClick={() => setSelectedId(ep.id)}
                  className="w-full text-left px-3 py-2.5 transition-colors flex items-center justify-between gap-2"
                  style={{
                    background: isSel ? 'rgba(217,168,78,0.16)' : 'transparent',
                    borderLeft: isSel ? '3px solid var(--zelda-gold)' : '3px solid transparent',
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-black text-xs truncate">{ep.title}</div>
                    <div className="flex items-center gap-2 mt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      <span>{ep.publishDate || '日付未設定'}</span>
                      <span
                        className="px-1.5 rounded font-bold"
                        style={{ background: STATUS_META[ep.status].bg, color: STATUS_META[ep.status].color }}
                      >
                        {STATUS_META[ep.status].label}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT: MINIMAL EDITOR (TITLE + DATE + SCRIPT) */}
        <div
          className="lg:col-span-8 rounded-lg border p-4 space-y-3"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          {selectedEp ? (
            <>
              {/* TITLE + DATE + STATUS + DELETE */}
              <div className="space-y-2 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
                <input
                  type="text"
                  value={selectedEp.title}
                  onChange={(e) => updateSelected({ title: e.target.value })}
                  placeholder="エピソードタイトル"
                  className="w-full text-lg font-black bg-transparent outline-none"
                  style={{ color: 'var(--text)' }}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="date"
                      value={selectedEp.publishDate}
                      onChange={(e) => updateSelected({ publishDate: e.target.value })}
                      className="px-2 py-1 rounded border text-xs"
                      style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
                    />
                    <select
                      value={selectedEp.status}
                      onChange={(e) => updateSelected({ status: e.target.value as EpStatus })}
                      className="px-2 py-1 rounded border text-xs font-bold"
                      style={{
                        background: STATUS_META[selectedEp.status].bg,
                        borderColor: STATUS_META[selectedEp.status].color,
                        color: STATUS_META[selectedEp.status].color,
                      }}
                    >
                      {(Object.keys(STATUS_META) as EpStatus[]).map((k) => (
                        <option key={k} value={k}>{STATUS_META[k].label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(buildMiVecinoSalarymanPrompt(selectedEp)).catch(() => {});
                        notify('✨ Geminiプロンプトをコピーしました！');
                      }}
                      className="px-3 py-1 rounded font-black text-[11px]"
                      style={{ background: 'var(--accent)', color: '#1e1a16' }}
                    >
                      ✨ Geminiプロンプトコピー
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm(`「${selectedEp.title}」を削除しますか？`)) return;
                        const next = episodes.filter((x) => x.id !== selectedEp.id);
                        persist(next);
                        setSelectedId(next[0]?.id || '');
                        notify('🗑️ 削除しました');
                      }}
                      className="px-2 py-1 rounded border text-[11px]"
                      style={{ borderColor: 'var(--f1-soft)', color: 'var(--f1-soft)' }}
                    >
                      🗑 削除
                    </button>
                  </div>
                </div>
              </div>

              {/* UNIFIED SCRIPT AREA */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black" style={{ color: 'var(--zelda-gold)' }}>
                    📝 台本（Geminiの出力をそのまま貼り付け・編集）
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(selectedEp.script).catch(() => {});
                      notify('📋 台本をコピーしました');
                    }}
                    className="px-2 py-0.5 rounded border text-[10px]"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    📋 全文コピー
                  </button>
                </div>
                <textarea
                  rows={20}
                  value={selectedEp.script}
                  onChange={(e) => updateSelected({ script: e.target.value })}
                  placeholder="ここにスペイン語台本・概要・メモをそのまま貼り付けて管理..."
                  className="w-full p-3 rounded-lg border text-xs leading-relaxed"
                  style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
                />
              </div>

              {/* OPTIONAL COLLAPSIBLE MEMO & STATS */}
              <details className="rounded-lg border p-2.5" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}>
                <summary className="cursor-pointer font-bold text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  ▸ オプション（元の思考メモ / 視聴数メモ：▶️{selectedEp.ytViews || 0}・🎧{selectedEp.spotifyPlays || 0}）
                </summary>
                <div className="mt-2.5 space-y-2">
                  <input
                    type="text"
                    value={selectedEp.sourceMemo || ''}
                    onChange={(e) => updateSelected({ sourceMemo: e.target.value })}
                    placeholder="元の思考メモ（Geminiプロンプトに渡すネタ）"
                    className="w-full px-2.5 py-1.5 rounded border text-xs"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 text-[11px]">
                      <span>▶️ YouTube再生:</span>
                      <input
                        type="number"
                        value={selectedEp.ytViews || 0}
                        onChange={(e) => updateSelected({ ytViews: Number(e.target.value) || 0 })}
                        className="w-24 px-2 py-1 rounded border text-xs"
                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-[11px]">
                      <span>🎧 Spotify再生:</span>
                      <input
                        type="number"
                        value={selectedEp.spotifyPlays || 0}
                        onChange={(e) => updateSelected({ spotifyPlays: Number(e.target.value) || 0 })}
                        className="w-24 px-2 py-1 rounded border text-xs"
                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                      />
                    </label>
                  </div>
                </div>
              </details>
            </>
          ) : (
            <div className="py-12 text-center" style={{ color: 'var(--text-muted)' }}>
              左のリストからエピソードを選ぶか、「＋ 新規エピソード」を押してください。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
