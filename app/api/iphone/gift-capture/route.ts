import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const KV_KEY = 'agy_iphone_gifts_v1';

export interface CapturedGiftItem {
  id: string;
  title: string;
  recipients: string;
  price: number;
  url: string;
  image_url: string;
  capturedAt: string;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPriceFromHtml(html: string): number {
  // 1. JSON-LD offers.price / lowPrice
  const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of jsonLdMatches) {
    const m = block.match(/"(?:price|lowPrice)"\s*:\s*"?([0-9,]+(?:\.\d+)?)"?/i);
    if (m) {
      const val = Math.round(Number(m[1].replace(/,/g, '')));
      if (val >= 100 && val <= 10_000_000) return val;
    }
  }
  // 2. Meta tags: product:price:amount / og:price:amount
  const metaPrice = html.match(
    /<meta[^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount|twitter:data1)["'][^>]+content=["']([^"']+)["']/i
  );
  if (metaPrice) {
    const val = Number(metaPrice[1].replace(/[^\d]/g, ''));
    if (val >= 100 && val <= 10_000_000) return val;
  }
  // 3. Amazon price span / a-price-whole
  const amzWhole = html.match(/class=["']a-price-whole["'][^>]*>([0-9,]+)/i);
  if (amzWhole) {
    const val = Number(amzWhole[1].replace(/,/g, ''));
    if (val >= 100 && val <= 10_000_000) return val;
  }
  // 4. Generic yen price in visible HTML
  const yenMatch = html.match(/[¥￥]\s*([0-9]{1,3}(?:,[0-9]{3})+)|([0-9]{1,3}(?:,[0-9]{3})+)\s*円/);
  if (yenMatch) {
    const val = Number((yenMatch[1] || yenMatch[2] || '0').replace(/,/g, ''));
    if (val >= 100 && val <= 10_000_000) return val;
  }
  return 0;
}

async function fetchPageMetadata(rawUrl: string): Promise<{ title: string; price: number; image_url: string; finalUrl: string }> {
  let finalUrl = rawUrl;
  let title = '';
  let price = 0;
  let image_url = '';

  try {
    const res = await fetch(rawUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(8000),
    });
    finalUrl = res.url || rawUrl;
    const html = await res.text();

    const ogTitle =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1] ||
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
      '';
    title = decodeHtmlEntities(ogTitle)
      .replace(/^Amazon(?:\.co\.jp)?\s*[:：|｜]\s*/i, '')
      .replace(/\s*[:：|｜]\s*Amazon\.co\.jp.*$/i, '')
      .slice(0, 120);

    const ogImg =
      html.match(/"hiRes"\s*:\s*"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/i)?.[1] ||
      html.match(/"large"\s*:\s*"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/i)?.[1] ||
      html.match(/data-old-hires="(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/i)?.[1] ||
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1] ||
      '';
    image_url = ogImg.trim();

    price = extractPriceFromHtml(html);
  } catch {
    // Fallback if target site blocks server-side fetch
  }

  // Amazon ASIN cover fallback
  const asinMatch = finalUrl.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  if (asinMatch && !image_url) {
    image_url = `https://images-na.ssl-images-amazon.com/images/P/${asinMatch[1]}.09.LZZZZZZZ.jpg`;
  }

  if (!title) {
    try {
      title = new URL(finalUrl).hostname.replace(/^www\./, '');
    } catch {
      title = rawUrl.slice(0, 60);
    }
  }

  return { title, price, image_url, finalUrl };
}

export async function GET() {
  if (!supabase) return NextResponse.json({ ok: false, gifts: [] });
  const { data } = await supabase.from('lifeplan_kv').select('data').eq('key', KV_KEY).maybeSingle();
  const gifts = Array.isArray(data?.data) ? (data.data as CapturedGiftItem[]) : [];
  return NextResponse.json({ ok: true, gifts });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawInput = String(body.url || body.text || '').trim();
    const urlMatch = rawInput.match(/https?:\/\/\S+/);
    const url = urlMatch ? urlMatch[0] : rawInput;
    if (!url) {
      return NextResponse.json({ ok: false, error: 'url is required' }, { status: 400 });
    }

    const recipientsRaw = String(body.target || body.recipients || body.who || 'myself').trim();
    const recipients = recipientsRaw || 'myself';
    const manualPrice = Number(String(body.price || '0').replace(/[^\d]/g, '')) || 0;
    const manualTitle = String(body.title || '').trim();

    const meta = await fetchPageMetadata(url);
    const item: CapturedGiftItem = {
      id: `gift_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: manualTitle || meta.title,
      recipients,
      price: manualPrice || meta.price,
      url: meta.finalUrl || url,
      image_url: meta.image_url,
      capturedAt: new Date().toISOString(),
    };

    if (supabase) {
      const { data } = await supabase.from('lifeplan_kv').select('data').eq('key', KV_KEY).maybeSingle();
      const existing: CapturedGiftItem[] = Array.isArray(data?.data) ? (data.data as CapturedGiftItem[]) : [];
      const cleanUrl = item.url.split('?')[0].replace(/\/$/, '');
      const next = [item, ...existing.filter((g) => g.url.split('?')[0].replace(/\/$/, '') !== cleanUrl)].slice(0, 300);

      await supabase.from('lifeplan_kv').upsert({
        key: KV_KEY,
        data: next,
        updated_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      ok: true,
      gift: item,
      message: `🎁 ${item.title.slice(0, 28)} (${item.price > 0 ? `¥${item.price.toLocaleString()}` : '価格未取得'}) を登録しました！`,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
