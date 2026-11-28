import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const CALENDAR_KEY = 'agy_hub_calendar_v1';
const PURCHASES_KEY = 'agy_email_purchases_v1';

export interface HubCalendarTask {
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

export interface EmailPurchaseItem {
  id: string;
  date: string;
  store: string;
  itemName: string;
  amount: number;
  pointsUsed?: number;
  netAmount?: number;
  isBook?: boolean;
  syncedToLifelog: boolean;
  capturedAt: string;
}

function parseRakutenIrEmail(subject: string, body: string): HubCalendarTask[] {
  const results: HubCalendarTask[] = [];
  // Matches: 武田薬品(4502):2026/10/29 or サイバーエージェント(4751):2026/11/11
  const regex = /([^\n\r:：()（）]+)\((\d{4})\)\s*[:：]\s*(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(body)) !== null) {
    const company = m[1].trim();
    const code = m[2].trim();
    const yyyy = m[3];
    const mm = m[4].padStart(2, '0');
    const dd = m[5].padStart(2, '0');
    const isoDate = `${yyyy}-${mm}-${dd}`;
    results.push({
      id: `ir_${code}_${isoDate}`,
      date: isoDate,
      icon: '🏢',
      label: `決算: ${company}(${code})`,
      targetApp: 'Money: Stocks',
      kvKey: `ir_${code}_${yyyy}${mm}`,
      category: 'ir',
      done: false,
      note: `楽天証券メールより自動登録 (${subject})`,
    });
  }
  return results;
}

function parseShoppingEmail(subject: string, from: string, body: string): EmailPurchaseItem | null {
  const text = `${subject}\n${body}`;
  // Store detection
  let store = 'ネット購入';
  if (/amazon/i.test(from) || /amazon/i.test(subject)) store = 'Amazon';
  else if (/mercari|メルカリ/i.test(from) || /メルカリ/i.test(subject)) store = 'メルカリ';
  else if (/jal/i.test(from) || /JALショッピング/i.test(subject)) store = 'JALショッピング';
  else if (/rakuten|楽天/i.test(from) || /楽天/i.test(subject)) store = '楽天市場';
  else {
    const bracketMatch = subject.match(/【([^】]+)】/);
    if (bracketMatch) store = bracketMatch[1].slice(0, 20);
  }

  // Date detection: 2026年11月25日 or 2026/11/25
  let dateStr = new Date().toISOString().slice(0, 10);
  const jpDate = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  const slashDate = text.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (jpDate) {
    dateStr = `${jpDate[1]}-${jpDate[2].padStart(2, '0')}-${jpDate[3].padStart(2, '0')}`;
  } else if (slashDate) {
    dateStr = `${slashDate[1]}-${slashDate[2].padStart(2, '0')}-${slashDate[3].padStart(2, '0')}`;
  }

  // Item name detection
  let itemName = '';
  const numberedItem = body.match(/(?:^|\n)\s*1[\.．]\s*([^\n\r]+)/);
  const productLine = body.match(/(?:商品名|商品)\s*[:：]\s*([^\n\r]+)/);
  if (numberedItem) itemName = numberedItem[1].trim();
  else if (productLine) itemName = productLine[1].trim();
  else itemName = subject.replace(/【[^】]+】/g, '').replace(/ご注文ありがとう.*/g, '').trim() || `${store}購入品`;

  // Price detection
  const totalMatch = body.match(/(?:商品金額合計|小計|価格|合計金額|合計)\s*[:：]\s*[¥￥]?\s*([0-9,]+)\s*円?/);
  const netMatch = body.match(/(?:注文金額合計|お支払い合計|請求金額|決済金額)\s*[:：]\s*[¥￥]?\s*([0-9,]+)\s*円?/);
  const pointMatch = body.match(/(?:ポイント使用|ポイント利用)[^\d]*([0-9,]+)/);

  const amount = totalMatch ? Number(totalMatch[1].replace(/,/g, '')) : netMatch ? Number(netMatch[1].replace(/,/g, '')) : 0;
  const netAmount = netMatch ? Number(netMatch[1].replace(/,/g, '')) : amount;
  const pointsUsed = pointMatch ? Number(pointMatch[1].replace(/,/g, '')) : 0;

  if (!itemName && amount === 0) return null;

  const isBook = /文庫|新書|単行本|書籍|教本|入門|ガイドブック|kindle|小説|コミック|漫画|マンガ|出版|ビジネス書|技術書|全巻|ハードカバー|ペーパーバック|絵本|事典|辞典/i.test(
    `${itemName} ${subject} ${body.slice(0, 600)}`
  );

  return {
    id: `mail_buy_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    date: dateStr,
    store,
    itemName: itemName.slice(0, 80),
    amount,
    pointsUsed,
    netAmount,
    isBook,
    syncedToLifelog: false,
    capturedAt: new Date().toISOString(),
  };
}

export async function GET() {
  if (!supabase) return NextResponse.json({ ok: false, purchases: [] });
  const { data } = await supabase
    .from('lifeplan_kv')
    .select('data')
    .eq('key', PURCHASES_KEY)
    .maybeSingle();
  const purchases = Array.isArray(data?.data) ? (data.data as EmailPurchaseItem[]) : [];
  return NextResponse.json({ ok: true, purchases });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const subject = String(body.subject || '');
    const from = String(body.from || '');
    const text = String(body.body || body.text || '');
    const mode = String(body.mode || 'auto'); // 'auto' | 'ir' | 'purchase'

    if (!supabase) {
      return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
    }

    const isIr =
      mode === 'ir' ||
      (mode === 'auto' &&
        (/決算発表|決算カレンダー|rakuten-sec/i.test(`${subject} ${from} ${text}`) ||
          /\(\d{4}\)\s*[:：]\s*\d{4}\/\d{1,2}\/\d{1,2}/.test(text)));

    if (isIr) {
      const irTasks = parseRakutenIrEmail(subject, text);
      if (irTasks.length === 0) {
        return NextResponse.json({ ok: false, error: '決算予定日が見つかりませんでした' }, { status: 400 });
      }
      const { data } = await supabase
        .from('lifeplan_kv')
        .select('data')
        .eq('key', CALENDAR_KEY)
        .maybeSingle();
      const existing: HubCalendarTask[] = Array.isArray(data?.data) ? (data.data as HubCalendarTask[]) : [];
      const existingIds = new Set(existing.map((t) => t.id));
      const added = irTasks.filter((t) => !existingIds.has(t.id));
      const next = [...existing, ...added];

      await supabase.from('lifeplan_kv').upsert({
        key: CALENDAR_KEY,
        data: next,
        updated_at: new Date().toISOString(),
      });

      return NextResponse.json({ ok: true, type: 'ir', addedCount: added.length, items: irTasks });
    }

    // Purchase email
    const purchase = parseShoppingEmail(subject, from, text);
    if (!purchase) {
      return NextResponse.json({ ok: false, error: '購入明細を抽出できませんでした' }, { status: 400 });
    }

    const { data } = await supabase
      .from('lifeplan_kv')
      .select('data')
      .eq('key', PURCHASES_KEY)
      .maybeSingle();
    const existing: EmailPurchaseItem[] = Array.isArray(data?.data) ? (data.data as EmailPurchaseItem[]) : [];
    const next = [purchase, ...existing.filter((p) => !(p.date === purchase.date && p.itemName === purchase.itemName))];

    await supabase.from('lifeplan_kv').upsert({
      key: PURCHASES_KEY,
      data: next,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, type: 'purchase', item: purchase, purchases: next });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!supabase) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 });

    const { data } = await supabase
      .from('lifeplan_kv')
      .select('data')
      .eq('key', PURCHASES_KEY)
      .maybeSingle();
    const existing: EmailPurchaseItem[] = Array.isArray(data?.data) ? (data.data as EmailPurchaseItem[]) : [];
    const next = existing.filter((p) => p.id !== id);

    await supabase.from('lifeplan_kv').upsert({
      key: PURCHASES_KEY,
      data: next,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, purchases: next });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
