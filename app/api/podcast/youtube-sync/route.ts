import { NextResponse } from 'next/server';

const DEFAULT_CHANNEL_ID = 'UCguJv1epyMcAQAaKhz5Lo2A';

export interface YouTubeVideoStat {
  videoId: string;
  title: string;
  normalizedTitle: string;
  views: number;
  publishedText: string;
}

function parseViewCount(raw: string): number {
  const s = (raw || '').replace(/views?|回視聴|回/gi, '').replace(/,/g, '').trim();
  if (!s || /no/i.test(s)) return 0;
  const m = s.match(/^([\d.]+)\s*([KMB万億])?$/i);
  if (!m) {
    const digits = s.replace(/[^\d]/g, '');
    return digits ? Number(digits) : 0;
  }
  const n = parseFloat(m[1]);
  const unit = (m[2] || '').toUpperCase();
  if (unit === 'K') return Math.round(n * 1_000);
  if (unit === 'M') return Math.round(n * 1_000_000);
  if (unit === 'B') return Math.round(n * 1_000_000_000);
  if (unit === '万') return Math.round(n * 10_000);
  if (unit === '億') return Math.round(n * 100_000_000);
  return Math.round(n);
}

function normalizeTitle(t: string): string {
  return t
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s　・!！?？:：\-―—.,、。「」『』()（）\[\]【】]+/g, '')
    .trim();
}

export async function GET() {
  try {
    const url = `https://www.youtube.com/channel/${DEFAULT_CHANNEL_ID}/videos`;
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `YouTube HTTP ${res.status}` }, { status: 502 });
    }

    const html = await res.text();
    const match = html.match(/var ytInitialData\s*=\s*(\{[\s\S]*?\});<\/script>/);
    if (!match) {
      return NextResponse.json({ ok: false, error: 'YouTube page data not found' }, { status: 502 });
    }

    const data = JSON.parse(match[1]);
    const rawVideos: YouTubeVideoStat[] = [];

    const walk = (obj: unknown) => {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        for (const item of obj) walk(item);
        return;
      }
      const rec = obj as Record<string, unknown>;
      if (rec.lockupViewModel && typeof rec.lockupViewModel === 'object') {
        const lv = rec.lockupViewModel as Record<string, unknown>;
        const videoId = String(lv.contentId || '');
        const meta = (lv.metadata as Record<string, unknown> | undefined)?.lockupMetadataViewModel as
          | Record<string, unknown>
          | undefined;
        const title = String((meta?.title as Record<string, unknown> | undefined)?.content || '');
        const rows =
          ((meta?.metadata as Record<string, unknown> | undefined)?.contentMetadataViewModel as
            | Record<string, unknown>
            | undefined)?.metadataRows;
        const parts: string[] = [];
        if (Array.isArray(rows)) {
          for (const r of rows) {
            const mp = (r as Record<string, unknown>)?.metadataParts;
            if (Array.isArray(mp)) {
              for (const p of mp) {
                const c = String(((p as Record<string, unknown>)?.text as Record<string, unknown> | undefined)?.content || '');
                if (c) parts.push(c);
              }
            }
          }
        }
        if (videoId && title) {
          rawVideos.push({
            videoId,
            title: title.normalize('NFC'),
            normalizedTitle: normalizeTitle(title),
            views: parseViewCount(parts[0] || '0'),
            publishedText: parts[1] || '',
          });
        }
      }
      for (const val of Object.values(rec)) walk(val);
    };

    walk(data);

    // Aggregate duplicate-title uploads (sum views, keep top-view videoId)
    const byTitle = new Map<string, YouTubeVideoStat>();
    for (const v of rawVideos) {
      const prev = byTitle.get(v.normalizedTitle);
      if (!prev) {
        byTitle.set(v.normalizedTitle, { ...v });
      } else {
        const bestId = v.views > prev.views ? v.videoId : prev.videoId;
        byTitle.set(v.normalizedTitle, {
          ...prev,
          videoId: bestId,
          views: prev.views + v.views,
        });
      }
    }

    const videos = Array.from(byTitle.values());
    const totalViews = videos.reduce((sum, v) => sum + v.views, 0);

    return NextResponse.json({
      ok: true,
      channelId: DEFAULT_CHANNEL_ID,
      fetchedAt: new Date().toISOString(),
      rawCount: rawVideos.length,
      videoCount: videos.length,
      totalViews,
      videos,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
