import { ReceiptItem, ViewingItem, ValueSummary, InventoryCategory, ValueTag, ClothingSeason, ClothingCategory } from '@/types';
export const CLOTHING_SEASONS: { id: ClothingSeason | 'all'; label: string; icon: string }[] = [
  { id: 'all', label: 'すべて', icon: '👔' },
  { id: 'all_season' as any, label: 'オールシーズン', icon: '🔄' },
  { id: 'summer', label: '夏', icon: '☀️' },
  { id: 'winter', label: '冬', icon: '❄️' },
  { id: 'spring_autumn', label: '春秋', icon: '🍂' },
];

export const CLOTHING_CATEGORIES: { id: ClothingCategory | 'all'; label: string; icon: string }[] = [
  { id: 'all', label: 'すべて', icon: '✨' },
  { id: 'tops', label: 'トップス', icon: '👕' },
  { id: 'bottoms', label: 'ボトムス', icon: '👖' },
  { id: 'outer', label: 'アウター', icon: '🧥' },
  { id: 'shoes', label: 'シューズ', icon: '👟' },
  { id: 'bag', label: 'バッグ', icon: '🎒' },
  { id: 'sports_inner', label: 'スポーツ・インナー', icon: '🏃' },
];

import { SEED_RECEIPT_ITEMS, SEED_VIEWING_ITEMS } from '@/data/receiptSeedData';

const RECEIPT_KEY = 'life_receipt_items_v4';
const VIEWING_KEY = 'life_viewing_items_v4';
const USER_OVERRIDES_KEY = 'life_user_overrides_v1';

export const INVENTORY_CATEGORIES: { id: InventoryCategory; label: string; icon: string }[] = [
  { id: 'book', label: '読書記録', icon: '📚' },
  { id: 'clothes', label: '洋服', icon: '👕' },
  { id: 'gadget', label: '家電・ギア', icon: '🔌' },
];

export const VALUE_TAGS: Record<ValueTag, { label: string; color: string; bg: string; icon: string }> = {
  'well-being': { label: 'Well-being', color: '#0ea5e9', bg: '#0ea5e918', icon: '🌿' },
  'ownership': { label: 'Ownership', color: '#10b981', bg: '#10b98118', icon: '🧭' },
  'neutral': { label: '日常維持', color: '#64748b', bg: '#64748b18', icon: '⚖️' },
  'none': { label: 'なし', color: '#94a3b8', bg: '#94a3b818', icon: '⚪' },
};

/** 4段階評価のラベル定義 */
export const RATING_LEVELS: { rating: number; label: string; icon: string }[] = [
  { rating: 4, label: '最高・殿堂入り', icon: '★★★★' },
  { rating: 3, label: '良い・おすすめ', icon: '★★★☆' },
  { rating: 2, label: '普通・及第点', icon: '★★☆☆' },
  { rating: 1, label: '微妙・いまいち', icon: '★☆☆☆' },
];

export interface UserOverride {
  imageUrl?: string;
  rating?: number;
  notes?: string;
  valueTag?: ValueTag;
  season?: ClothingSeason;
  clothingCategory?: ClothingCategory;
  category?: InventoryCategory;
  durationMin?: number;
}

/** ユーザーカスタマイズ（画像・評価・感想など）を取得 */
export function loadUserOverrides(): Record<string, UserOverride> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(USER_OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** 特定アイテムのユーザーカスタマイズを永続保存（コード変更やSEED更新でも絶対に消えない） */
export function saveItemOverride(keyOrId: string, nameOrTitle: string, updates: UserOverride): void {
  if (typeof window === 'undefined') return;
  try {
    const overrides = loadUserOverrides();
    const existing = overrides[keyOrId] || (nameOrTitle ? overrides[nameOrTitle] : undefined) || {};
    const merged = { ...existing, ...updates };
    overrides[keyOrId] = merged;
    if (nameOrTitle && nameOrTitle !== keyOrId) {
      overrides[nameOrTitle] = merged;
    }
    localStorage.setItem(USER_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch (e) {
    console.error('Failed to save user override', e);
  }
}

/** レシートアイテムの読み込み（過去バージョンの引き継ぎ ＆ ユーザー画像の復元） */
export function loadReceiptItems(): ReceiptItem[] {
  if (typeof window === 'undefined') return SEED_RECEIPT_ITEMS;
  try {
    // v4 -> v3 -> v2 -> v1 の順で既存データを検索して引き継ぐ
    let raw = localStorage.getItem(RECEIPT_KEY);
    if (!raw) raw = localStorage.getItem('life_receipt_items_v3');
    if (!raw) raw = localStorage.getItem('life_receipt_items_v2');
    if (!raw) raw = localStorage.getItem('life_receipt_items_v1');

    let baseItems: ReceiptItem[] = SEED_RECEIPT_ITEMS;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        baseItems = parsed;
        // SEEDにしかない新規アイテムがあれば追加マージ
        const existingIds = new Set(baseItems.map((b) => b.id));
        const newSeedItems = SEED_RECEIPT_ITEMS.filter((s) => !existingIds.has(s.id));
        if (newSeedItems.length > 0) {
          baseItems = [...baseItems, ...newSeedItems];
        }
      }
    }

    // ユーザーオーバーライド（ユーザーが設定した画像や感想）を確実に適用
    const overrides = loadUserOverrides();
    const result = baseItems.map((it) => {
      const ov = overrides[it.id] || overrides[it.name];
      if (ov) {
        return {
          ...it,
          ...(ov.imageUrl !== undefined && { imageUrl: ov.imageUrl }),
          ...(ov.rating !== undefined && { rating: ov.rating }),
          ...(ov.notes !== undefined && { notes: ov.notes }),
          ...(ov.valueTag !== undefined && { valueTag: ov.valueTag }),
          ...(ov.season !== undefined && { season: ov.season }),
          ...(ov.clothingCategory !== undefined && { clothingCategory: ov.clothingCategory }),
          ...(ov.category !== undefined && { category: ov.category }),
        };
      }
      return it;
    });

    return result;
  } catch {
    return SEED_RECEIPT_ITEMS;
  }
}

/** レシートアイテムの保存 */
export function saveReceiptItems(items: ReceiptItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(RECEIPT_KEY, JSON.stringify(items));
  } catch (e) {
    console.error('Failed to save receipt items', e);
  }
}

/** 視聴ログの読み込み（過去バージョンの引き継ぎ ＆ ユーザー画像の復元） */
export function loadViewingItems(): ViewingItem[] {
  if (typeof window === 'undefined') return SEED_VIEWING_ITEMS;
  try {
    let raw = localStorage.getItem(VIEWING_KEY);
    if (!raw) raw = localStorage.getItem('life_viewing_items_v3');
    if (!raw) raw = localStorage.getItem('life_viewing_items_v2');
    if (!raw) raw = localStorage.getItem('life_viewing_items_v1');

    let baseItems: ViewingItem[] = SEED_VIEWING_ITEMS;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        baseItems = parsed;
        const existingIds = new Set(baseItems.map((b) => b.id));
        const newSeedItems = SEED_VIEWING_ITEMS.filter((s) => !existingIds.has(s.id));
        if (newSeedItems.length > 0) {
          baseItems = [...baseItems, ...newSeedItems];
        }
      }
    }

    // ユーザーオーバーライドを適用
    const overrides = loadUserOverrides();
    const result = baseItems.map((it) => {
      const ov = overrides[it.id] || overrides[it.title.trim()];
      if (ov) {
        return {
          ...it,
          ...(ov.imageUrl !== undefined && { imageUrl: ov.imageUrl }),
          ...(ov.rating !== undefined && { rating: ov.rating }),
          ...(ov.notes !== undefined && { notes: ov.notes }),
          ...(ov.valueTag !== undefined && { valueTag: ov.valueTag }),
          ...(ov.durationMin !== undefined && { durationMin: ov.durationMin }),
        };
      }
      return it;
    });

    return result;
  } catch {
    return SEED_VIEWING_ITEMS;
  }
}

/** 視聴ログの保存 */
export function saveViewingItems(items: ViewingItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(VIEWING_KEY, JSON.stringify(items));
  } catch (e) {
    console.error('Failed to save viewing items', e);
  }
}


/** 洋服のシーズンとカテゴリを自動推定 */
export function guessSeasonAndClothingCategory(name: string): { season: ClothingSeason; clothingCategory: ClothingCategory } {
  const n = name.toLowerCase();

  // シーズン推定
  let season: ClothingSeason = 'all';
  if (
    n.includes('ダウン') || n.includes('ヒートテック') || n.includes('セーター') || n.includes('メルトン') ||
    n.includes('マフラー') || n.includes('フリース') || n.includes('キルティング') || n.includes('冬')
  ) {
    season = 'winter';
  } else if (
    n.includes('ポロ') || n.includes('ショーツ') || n.includes('タンク') || n.includes('チノショート') ||
    n.includes('ドライex') || n.includes('半袖') || n.includes('夏') || n.includes('涼')
  ) {
    season = 'summer';
  }

  // カテゴリ推定
  let clothingCategory: ClothingCategory = 'tops';
  if (n.includes('バッグ') || n.includes('バックパック') || n.includes('トート') || n.includes('ショルダー')) {
    clothingCategory = 'bag';
    season = 'all';
  } else if (n.includes('スニーカー') || n.includes('シューズ') || n.includes('アドバンコート') || n.includes('tt') || n.includes('gore-tex')) {
    clothingCategory = 'shoes';
    season = 'all';
  } else if (n.includes('パンツ') || n.includes('ショーツ') || n.includes('jerseys') || n.includes('505') || n.includes('ジーンズ') || n.includes('ボトム')) {
    clothingCategory = 'bottoms';
  } else if (n.includes('コート') || n.includes('ジャケット') || n.includes('jkt') || n.includes('ブルゾン') || n.includes('ダウン') || n.includes('アウター')) {
    clothingCategory = 'outer';
  } else if (n.includes('インナー') || n.includes('タンク') || n.includes('プレマッチ') || n.includes('長袖シャツ') || n.includes('スポーツウェア')) {
    clothingCategory = 'sports_inner';
  }

  return { season, clothingCategory };
}

/** 品名・店名から自動カテゴリ＆価値判定を推論（辞書強化版） */
export function guessCategoryAndValue(name: string, store: string): { category: InventoryCategory; valueTag: ValueTag } {
  const n = name.toLowerCase();
  const s = store.toLowerCase();

  // 1. 家電・ガジェット・ギア
  if (
    n.includes('カメラ') || n.includes('insta360') || n.includes('洗浄機') || n.includes('ケルヒャー') ||
    n.includes('usb') || n.includes('レシーバー') || n.includes('ハブ') || n.includes('logi') ||
    n.includes('anker') || n.includes('mac') || n.includes('ipad') || n.includes('pc') ||
    n.includes('バッテリー') || n.includes('充電') || n.includes('イヤホン') || n.includes('ヘッドホン') ||
    n.includes('モニター') || n.includes('マウス') || n.includes('キーボード') || n.includes('時計') ||
    n.includes('ガジェット') || n.includes('高圧洗浄') || n.includes('機材')
  ) {
    return { category: 'gadget', valueTag: 'ownership' };
  }

  // 2. 洋服・衣類・ファッション
  if (
    n.includes('ウェア') || n.includes('シャツ') || n.includes('ポロ') || n.includes('パンツ') ||
    n.includes('ショーツ') || n.includes('スーツ') || n.includes('ブラウス') || n.includes('靴下') ||
    n.includes('インナー') || n.includes('コート') || n.includes('ブルゾン') || n.includes('セーター') ||
    n.includes('スウェット') || n.includes('スニーカー') || n.includes('シューズ') || n.includes('バッグ') ||
    n.includes('マフラー') || n.includes('タンク') || n.includes('ジーンズ') || n.includes('デニム') ||
    n.includes('jkt') || n.includes('ジャケット') || n.includes('感動') || n.includes('ヒートテック') ||
    s.includes('aoki') || s.includes('ユニクロ') || s.includes('uniqlo') || s.includes('gu') ||
    s.includes('オリヒカ') || s.includes('orihica') || s.includes('nike') || s.includes('ナイキ') ||
    s.includes('adidas') || s.includes('puma') || s.includes('asics') || s.includes('edwin') ||
    s.includes('levi') || s.includes('lavenham') || s.includes('samsonite') || s.includes('makavelic')
  ) {
    return { category: 'clothes', valueTag: 'well-being' };
  }

  // 3. 読書・書籍（デフォルト含む）
  const isWb = n.includes('小説') || n.includes('推し') || n.includes('ヘイル') || n.includes('ガイドブック') || n.includes('漫画');
  return { category: 'book', valueTag: isWb ? 'well-being' : 'ownership' };
}

/** レシートCSVのパース (日付,店舗名,商品名,金額) */
export function parseReceiptCSV(csvText: string): ReceiptItem[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const items: ReceiptItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('日付') || line.startsWith('date')) continue;

    const parts = line.split(',').map((p) => p.trim());
    if (parts.length < 4) continue;

    const [dateRaw, store, name, amountRaw] = parts;
    const amount = parseInt(amountRaw.replace(/[^\d-]/g, ''), 10);
    if (isNaN(amount)) continue;

    const date = dateRaw.replace(/\//g, '-');
    const { category, valueTag } = guessCategoryAndValue(name, store);
    const { season, clothingCategory } = guessSeasonAndClothingCategory(name);

    items.push({
      id: `rc-${Date.now()}-${i}`,
      date,
      store,
      name,
      amount,
      category,
      valueTag,
      season: category === 'clothes' ? season : undefined,
      clothingCategory: category === 'clothes' ? clothingCategory : undefined,
      rating: 3,
    });
  }

  return items;
}

export interface MonthlyTrendPoint {
  month: string;           // '02月', '03月' ...
  monthKey: string;        // '2026-02'
  wbAmount: number;
  osAmount: number;
  totalAmount: number;
  wbHours: number;
  osHours: number;
  totalHours: number;
}

/** 月別推移データ（2026年の時系列）の算出 */
export function computeMonthlyTrends(receipts: ReceiptItem[], viewings: ViewingItem[]): MonthlyTrendPoint[] {
  const months = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
  const map: Record<string, { wbAmount: number; osAmount: number; wbMin: number; osMin: number }> = {};

  for (const m of months) {
    map[m] = { wbAmount: 0, osAmount: 0, wbMin: 0, osMin: 0 };
  }

  for (const r of receipts) {
    if (r.deleted) continue;
    if (!r.date || r.date.length < 7) continue;
    const m = r.date.slice(0, 7);
    if (!map[m]) map[m] = { wbAmount: 0, osAmount: 0, wbMin: 0, osMin: 0 };
    if (r.valueTag === 'well-being') map[m].wbAmount += r.amount;
    else if (r.valueTag === 'ownership') map[m].osAmount += r.amount;
  }

  for (const v of viewings) {
    if (v.deleted) continue;
    if (!v.date || v.date.length < 7) continue;
    const m = v.date.slice(0, 7);
    if (!map[m]) map[m] = { wbAmount: 0, osAmount: 0, wbMin: 0, osMin: 0 };
    if (v.valueTag === 'well-being') map[m].wbMin += v.durationMin;
    else if (v.valueTag === 'ownership') map[m].osMin += v.durationMin;
  }

  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, data]) => ({
      monthKey: key,
      month: `${parseInt(key.slice(5), 10)}月`,
      wbAmount: data.wbAmount,
      osAmount: data.osAmount,
      totalAmount: data.wbAmount + data.osAmount,
      wbHours: parseFloat((data.wbMin / 60).toFixed(1)),
      osHours: parseFloat((data.osMin / 60).toFixed(1)),
      totalHours: parseFloat(((data.wbMin + data.osMin) / 60).toFixed(1)),
    }));
}

/** 月別集計（特定月のサマリー用） */
export function computeValueSummaries(receipts: ReceiptItem[], viewings: ViewingItem[]): Record<string, ValueSummary> {
  const map: Record<string, ValueSummary> = {};

  const getOrCreate = (month: string) => {
    if (!map[month]) {
      map[month] = {
        month,
        wbAmount: 0,
        osAmount: 0,
        neutralAmount: 0,
        totalAmount: 0,
        wbMinutes: 0,
        osMinutes: 0,
        totalMinutes: 0,
      };
    }
    return map[month];
  };

  for (const r of receipts) {
    if (r.deleted) continue;
    if (!r.date || r.date.length < 7) continue;
    const month = r.date.slice(0, 7);
    const sum = getOrCreate(month);
    sum.totalAmount += r.amount;
    if (r.valueTag === 'well-being') sum.wbAmount += r.amount;
    else if (r.valueTag === 'ownership') sum.osAmount += r.amount;
    else sum.neutralAmount += r.amount;
  }

  for (const v of viewings) {
    if (v.deleted) continue;
    if (!v.date || v.date.length < 7) continue;
    const month = v.date.slice(0, 7);
    const sum = getOrCreate(month);
    sum.totalMinutes += v.durationMin;
    if (v.valueTag === 'well-being') sum.wbMinutes += v.durationMin;
    else if (v.valueTag === 'ownership') sum.osMinutes += v.durationMin;
  }

  return map;
}


export interface ParsedImportResult {
  receipts: ReceiptItem[];
  viewings: ViewingItem[];
}

/**
 * テキストまたはCSVから、購入アイテム(ReceiptItem)と視聴ログ(ViewingItem)を自動判別してパース
 * 形式1 (購入): 日付,店舗名,商品名,金額
 * 形式2 (視聴): 日付,媒体(Prime Video/Netflix等),作品名,時間(分),価値タグ(任意)
 */
export function parseImportCSV(csvText: string): ParsedImportResult {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const receipts: ReceiptItem[] = [];
  const viewings: ViewingItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('日付') || line.startsWith('date') || line.startsWith('視聴日')) continue;

    const parts = line.split(',').map((p) => p.trim());
    if (parts.length < 3) continue;

    const dateRaw = parts[0];
    const storeOrPlatform = parts[1];
    const nameOrTitle = parts[2];
    const fourth = parts[3] || '0';
    const fifth = parts[4] || '';

    const num = parseInt(fourth.replace(/[^\d-]/g, ''), 10) || 0;
    const date = dateRaw.replace(/\//g, '-');

    const sLower = storeOrPlatform.toLowerCase();
    const isViewing =
      sLower.includes('prime') ||
      sLower.includes('netflix') ||
      sLower.includes('u-next') ||
      sLower.includes('tver') ||
      sLower.includes('dazn') ||
      sLower.includes('nhk') ||
      sLower.includes('video') ||
      fourth.includes('分') ||
      fourth.includes('min');

    if (isViewing) {
      // 視聴アイテムとしてパース
      let tag: ValueTag = 'none';
      if (fifth.includes('Well') || fifth.includes('well')) tag = 'well-being';
      else if (fifth.includes('Owner') || fifth.includes('owner')) tag = 'ownership';

      let cat: ViewingItem['category'] = 'movie';
      const nLower = nameOrTitle.toLowerCase();
      if (nLower.includes('サッカー') || nLower.includes('fc') || nLower.includes('代表') || nLower.includes('モウリーニョ')) cat = 'soccer';
      else if (nLower.includes('アニメ') || nLower.includes('ツガイ') || nLower.includes('三国') || nLower.includes('事変') || nLower.includes('モルカー') || nLower.includes('ドラえもん')) cat = 'anime';
      else if (nLower.includes('ドキュメンタリー') || nLower.includes('ジョコビッチ') || nLower.includes('ラファ')) cat = 'documentary';
      else if (nLower.includes('バチェラー') || nLower.includes('バチェロレッテ') || nLower.includes('最強王')) cat = 'variety';
      else if (nLower.includes('シーズン') || nLower.includes('アンナチュラル') || nLower.includes('miu404') || nLower.includes('新しい王様')) cat = 'drama';

      viewings.push({
        id: `v-imp-${Date.now()}-${i}`,
        date,
        title: nameOrTitle,
        platform: storeOrPlatform.includes('Netflix') ? 'Netflix' : storeOrPlatform.includes('Prime') ? 'Prime Video' : (storeOrPlatform as any),
        durationMin: num > 0 ? num : (cat === 'movie' || cat === 'soccer' ? 100 : 45),
        category: cat,
        valueTag: tag,
        rating: 4,
      });
    } else {
      // 購入アイテムとしてパース
      const { category, valueTag } = guessCategoryAndValue(nameOrTitle, storeOrPlatform);
      const { season, clothingCategory } = guessSeasonAndClothingCategory(nameOrTitle);

      receipts.push({
        id: `rc-imp-${Date.now()}-${i}`,
        date,
        store: storeOrPlatform,
        name: nameOrTitle,
        amount: num,
        category,
        valueTag,
        season: category === 'clothes' ? season : undefined,
        clothingCategory: category === 'clothes' ? clothingCategory : undefined,
        rating: 3,
      });
    }
  }

  return { receipts, viewings };
}
