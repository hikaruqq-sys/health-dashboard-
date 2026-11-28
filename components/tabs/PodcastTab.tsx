'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

type EpStatus = 'NOT_STARTED' | 'SCRIPTING' | 'RECORDED' | 'EDITED' | 'PUBLISHED';

interface PodcastEpisode {
  id: string;
  epNo: number;
  title: string;
  publishDate: string;
  status: EpStatus;
  season: string;
  theme: string;
  reflection: string; // 振り返り
  summary: string; // 概要
  sourceMemo: string; // 元の思考CSVメモ
  // Section 1: Video Metadata
  videoMetadata: string;
  // Section 2: Subtitle & Audio Alignment Script (clean plain text, 10-15 words/line)
  alignmentScript: string;
  // Section 3: Recording & Practice Guide (timed + JP translation)
  recordingGuide: string;
  // Result (YouTube & Spotify Analytics)
  ytViews: number;
  ytWatchMin: number;
  spotifyPlays: number;
  spotifyListeners: number;
  updatedAt: string;
}

const PODCAST_KV_KEY = 'agy_podcast_ops_v2';
const LEGACY_KV_KEY = 'agy_podcast_ops_v1';

const STATUS_META: Record<EpStatus, { label: string; color: string; bg: string }> = {
  NOT_STARTED: { label: '○ Not started', color: 'var(--text-sub)', bg: 'var(--bg-card2)' },
  SCRIPTING: { label: '✍️ 台本作成中', color: 'var(--zelda-cyan)', bg: 'rgba(106,174,192,0.16)' },
  RECORDED: { label: '🎙️ 収録済', color: 'var(--zelda-gold)', bg: 'rgba(217,168,78,0.18)' },
  EDITED: { label: '🎬 編集済', color: '#a78bfa', bg: 'rgba(167,139,250,0.18)' },
  PUBLISHED: { label: '🚀 公開済', color: 'var(--zelda-zonai)', bg: 'rgba(111,176,135,0.2)' },
};

const INITIAL_EPISODES: PodcastEpisode[] = [
  {
    id: 'ep_20261115',
    epNo: 26,
    title: '¡Qué padre semana en Tokio!',
    publishDate: '2026-11-15',
    status: 'PUBLISHED',
    season: 'S2',
    theme: '東京の秋・オフィス生活・家族BBQ',
    reflection: 'メキシコ風の表現（¡Qué padre! / chamba）が自然に出た。',
    summary: '秋の東京での気づき。ユニクロの定番服の耐久性、上司のモチベーションの源泉、湾岸BBQと息子との時間。',
    sourceMemo: '今週の東京は秋晴れが最高だった。安い服は1年でダメになるけどユニクロの定番は長持ちする。仕事もデータベース設計も土台が大事。週末は友人たちとBBQ、息子と遊んでリチャージ。',
    videoMetadata: `Título
¡Qué padre semana en Tokio!（東京で過ごした最高の1週間！）

Descripción del Podcast
¿Cómo sobrevivir a la rutina de oficina en Japón sin perder la chispa?
Te cuento cómo una buena carne asada con viejos amigos y jugar con mi hijo me devolvieron toda la energía esta semana.

En este episodio de Mi Vecino Salaryman, reflexionamos sobre los pequeños cambios que hacen la diferencia: desde entender qué motiva a un jefe en la oficina y por qué la ropa básica de Uniqlo dura tanto, hasta la importancia de tener bases flexibles en la vida y en el trabajo. Además, celebramos el buen clima del otoño japonés disfrutando de un BBQ frente a la bahía y recargando pilas en familia.

Si te gusta la cultura japonesa, el crecimiento personal o estás aprendiendo español, ¡suscríbete al canal y acompáñame cada semana!

#VivirEnJapon #Salaryman #Mexico #VidaEnJapon #AprenderEspanol`,
    alignmentScript: `¡Qué onda, amigos!
¿Alguna vez han sentido que el clima perfecto te dan ganas de escaparte de la oficina?
Esta semana en Tokio el otoño estuvo increíble y me dejó muchas lecciones.
Bienvenidos a un episodio más de Mi Vecino Salaryman.
Soy un salaryman japonés, más japonés que el sushi, pero con corazón mexicano.
Hoy quiero platicarles sobre mi última semana y cómo recuperar el control de nuestro bienestar.
Primero, hablemos de la vida de oficina y las cosas cotidianas.
Esta semana me di cuenta de algo muy curioso sobre la ropa.
Compré prendas en una tienda económica, pero al año ya no sirven.
En cambio, la durabilidad de marcas básicas japonesas como Uniqlo es realmente impresionante.
A veces lo simple y bien hecho es lo que más dura en la vida.
Lo mismo pasa en el trabajo cuando diseñamos bases de datos o proyectos.
Si no piensas en una estructura flexible desde el principio, después todo se complica.
También observé cómo cambian las personas en la empresa.
Mi jefe andaba súper motivado esta semana solo porque un conocido suyo era el contacto del cliente.
Es increíble ver cómo cada persona tiene un botón diferente para encender su motivación.
Aunque con el clima tan agradable del otoño, la verdad es que dan ganas de faltar al trabajo.
Por suerte, tengo mis propios métodos para mantener el equilibrio y cuidar mi cuerpo.
Empecé a poner más atención en mi postura y en moverme desde la cadera.`,
    recordingGuide: `[0:00 - 0:45] Intro & Hook
ES: ¡Qué onda, amigos! ¿Alguna vez han sentido que el clima perfecto te dan ganas de escaparte de la oficina?
JP: やあ、みんな！最高の天気に「会社サボりたいな」って思ったことある？

[0:45 - 3:00] Cuerpo 1: La durabilidad de lo simple (Uniqlo y bases de datos)
ES: A veces lo simple y bien hecho es lo que más dura en la vida.
JP: シンプルでしっかり作られたものが、人生でも一番長持ちするんだよね。

[3:00 - 5:00] Cierre: BBQ en la bahía y energía en familia
ES: Nos vemos en el próximo episodio de Mi Vecino Salaryman. ¡Un abrazo!
JP: また次回のMi Vecino Salarymanで会おうね。ではまた！`,
    ytViews: 142,
    ytWatchMin: 480,
    spotifyPlays: 96,
    spotifyListeners: 64,
    updatedAt: '2026-11-15T10:00:00Z',
  },
  {
    id: 'ep_20261108',
    epNo: 25,
    title: 'Escapar para encontrar mi rumbo',
    publishDate: '2026-11-08',
    status: 'PUBLISHED',
    season: 'S2',
    theme: 'キャリア・自分の軸を取り戻す',
    reflection: '',
    summary: '日常から少し距離を置いて、自分が本当に進みたい方向を見つめ直す週。',
    sourceMemo: '忙しい毎日から一度距離を置いて自分の軸を確認した1週間。',
    videoMetadata: '',
    alignmentScript: '',
    recordingGuide: '',
    ytViews: 118,
    ytWatchMin: 390,
    spotifyPlays: 84,
    spotifyListeners: 55,
    updatedAt: '2026-11-08T10:00:00Z',
  },
  {
    id: 'ep_20261026',
    epNo: 24,
    title: 'Dueño de mi propia vida',
    publishDate: '2026-10-26',
    status: 'PUBLISHED',
    season: 'S2',
    theme: '自律・時間管理',
    reflection: '',
    summary: '会社や周囲に振り回されず、自分の時間の主導権を握るための習慣づくり。',
    sourceMemo: '自分の時間の主導権を取り戻す。朝活と資産形成の仕組み化。',
    videoMetadata: '',
    alignmentScript: '',
    recordingGuide: '',
    ytViews: 135,
    ytWatchMin: 440,
    spotifyPlays: 91,
    spotifyListeners: 61,
    updatedAt: '2026-10-26T10:00:00Z',
  },
  {
    id: 'ep_20261018',
    epNo: 23,
    title: 'Cosechando Frutos de la Vida',
    publishDate: '2026-10-18',
    status: 'PUBLISHED',
    season: 'S2',
    theme: '継続の成果・テニスと学習',
    reflection: '',
    summary: 'コツコツ続けてきたスペイン語、テニス、資産運用の小さな実りを感じる回。',
    sourceMemo: '日々の積み上げが少しずつ形になってきた実感。',
    videoMetadata: '',
    alignmentScript: '',
    recordingGuide: '',
    ytViews: 126,
    ytWatchMin: 410,
    spotifyPlays: 88,
    spotifyListeners: 58,
    updatedAt: '2026-10-18T10:00:00Z',
  },
  {
    id: 'ep_20261012',
    epNo: 22,
    title: 'Dueño de mi propio rumbo',
    publishDate: '2026-10-12',
    status: 'PUBLISHED',
    season: 'S2',
    theme: '40代のキャリアと選択',
    reflection: '',
    summary: '他人の期待ではなく自分のコンパスで進むための思考整理。',
    sourceMemo: '自分のコンパスで進む。40代からの生き方と働き方。',
    videoMetadata: '',
    alignmentScript: '',
    recordingGuide: '',
    ytViews: 110,
    ytWatchMin: 360,
    spotifyPlays: 79,
    spotifyListeners: 50,
    updatedAt: '2026-10-12T10:00:00Z',
  },
  {
    id: 'ep_20261004',
    epNo: 21,
    title: 'Tenis, Chispa y Lucha Diaria',
    publishDate: '2026-10-04',
    status: 'PUBLISHED',
    season: 'S2',
    theme: 'テニス・日々の戦い',
    reflection: '',
    summary: '週末のテニス試合で得た気づきと、平日のサラリーマン生活のリアル。',
    sourceMemo: 'テニスの試合でのメンタルと、平日の仕事での切り替え。',
    videoMetadata: '',
    alignmentScript: '',
    recordingGuide: '',
    ytViews: 151,
    ytWatchMin: 510,
    spotifyPlays: 102,
    spotifyListeners: 70,
    updatedAt: '2026-10-04T10:00:00Z',
  },
];

function buildMiVecinoSalarymanPrompt(ep: PodcastEpisode): string {
  return `# Podcast Script Generator — "Mi Vecino Salaryman"

You are the head scriptwriter for the Mexican Spanish podcast **"Mi Vecino Salaryman"** hosted by a Japanese salaryman living in Tokyo.

## Speaker Profile
- **Identity**: 40-year-old Japanese salaryman in Tokyo. Catchphrase: *"Más japonés que el sushi, pero con corazón mexicano."*
- **Family**: Father of a 7-year-old son (do NOT mention his real name or identifying personal details — refer to him naturally as "mi hijo").
- **Spanish Level**: DELE B1 (conversational, warm, friendly Mexican Spanish — natural expressions like *¡Qué onda!, ¡Qué padre!, chamba, recargar pilas, ni modo*, easy to speak aloud).
- **Interests**: Tennis, Formula 1, Atlético de Madrid, long-term asset building, technology, Japanese culture & work life.
- **Strict Privacy Rules**: Never include real company names, client names, real names of colleagues/family, exact addresses, or confidential numbers. Keep everything relatable and anonymized.

## Source Weekly Thoughts / Memo
- **Working Title / Theme**: ${ep.title}${ep.theme ? ` (${ep.theme})` : ''}
- **Memo**:
${ep.sourceMemo}

## Required 3-Section Output Format

### Section 1: Video Metadata
- **Título**: Catchy, short Mexican Spanish title (**3 to 5 Spanish words**, plus short Japanese subtitle in parentheses).
- **Descripción del Podcast**: Engaging hook question + 2 short paragraphs summarizing the episode + CTA to subscribe.
- **Hashtags**: Include exactly these 5 hashtags at the end:
  \`#VivirEnJapon #Salaryman #Mexico #VidaEnJapon #AprenderEspanol\`

### Section 2: Subtitle & Audio Alignment Script
- Output **ONLY clean, plain Mexican Spanish text** for forced audio-subtitle alignment (Whisper / DaVinci Resolve).
- **NO** timestamps, **NO** section headers, **NO** speaker labels, **NO** Japanese text, **NO** markdown bolding or bullets.
- Break lines naturally at **10 to 15 words per line** (one clean sentence or clause per line).
- Include the signature intro: *"Bienvenidos a un episodio más de Mi Vecino Salaryman. Soy un salaryman japonés, más japonés que el sushi, pero con corazón mexicano."*

### Section 3: Recording & Practice Guide
- Full timed structure (\`[0:00 - 0:45]\`, \`[0:45 - 2:30]\`, etc., ~5 minutes total).
- Pair each Spanish paragraph with its **natural Japanese translation** and **key Mexican Spanish expressions / pronunciation tips** so I can practice and record smoothly.`;
}

function splitGeminiOutput(raw: string): { meta: string; align: string; guide: string } {
  const s1 = raw.match(/(?:###?\s*Section\s*1|Título\b)[\s\S]*?(?=(?:###?\s*Section\s*2|$))/i);
  const s2 = raw.match(/###?\s*Section\s*2[^\n]*\n([\s\S]*?)(?=(?:###?\s*Section\s*3|$))/i);
  const s3 = raw.match(/###?\s*Section\s*3[^\n]*\n([\s\S]*)$/i);
  if (s2 || s3) {
    return {
      meta: (s1 ? s1[0].replace(/^###?\s*Section\s*1[^\n]*\n?/i, '') : '').trim(),
      align: (s2 ? s2[1] : '').trim(),
      guide: (s3 ? s3[1] : '').trim(),
    };
  }
  return { meta: '', align: raw.trim(), guide: '' };
}

export default function PodcastTab() {
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>(INITIAL_EPISODES);
  const [selectedId, setSelectedId] = useState<string>(INITIAL_EPISODES[0].id);
  const [statusFilter, setStatusFilter] = useState<'ALL' | EpStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDocTab, setActiveDocTab] = useState<'all' | 'meta' | 'align' | 'guide'>('all');
  const [showSmartPaste, setShowSmartPaste] = useState(false);
  const [smartPasteRaw, setSmartPasteRaw] = useState('');
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
        if (Array.isArray(parsed) && parsed.length > 0) {
          setEpisodes(parsed);
          setSelectedId(parsed[0].id);
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
              const list = data.data as PodcastEpisode[];
              setEpisodes(list);
              setSelectedId((cur) => (list.some((e) => e.id === cur) ? cur : list[0].id));
              try {
                localStorage.setItem(PODCAST_KV_KEY, JSON.stringify(list));
              } catch {}
            } else {
              // Check legacy v1 key and merge if any custom CSV items exist
              supabase
                ?.from('lifeplan_kv')
                .select('data')
                .eq('key', LEGACY_KV_KEY)
                .maybeSingle()
                .then(({ data: legacy }) => {
                  if (Array.isArray(legacy?.data) && legacy.data.length > 0) {
                    const migrated: PodcastEpisode[] = (legacy.data as Record<string, unknown>[])
                      .filter((x) => String(x.id || '').startsWith('ep_csv_'))
                      .map((x, idx) => ({
                        id: String(x.id),
                        epNo: 27 + idx,
                        title: String(x.title || 'Untitled'),
                        publishDate: String(x.publishDate || ''),
                        status: 'NOT_STARTED' as EpStatus,
                        season: 'S2',
                        theme: '',
                        reflection: '',
                        summary: '',
                        sourceMemo: String(x.sourceMemo || ''),
                        videoMetadata: '',
                        alignmentScript: String(x.spanishScript || ''),
                        recordingGuide: '',
                        ytViews: Number(x.ytViews || 0),
                        ytWatchMin: Number(x.ytWatchMin || 0),
                        spotifyPlays: Number(x.spotifyPlays || 0),
                        spotifyListeners: Number(x.spotifyListeners || 0),
                        updatedAt: String(x.updatedAt || new Date().toISOString()),
                      }));
                    if (migrated.length > 0) {
                      const merged = [...migrated, ...INITIAL_EPISODES];
                      setEpisodes(merged);
                      setSelectedId(merged[0].id);
                    }
                  }
                });
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
      title: 'Nuevo Episodio (仮タイトル)',
      publishDate: new Date().toISOString().slice(0, 10),
      status: 'NOT_STARTED',
      season: 'S2',
      theme: '',
      reflection: '',
      summary: '',
      sourceMemo: '',
      videoMetadata: '',
      alignmentScript: '',
      recordingGuide: '',
      ytViews: 0,
      ytWatchMin: 0,
      spotifyPlays: 0,
      spotifyListeners: 0,
      updatedAt: new Date().toISOString(),
    };
    persist([newEp, ...episodes]);
    setSelectedId(newEp.id);
    notify('＋ 新しいエピソードを作成しました');
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
        publishDate: new Date().toISOString().slice(0, 10),
        status: 'NOT_STARTED',
        season: 'S2',
        theme: '',
        reflection: '',
        summary: '',
        sourceMemo: memo,
        videoMetadata: '',
        alignmentScript: '',
        recordingGuide: '',
        ytViews: 0,
        ytWatchMin: 0,
        spotifyPlays: 0,
        spotifyListeners: 0,
        updatedAt: new Date().toISOString(),
      });
    });

    if (added.length > 0) {
      const next = [...added, ...episodes];
      persist(next);
      setSelectedId(added[0].id);
      notify(`📥 思考メモCSVから ${added.length}件を取り込みました`);
    }
  };

  const handleAnalyticsPaste = () => {
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
      notify('⚠️ 一致するエピソードが見つかりませんでした（例: Ep26, 150, 500, 100, 70）');
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
    const q = searchQuery.trim().toLowerCase();
    return episodes
      .filter((e) => (statusFilter === 'ALL' ? true : e.status === statusFilter))
      .filter((e) => !q || e.title.toLowerCase().includes(q) || e.theme.toLowerCase().includes(q) || e.sourceMemo.toLowerCase().includes(q))
      .sort((a, b) => (b.publishDate || '').localeCompare(a.publishDate || '') || b.epNo - a.epNo);
  }, [episodes, statusFilter, searchQuery]);

  const selectedEp = episodes.find((e) => e.id === selectedId) || visible[0] || null;

  return (
    <div className="max-w-[1440px] mx-auto space-y-3 text-xs" style={{ color: 'var(--text)' }}>
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

      {/* TOP HEADER & KPI BAR */}
      <div
        className="p-3.5 rounded-lg border space-y-2.5 shadow-sm"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-black flex items-center gap-2">
              <span>📻 Mi Vecino Salaryman</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(217,168,78,0.16)', color: 'var(--zelda-gold)' }}>
                Notion 2ペイン運用ワークスペース
              </span>
            </h1>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Más japonés que el sushi, pero con corazón mexicano — 思考CSV → Gemini 3セクション台本 → YT/Spotify視聴分析
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={createNewEpisode}
              className="px-3 py-1.5 rounded-lg font-black text-xs"
              style={{ background: 'var(--accent)', color: '#1e1a16' }}
            >
              ＋ New Episode
            </button>
            <button
              type="button"
              onClick={() => csvInputRef.current?.click()}
              className="px-2.5 py-1.5 rounded-lg border font-black text-xs"
              style={{ borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)', background: 'rgba(217,168,78,0.12)' }}
            >
              📥 思考CSV取込
            </button>
            <button
              type="button"
              onClick={() => setShowAnalyticsModal(true)}
              className="px-2.5 py-1.5 rounded-lg border font-black text-xs"
              style={{ borderColor: 'var(--zelda-cyan)', color: 'var(--zelda-cyan)', background: 'rgba(106,174,192,0.12)' }}
            >
              📊 YT/Spotify一括貼付
            </button>
            <a
              href="https://studio.youtube.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-1.5 rounded-lg border font-bold text-[11px]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-sub)' }}
            >
              YouTube Studio ↗
            </a>
            <a
              href="https://creators.spotify.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-1.5 rounded-lg border font-bold text-[11px]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-sub)' }}
            >
              Spotify Creators ↗
            </a>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <div className="p-2 rounded-lg border" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>エピソード数</div>
            <div className="text-sm font-black" style={{ color: 'var(--zelda-gold)' }}>
              {episodes.length}本 <span className="text-[10px]">(公開 {totals.published})</span>
            </div>
          </div>
          <div className="p-2 rounded-lg border" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>▶️ YouTube 総再生</div>
            <div className="text-sm font-black" style={{ color: '#f87171' }}>{totals.ytViews.toLocaleString()}回</div>
          </div>
          <div className="p-2 rounded-lg border" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>⏱️ YouTube 総視聴</div>
            <div className="text-sm font-black" style={{ color: 'var(--zelda-gold)' }}>{(totals.ytWatchMin / 60).toFixed(1)}時間</div>
          </div>
          <div className="p-2 rounded-lg border" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>🎧 Spotify 総再生</div>
            <div className="text-sm font-black" style={{ color: 'var(--zelda-zonai)' }}>{totals.spotifyPlays.toLocaleString()}回</div>
          </div>
          <div className="p-2 rounded-lg border" style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>👥 Spotify リスナー</div>
            <div className="text-sm font-black" style={{ color: 'var(--zelda-cyan)' }}>{totals.spotifyListeners.toLocaleString()}人</div>
          </div>
        </div>
      </div>

      {/* 2-PANE NOTION WORKSPACE (LEFT: DATABASE LIST / RIGHT: SELECTED PAGE DETAIL) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        {/* LEFT PANE: EPISODE DATABASE */}
        <div
          className="lg:col-span-5 rounded-lg border overflow-hidden flex flex-col"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="p-2.5 border-b space-y-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-card2)' }}>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="🔍 タイトル・テーマ・メモを検索..."
                className="flex-1 px-2.5 py-1 rounded border text-xs"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {(['ALL', 'NOT_STARTED', 'SCRIPTING', 'RECORDED', 'EDITED', 'PUBLISHED'] as const).map((st) => {
                const active = statusFilter === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className="px-2 py-0.5 rounded border text-[10.5px] font-bold"
                    style={{
                      background: active ? 'var(--accent)' : 'var(--bg-card)',
                      borderColor: active ? 'var(--zelda-gold)' : 'var(--border)',
                      color: active ? '#1e1a16' : 'var(--text-sub)',
                    }}
                  >
                    {st === 'ALL' ? `すべて (${episodes.length})` : STATUS_META[st].label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="divide-y max-h-[74vh] overflow-y-auto" style={{ borderColor: 'var(--border)' }}>
            {visible.map((ep) => {
              const isSel = selectedEp?.id === ep.id;
              return (
                <button
                  key={ep.id}
                  type="button"
                  onClick={() => setSelectedId(ep.id)}
                  className="w-full text-left px-3 py-2.5 transition-colors flex items-start justify-between gap-2"
                  style={{
                    background: isSel ? 'rgba(217,168,78,0.16)' : 'transparent',
                    borderLeft: isSel ? '3px solid var(--zelda-gold)' : '3px solid transparent',
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] font-bold" style={{ color: 'var(--zelda-gold)' }}>
                        #{ep.epNo}
                      </span>
                      <span className="font-black text-xs truncate">{ep.title}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      <span>📅 {ep.publishDate || '未設定'}</span>
                      <span
                        className="px-1.5 py-0.2 rounded font-bold"
                        style={{ background: STATUS_META[ep.status].bg, color: STATUS_META[ep.status].color }}
                      >
                        {STATUS_META[ep.status].label}
                      </span>
                      {(ep.ytViews > 0 || ep.spotifyPlays > 0) && (
                        <span>▶️{ep.ytViews} / 🎧{ep.spotifyPlays}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-[10px] whitespace-nowrap" style={{ color: ep.alignmentScript ? 'var(--zelda-zonai)' : 'var(--text-muted)' }}>
                    {ep.alignmentScript ? '✓ 台本有' : '未作成'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT PANE: NOTION PAGE DETAIL */}
        <div
          className="lg:col-span-7 rounded-lg border p-4 space-y-3.5"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          {selectedEp ? (
            <>
              {/* PAGE TITLE & ACTIONS */}
              <div className="flex items-start justify-between gap-2 border-b pb-2.5" style={{ borderColor: 'var(--border)' }}>
                <input
                  type="text"
                  value={selectedEp.title}
                  onChange={(e) => updateSelected({ title: e.target.value })}
                  className="flex-1 text-lg font-black bg-transparent outline-none"
                  style={{ color: 'var(--text)' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = episodes.filter((x) => x.id !== selectedEp.id);
                    persist(next);
                    setSelectedId(next[0]?.id || '');
                    notify(`🗑️ #${selectedEp.epNo} を削除しました`);
                  }}
                  className="px-2 py-1 rounded border text-[10.5px]"
                  style={{ borderColor: 'var(--f1-soft)', color: 'var(--f1-soft)' }}
                >
                  🗑 削除
                </button>
              </div>

              {/* NOTION PROPERTIES TABLE */}
              <div
                className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 p-3 rounded-lg border text-xs"
                style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center gap-2">
                  <span className="w-20 text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>📅 Date</span>
                  <input
                    type="date"
                    value={selectedEp.publishDate}
                    onChange={(e) => updateSelected({ publishDate: e.target.value })}
                    className="flex-1 px-2 py-1 rounded border text-xs"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-20 text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>🔖 Status</span>
                  <select
                    value={selectedEp.status}
                    onChange={(e) => updateSelected({ status: e.target.value as EpStatus })}
                    className="flex-1 px-2 py-1 rounded border text-xs font-bold"
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
                <div className="flex items-center gap-2">
                  <span className="w-20 text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>🏷️ Season</span>
                  <input
                    type="text"
                    value={selectedEp.season}
                    onChange={(e) => updateSelected({ season: e.target.value })}
                    placeholder="S2"
                    className="flex-1 px-2 py-1 rounded border text-xs"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-20 text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>🎯 Theme</span>
                  <input
                    type="text"
                    value={selectedEp.theme}
                    onChange={(e) => updateSelected({ theme: e.target.value })}
                    placeholder="テーマを入力..."
                    className="flex-1 px-2 py-1 rounded border text-xs"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                  />
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <span className="w-20 text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>📝 概要</span>
                  <input
                    type="text"
                    value={selectedEp.summary}
                    onChange={(e) => updateSelected({ summary: e.target.value })}
                    placeholder="エピソード概要..."
                    className="flex-1 px-2 py-1 rounded border text-xs"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                  />
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <span className="w-20 text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>🪞 振り返り</span>
                  <input
                    type="text"
                    value={selectedEp.reflection}
                    onChange={(e) => updateSelected({ reflection: e.target.value })}
                    placeholder="収録後の振り返り・改善メモ..."
                    className="flex-1 px-2 py-1 rounded border text-xs"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                  />
                </div>

                {/* RESULT (YT / SPOTIFY) */}
                <div className="sm:col-span-2 pt-1.5 border-t grid grid-cols-4 gap-2" style={{ borderColor: 'var(--border)' }}>
                  <div>
                    <label className="block text-[10px]" style={{ color: 'var(--text-muted)' }}>▶️ YT再生</label>
                    <input
                      type="number"
                      value={selectedEp.ytViews}
                      onChange={(e) => updateSelected({ ytViews: Number(e.target.value) || 0 })}
                      className="w-full px-2 py-1 rounded border text-xs font-bold"
                      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px]" style={{ color: 'var(--text-muted)' }}>⏱️ YT視聴(分)</label>
                    <input
                      type="number"
                      value={selectedEp.ytWatchMin}
                      onChange={(e) => updateSelected({ ytWatchMin: Number(e.target.value) || 0 })}
                      className="w-full px-2 py-1 rounded border text-xs font-bold"
                      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px]" style={{ color: 'var(--text-muted)' }}>🎧 SP再生</label>
                    <input
                      type="number"
                      value={selectedEp.spotifyPlays}
                      onChange={(e) => updateSelected({ spotifyPlays: Number(e.target.value) || 0 })}
                      className="w-full px-2 py-1 rounded border text-xs font-bold"
                      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px]" style={{ color: 'var(--text-muted)' }}>👥 SPリスナー</label>
                    <input
                      type="number"
                      value={selectedEp.spotifyListeners}
                      onChange={(e) => updateSelected({ spotifyListeners: Number(e.target.value) || 0 })}
                      className="w-full px-2 py-1 rounded border text-xs font-bold"
                      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                    />
                  </div>
                </div>
              </div>

              {/* SOURCE MEMO + GEMINI PROMPT GENERATOR */}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-black" style={{ color: 'var(--zelda-gold)' }}>
                    💡 元の思考メモ (iPhone CSV / ネタ)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(buildMiVecinoSalarymanPrompt(selectedEp)).catch(() => {});
                        notify('✨ Mi Vecino Salaryman 台本プロンプトをコピーしました！Geminiへ貼り付けてください');
                      }}
                      className="px-3 py-1 rounded font-black text-[11px]"
                      style={{ background: 'var(--accent)', color: '#1e1a16' }}
                    >
                      ✨ Geminiプロンプトをコピー
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSmartPaste((v) => !v)}
                      className="px-2.5 py-1 rounded border font-black text-[11px]"
                      style={{ borderColor: 'var(--zelda-cyan)', color: 'var(--zelda-cyan)' }}
                    >
                      ⚡ Gemini出力を3分割貼付
                    </button>
                  </div>
                </div>
                <textarea
                  rows={3}
                  value={selectedEp.sourceMemo}
                  onChange={(e) => updateSelected({ sourceMemo: e.target.value })}
                  placeholder="今週あったこと・思ったことメモを入力..."
                  className="w-full p-2.5 rounded border text-xs"
                  style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
                />

                {showSmartPaste && (
                  <div className="p-2.5 rounded border space-y-2" style={{ background: 'rgba(106,174,192,0.08)', borderColor: 'var(--zelda-cyan)' }}>
                    <div className="text-[11px] font-bold" style={{ color: 'var(--zelda-cyan)' }}>
                      Geminiが出力した Section 1〜3 を丸ごと貼り付けると自動で3枠に振り分けます
                    </div>
                    <textarea
                      rows={4}
                      value={smartPasteRaw}
                      onChange={(e) => setSmartPasteRaw(e.target.value)}
                      placeholder="Section 1: Video Metadata ... Section 2: Subtitle & Audio Alignment Script ... Section 3: Recording & Practice Guide ..."
                      className="w-full p-2 rounded border text-xs"
                      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowSmartPaste(false)}
                        className="px-2.5 py-1 rounded border text-[11px]"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const { meta, align, guide } = splitGeminiOutput(smartPasteRaw);
                          updateSelected({
                            videoMetadata: meta || selectedEp.videoMetadata,
                            alignmentScript: align || selectedEp.alignmentScript,
                            recordingGuide: guide || selectedEp.recordingGuide,
                            status: selectedEp.status === 'NOT_STARTED' ? 'SCRIPTING' : selectedEp.status,
                          });
                          setSmartPasteRaw('');
                          setShowSmartPaste(false);
                          notify('⚡ Gemini出力を3セクションへ振り分け保存しました！');
                        }}
                        className="px-3 py-1 rounded font-black text-[11px]"
                        style={{ background: 'var(--zelda-cyan)', color: '#1e1a16' }}
                      >
                        振り分けて保存
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 3-SECTION TABS */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                {(
                  [
                    ['all', '📄 3セクションすべて表示'],
                    ['meta', '1️⃣ Video Metadata'],
                    ['align', '2️⃣ Alignment Script'],
                    ['guide', '3️⃣ Recording Guide'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setActiveDocTab(k)}
                    className="px-2.5 py-1 rounded border text-[11px] font-black"
                    style={{
                      background: activeDocTab === k ? 'var(--accent)' : 'var(--bg-card2)',
                      borderColor: activeDocTab === k ? 'var(--zelda-gold)' : 'var(--border)',
                      color: activeDocTab === k ? '#1e1a16' : 'var(--text-sub)',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* SECTION 1: VIDEO METADATA */}
              {(activeDocTab === 'all' || activeDocTab === 'meta') && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black" style={{ color: 'var(--zelda-gold)' }}>
                      1️⃣ Section 1: Video Metadata (Título / Descripción / Hashtags)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(selectedEp.videoMetadata).catch(() => {});
                        notify('📋 Video Metadataをコピーしました');
                      }}
                      className="px-2 py-0.5 rounded border text-[10px] font-bold"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      📋 コピー
                    </button>
                  </div>
                  <textarea
                    rows={activeDocTab === 'meta' ? 12 : 6}
                    value={selectedEp.videoMetadata}
                    onChange={(e) => updateSelected({ videoMetadata: e.target.value })}
                    placeholder="Título / Descripción del Podcast / #VivirEnJapon #Salaryman #Mexico #VidaEnJapon #AprenderEspanol"
                    className="w-full p-2.5 rounded border text-xs leading-relaxed"
                    style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
                  />
                </div>
              )}

              {/* SECTION 2: SUBTITLE & AUDIO ALIGNMENT SCRIPT */}
              {(activeDocTab === 'all' || activeDocTab === 'align') && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black" style={{ color: 'var(--zelda-cyan)' }}>
                      2️⃣ Section 2: Subtitle & Audio Alignment Script (10-15 words/line, Plain ES)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(selectedEp.alignmentScript).catch(() => {});
                        notify('📋 Alignment Scriptをコピーしました');
                      }}
                      className="px-2 py-0.5 rounded border text-[10px] font-bold"
                      style={{ borderColor: 'var(--zelda-cyan)', color: 'var(--zelda-cyan)' }}
                    >
                      📋 字幕用テキストをコピー
                    </button>
                  </div>
                  <textarea
                    rows={activeDocTab === 'align' ? 16 : 9}
                    value={selectedEp.alignmentScript}
                    onChange={(e) => updateSelected({ alignmentScript: e.target.value })}
                    placeholder="¡Qué onda, amigos!&#10;Bienvenidos a un episodio más de Mi Vecino Salaryman..."
                    className="w-full p-2.5 rounded border text-xs font-mono leading-relaxed"
                    style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
                  />
                </div>
              )}

              {/* SECTION 3: RECORDING & PRACTICE GUIDE */}
              {(activeDocTab === 'all' || activeDocTab === 'guide') && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black" style={{ color: 'var(--zelda-zonai)' }}>
                      3️⃣ Section 3: Recording & Practice Guide (タイムライン ＆ 日本語訳)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(selectedEp.recordingGuide).catch(() => {});
                        notify('📋 Recording Guideをコピーしました');
                      }}
                      className="px-2 py-0.5 rounded border text-[10px] font-bold"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      📋 コピー
                    </button>
                  </div>
                  <textarea
                    rows={activeDocTab === 'guide' ? 14 : 6}
                    value={selectedEp.recordingGuide}
                    onChange={(e) => updateSelected({ recordingGuide: e.target.value })}
                    placeholder="[0:00 - 0:45] Intro & Hook ..."
                    className="w-full p-2.5 rounded border text-xs leading-relaxed"
                    style={{ background: 'var(--bg-card2)', borderColor: 'var(--border)' }}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="py-12 text-center" style={{ color: 'var(--text-muted)' }}>
              左のリストからエピソードを選択するか、「＋ New Episode」を作成してください。
            </div>
          )}
        </div>
      </div>

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
              placeholder={"Ep26, 180, 620, 120, 82\nEp25, 140, 480, 95, 62"}
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
