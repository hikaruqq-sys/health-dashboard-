import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const BOOKS_QUEUE_KEY = 'agy_unread_books_queue_v1';

export interface CapturedBook {
  id: string;
  title: string;
  author: string;
  image_url: string;
  amazon_url: string;
  asin: string;
  price?: number;
  status: 'UNREAD' | 'SYNCED';
  capturedAt: string;
}

function extractAmazonUrl(input: string): string {
  const match = input.match(/https?:\/\/(?:www\.amazon\.co\.jp|amazon\.co\.jp|amzn\.asia|amzn\.to)[^\s"'<>]+/i);
  return match ? match[0] : '';
}

function extractAsin(url: string): string {
  const m = url.match(/(?:\/dp\/|\/gp\/product\/|\/ASIN\/)([A-Z0-9]{10})/i);
  return m ? m[1].toUpperCase() : '';
}

function isIsbn10(asin: string): boolean {
  return /^[0-9]{9}[0-9X]$/.test(asin);
}

async function fetchOpenBd(isbn: string): Promise<{ title?: string; author?: string; image_url?: string }> {
  try {
    const res = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`, { next: { revalidate: 0 } });
    if (!res.ok) return {};
    const json = await res.json();
    const item = Array.isArray(json) ? json[0] : null;
    if (!item || !item.summary) return {};
    return {
      title: item.summary.title || undefined,
      author: item.summary.author || undefined,
      image_url: item.summary.cover || undefined,
    };
  } catch {
    return {};
  }
}

async function fetchGoogleBooks(isbn: string): Promise<{ title?: string; author?: string; image_url?: string }> {
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`, { next: { revalidate: 0 } });
    if (!res.ok) return {};
    const json = await res.json();
    const vol = json?.items?.[0]?.volumeInfo;
    if (!vol) return {};
    const thumb = vol.imageLinks?.thumbnail || vol.imageLinks?.smallThumbnail || '';
    return {
      title: vol.title || undefined,
      author: Array.isArray(vol.authors) ? vol.authors.join(', ') : undefined,
      image_url: thumb ? thumb.replace(/^http:\/\//, 'https://') : undefined,
    };
  } catch {
    return {};
  }
}

async function resolveAmazonPage(rawUrl: string): Promise<{
  finalUrl: string;
  asin: string;
  title?: string;
  author?: string;
  image_url?: string;
}> {
  let finalUrl = rawUrl;
  let asin = extractAsin(rawUrl);
  let title: string | undefined;
  let author: string | undefined;
  let image_url: string | undefined;

  try {
    const res = await fetch(rawUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
        'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8',
      },
    });
    if (res.url) {
      finalUrl = res.url;
      asin = extractAsin(finalUrl) || asin;
    }
    const html = await res.text();
    const ogTitle =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<title>([^<]+)<\/title>/i)?.[1];
    if (ogTitle) {
      const cleaned = ogTitle
        .replace(/^Amazon\.co\.jp:\s*/i, '')
        .replace(/\s*:\s*本\s*$/i, '')
        .replace(/\s*-\s*Amazon\.co\.jp.*$/i, '')
        .trim();
      if (cleaned && !cleaned.includes('Amazon.co.jp') && !cleaned.includes('Robot Check')) {
        title = cleaned;
      }
    }
    const ogImg =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/"hiRes"\s*:\s*"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/i)?.[1] ||
      html.match(/"large"\s*:\s*"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/i)?.[1];
    if (ogImg) image_url = ogImg;

    const bylineMatch = html.match(/id=["']bylineInfo["'][^>]*>[\s\S]{0,400}?<a[^>]*>([^<]+)<\/a>/i)?.[1];
    if (bylineMatch) author = bylineMatch.trim();
  } catch {
    // ignore fetch failures
  }

  return { finalUrl, asin, title, author, image_url };
}

export async function GET() {
  if (!supabase) return NextResponse.json({ ok: false, books: [] });
  const { data } = await supabase
    .from('lifeplan_kv')
    .select('data')
    .eq('key', BOOKS_QUEUE_KEY)
    .maybeSingle();
  const books = Array.isArray(data?.data) ? (data.data as CapturedBook[]) : [];
  return NextResponse.json({ ok: true, books });
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let rawUrl = '';
    let manualTitle = '';
    let manualAuthor = '';
    let manualImage = '';
    let price = 0;

    if (contentType.includes('application/json')) {
      const body = await req.json();
      rawUrl = String(body.url || body.text || '');
      manualTitle = String(body.title || '').trim();
      manualAuthor = String(body.author || '').trim();
      manualImage = String(body.image_url || '').trim();
      price = Number(body.price || 0) || 0;
    } else {
      const text = await req.text();
      rawUrl = text;
    }

    const amazonUrl = extractAmazonUrl(rawUrl) || rawUrl.trim();
    let asin = extractAsin(amazonUrl);
    let title = manualTitle;
    let author = manualAuthor;
    let image_url = manualImage;
    let finalUrl = amazonUrl;

    if (amazonUrl.startsWith('http')) {
      const pageMeta = await resolveAmazonPage(amazonUrl);
      finalUrl = pageMeta.finalUrl || amazonUrl;
      asin = pageMeta.asin || asin;
      if (!title && pageMeta.title) title = pageMeta.title;
      if (!author && pageMeta.author) author = pageMeta.author;
      if (!image_url && pageMeta.image_url) image_url = pageMeta.image_url;
    }

    if (asin && isIsbn10(asin)) {
      const obd = await fetchOpenBd(asin);
      if (!title && obd.title) title = obd.title;
      if (!author && obd.author) author = obd.author;
      if (!image_url && obd.image_url) image_url = obd.image_url;

      if (!title || !author || !image_url) {
        const gb = await fetchGoogleBooks(asin);
        if (!title && gb.title) title = gb.title;
        if (!author && gb.author) author = gb.author;
        if (!image_url && gb.image_url) image_url = gb.image_url;
      }
    }

    if (!title) {
      title = asin ? `Amazon書籍 (${asin})` : 'Amazonから追加した本';
    }
    if (!image_url && asin) {
      image_url = `https://images-na.ssl-images-amazon.com/images/P/${asin}.09.LZZZZZZZ.jpg`;
    }

    const newBook: CapturedBook = {
      id: `book_${Date.now()}`,
      title,
      author: author || '著者未取得',
      image_url,
      amazon_url: finalUrl,
      asin,
      price,
      status: 'UNREAD',
      capturedAt: new Date().toISOString(),
    };

    if (supabase) {
      const { data } = await supabase
        .from('lifeplan_kv')
        .select('data')
        .eq('key', BOOKS_QUEUE_KEY)
        .maybeSingle();
      const existing: CapturedBook[] = Array.isArray(data?.data) ? (data.data as CapturedBook[]) : [];
      const filtered = existing.filter(
        (b) => !(asin && b.asin === asin) && b.title !== newBook.title
      );
      const next = [newBook, ...filtered];
      await supabase.from('lifeplan_kv').upsert({
        key: BOOKS_QUEUE_KEY,
        data: next,
        updated_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({ ok: true, book: newBook });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!supabase) return NextResponse.json({ ok: false });
  const id = req.nextUrl.searchParams.get('id');
  const { data } = await supabase
    .from('lifeplan_kv')
    .select('data')
    .eq('key', BOOKS_QUEUE_KEY)
    .maybeSingle();
  const existing: CapturedBook[] = Array.isArray(data?.data) ? (data.data as CapturedBook[]) : [];
  const next = id ? existing.filter((b) => b.id !== id) : [];
  await supabase.from('lifeplan_kv').upsert({
    key: BOOKS_QUEUE_KEY,
    data: next,
    updated_at: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true, books: next });
}
