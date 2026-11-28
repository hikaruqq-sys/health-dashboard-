import { NextResponse } from 'next/server';
import { gunzipSync } from 'zlib';
import { supabase } from '@/lib/supabase';

const BACKUP_KEY = 'kaimono_lifelog_backup_latest';
const IPHONE_GIFTS_KEY = 'agy_iphone_gifts_v1';
const IPHONE_BOOKS_KEY = 'agy_iphone_books_v1';

type Row = Record<string, unknown>;

export async function GET() {
  try {
    if (!supabase) {
      return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
    }

    const [backupRes, iphoneGiftsRes, iphoneBooksRes] = await Promise.all([
      supabase.from('lifeplan_kv').select('data, updated_at').eq('key', BACKUP_KEY).maybeSingle(),
      supabase.from('lifeplan_kv').select('data').eq('key', IPHONE_GIFTS_KEY).maybeSingle(),
      supabase.from('lifeplan_kv').select('data').eq('key', IPHONE_BOOKS_KEY).maybeSingle(),
    ]);

    const doc = backupRes.data?.data as { meta?: { backed_up_at?: string }; payload?: string } | undefined;
    if (!doc?.payload) {
      return NextResponse.json({ ok: false, error: 'クラウドバックアップがまだありません' }, { status: 404 });
    }

    const rawBuf = gunzipSync(Buffer.from(doc.payload, 'base64'));
    const tables = JSON.parse(rawBuf.toString('utf-8')) as Record<string, Row[]>;

    const assets = tables.ASSETS || [];
    const bookLogs = tables.ASSET_BOOK_LOGS || [];
    const bookLogByAsset = new Map<string, Row>();
    for (const bl of bookLogs) {
      bookLogByAsset.set(String(bl.asset_id || ''), bl);
    }

    // Books (merge DB + latest iPhone captured books)
    const dbBooks = assets
      .filter((a) => a.asset_type === 'BOOK' && a.status !== 'DISPOSED')
      .map((a) => {
        const log = bookLogByAsset.get(String(a.asset_id || ''));
        return {
          id: String(a.asset_id || ''),
          title: String(a.asset_name || ''),
          author: String(a.brand_or_author || ''),
          genre: String(a.book_genre || '趣味・その他'),
          status: String(log?.reading_status || 'UNREAD') === 'FINISHED' ? 'FINISHED' : 'UNREAD',
          date: String(log?.finished_date || a.acquired_date || ''),
          image_url: String(a.image_url || ''),
          note: String(log?.takeaways_note || ''),
        };
      });

    const bookTitles = new Set(dbBooks.map((b) => b.title));
    const iphoneBooks = Array.isArray(iphoneBooksRes.data?.data) ? (iphoneBooksRes.data.data as Row[]) : [];
    for (const ib of iphoneBooks) {
      const t = String(ib.title || '').trim();
      if (t && !bookTitles.has(t)) {
        bookTitles.add(t);
        dbBooks.unshift({
          id: String(ib.id || `ib_${t.slice(0, 12)}`),
          title: t,
          author: String(ib.author || ''),
          genre: '趣味・その他',
          status: 'UNREAD',
          date: String(ib.capturedAt || '').slice(0, 10),
          image_url: String(ib.image_url || ''),
          note: 'iPhoneから追加',
        });
      }
    }

    // Gear / Clothes / Bags / Shoes
    const gear = assets
      .filter((a) => a.asset_type !== 'BOOK' && a.status !== 'DISPOSED')
      .map((a) => ({
        id: String(a.asset_id || ''),
        name: String(a.asset_name || ''),
        type: String(a.asset_type || 'APPLIANCE'),
        brand: String(a.brand_or_author || ''),
        season: String(a.season || 'ALL_SEASON'),
        cost: Number(a.acquisition_cost || 0),
        date: String(a.acquired_date || ''),
        image_url: String(a.image_url || ''),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    // Gifts (merge DB + latest iPhone captured gifts, newest first)
    const dbGifts = (tables.GIFT_WISHLIST || []).map((g) => ({
      id: String(g.gift_id || ''),
      title: String(g.title || ''),
      recipients: String(g.recipients || 'myself'),
      price: Number(g.price || 0),
      url: String(g.url || ''),
      image_url: String(g.image_url || ''),
      created_at: String(g.created_at || ''),
    }));
    const giftUrlSet = new Set(dbGifts.map((g) => g.url.split('?')[0].replace(/\/$/, '')).filter(Boolean));
    const iphoneGifts = Array.isArray(iphoneGiftsRes.data?.data) ? (iphoneGiftsRes.data.data as Row[]) : [];
    for (const ig of iphoneGifts) {
      const u = String(ig.url || '').split('?')[0].replace(/\/$/, '');
      if (!u || !giftUrlSet.has(u)) {
        if (u) giftUrlSet.add(u);
        dbGifts.unshift({
          id: String(ig.id || `ig_${Date.now()}`),
          title: String(ig.title || ''),
          recipients: String(ig.recipients || 'myself'),
          price: Number(ig.price || 0),
          url: String(ig.url || ''),
          image_url: String(ig.image_url || ''),
          created_at: String(ig.capturedAt || new Date().toISOString()),
        });
      }
    }
    dbGifts.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

    // Pantry / Recent purchases & staples
    const storeMap = new Map<string, string>();
    for (const s of tables.STORES || []) {
      storeMap.set(String(s.store_id || ''), String(s.canonical_name || ''));
    }
    const receiptMap = new Map<string, { date: string; store: string }>();
    for (const r of tables.RECEIPTS || []) {
      receiptMap.set(String(r.receipt_id || ''), {
        date: String(r.purchase_date || ''),
        store: storeMap.get(String(r.store_id || '')) || '',
      });
    }
    const cpMap = new Map<string, string>();
    for (const cp of tables.CANONICAL_PRODUCTS || []) {
      cpMap.set(String(cp.canonical_product_id || ''), String(cp.canonical_name || ''));
    }

    const normalItems = (tables.PURCHASE_ITEMS || [])
      .filter((pi) => pi.item_type === 'NORMAL')
      .map((pi) => {
        const rec = receiptMap.get(String(pi.receipt_id || ''));
        return {
          date: rec?.date || '',
          store: rec?.store || '',
          name: String(pi.raw_item_name || ''),
          canonicalId: String(pi.canonical_product_id || ''),
          canonicalName: cpMap.get(String(pi.canonical_product_id || '')) || '',
          price: Number(pi.recorded_price || 0),
          unitPrice: Number(pi.unit_price || pi.recorded_price || 0),
          qty: Number(pi.quantity || 1),
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));

    // Staple summary
    const stapleAgg = new Map<
      string,
      { name: string; count: number; totalSpent: number; minPrice: number; cheapestStore: string; latestPrice: number }
    >();
    for (const it of normalItems) {
      if (!it.canonicalName) continue;
      const prev = stapleAgg.get(it.canonicalName);
      if (!prev) {
        stapleAgg.set(it.canonicalName, {
          name: it.canonicalName,
          count: 1,
          totalSpent: it.price,
          minPrice: it.unitPrice,
          cheapestStore: it.store,
          latestPrice: it.unitPrice,
        });
      } else {
        prev.count += 1;
        prev.totalSpent += it.price;
        if (it.unitPrice > 0 && it.unitPrice < prev.minPrice) {
          prev.minPrice = it.unitPrice;
          prev.cheapestStore = it.store;
        }
      }
    }
    const staples = Array.from(stapleAgg.values())
      .filter((s) => s.count >= 2)
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 35);

    const specs = (tables.USER_PROFILE_SPECS || [])
      .map((p) => ({
        id: String(p.spec_id || ''),
        category: String(p.category || ''),
        item_name: String(p.item_name || ''),
        spec_detail: String(p.spec_detail || ''),
        memo: String(p.memo || ''),
        sort_order: Number(p.sort_order || 99),
      }))
      .sort((a, b) => a.sort_order - b.sort_order);

    return NextResponse.json({
      ok: true,
      backedUpAt: doc.meta?.backed_up_at || backupRes.data?.updated_at || null,
      counts: {
        purchases: normalItems.length,
        gear: gear.length,
        books: dbBooks.length,
        gifts: dbGifts.length,
        specs: specs.length,
      },
      staples,
      recentPurchases: normalItems.slice(0, 120),
      gear,
      books: dbBooks,
      gifts: dbGifts,
      specs,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
