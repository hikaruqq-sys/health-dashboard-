import { NextRequest, NextResponse } from 'next/server';
import { isExcludedLifeExpense, guessCategoryAndValue, guessSeasonAndClothingCategory } from '@/lib/inventory';

export interface ClassifiedItem {
  id: string;
  date: string;          // YYYY-MM-DD
  store: string;
  name: string;
  amount: number;
  category: 'book' | 'clothes' | 'gadget';
  valueTag: 'well-being' | 'ownership' | 'none';
  author?: string;
  publishedDate?: string;
  clothingCategory?: 'tops' | 'bottoms' | 'outer' | 'shoes' | 'bag' | 'sports_inner';
  season?: 'all' | 'summer' | 'winter' | 'spring_autumn';
  selected?: boolean;
}

const CANDIDATE_MODELS = [
  'gemini-flash-latest',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-flash-lite-latest',
];

export async function POST(req: NextRequest) {
  try {
    const { csvText } = await req.json();
    if (!csvText || typeof csvText !== 'string') {
      return NextResponse.json({ error: 'CSVテキストが提供されていません。' }, { status: 400 });
    }

    const rawLines = csvText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('日付') && !l.startsWith('Date'));

    if (rawLines.length === 0) {
      return NextResponse.json({ ok: true, items: [], skippedCount: 0 });
    }

    // 1. スーパー・コンビニ・外食・飲食・日用品の明らかな生活費を事前高速スキップ
    const candidateLines: string[] = [];
    let preSkippedCount = 0;

    for (const line of rawLines) {
      const parts = line.split(',').map((p) => p.trim());
      if (parts.length >= 3) {
        const store = parts[1] || '';
        const name = parts[2] || '';
        if (isExcludedLifeExpense(name, store)) {
          preSkippedCount++;
          continue;
        }
      }
      candidateLines.push(line);
    }

    if (candidateLines.length === 0) {
      return NextResponse.json({
        ok: true,
        items: [],
        totalInputLines: rawLines.length,
        classifiedCount: 0,
        skippedCount: preSkippedCount,
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    // 2. Gemini API での分類（フォールバック対応）
    let parsedItems: any[] | null = null;
    let lastErrorMsg = '';

    if (apiKey) {
      const prompt = `あなたは家計簿・購買ログの専門仕分けAIです。
以下の購買明細CSVから、食費・スーパー・コンビニ・外食・日用消耗品（飲料、水、弁当、食品、調味料、お菓子、洗剤、ラップ、日用品、ゴミ袋、切符、交通費、ギフトカードチャージなど）をすべて除外してください。
残ったもののうち、以下の3つのカテゴリ（洋服、読書、家電・ギア）に該当するものだけを抽出・分類し、JSON配列のみを出力してください。

【対象カテゴリ】
1. 'book' (読書記録): 本、書籍、文庫、新書、単行本、ビジネス書、小説、専門書、雑誌、漫画、ガイドブック
   ※書籍の場合、Web・出版知識から「著者名(author)」および「発行年月(publishedDate: 例 '2021-12')」を推測・補完してください。書籍タイトルもメルカリ等の出品文言（【美品】や定価等）を取り除き、正式なタイトルにきれいに整えてください。
2. 'clothes' (洋服): 服、シャツ、Tシャツ、スーツ、ジャケット、パンツ、ルームウェア、インナー、靴下、靴、バッグ、帽子
   ※種別(clothingCategory: 'tops' | 'bottoms' | 'outer' | 'shoes' | 'bag' | 'sports_inner')およびシーズン(season: 'all' | 'summer' | 'winter' | 'spring_autumn')を判定してください。
3. 'gadget' (家電・ギア): カメラ、PC周辺機器(USBハブ、キーボード、マウス、レシーバー等)、時計、目覚まし時計、高圧洗浄機、家電、電子機器、工具、キャンプ・アウトドアギア
   ※品名も出品文言（【1回のみ使用】等）を取り除き、商品名にきれいに整えてください。

【人生価値タグ(valueTag)】
- 'well-being': 健康、運動、リラクゼーション、教養、読書、自己成長、家族
- 'ownership': こだわりの道具、PC周辺機器、一生モノ、長く愛用するギア・服
- 'none': その他・未分類

【出力形式】
必ず以下のJSON配列のみを出力してください（Markdownコードブロックで囲んでも可）:
[
  {
    "date": "YYYY-MM-DD",
    "store": "店舗名",
    "name": "整理された品名",
    "amount": 数値,
    "category": "book" | "clothes" | "gadget",
    "valueTag": "well-being" | "ownership" | "none",
    "author": "著者名(bookのみ、不明ならnull)",
    "publishedDate": "発行年月(bookのみ、例 '2021-12'、不明ならnull)",
    "clothingCategory": "tops" | "bottoms" | "outer" | "shoes" | "bag" | "sports_inner" (clothesのみ),
    "season": "all" | "summer" | "winter" | "spring_autumn" (clothesのみ)
  }
]

【入力CSVデータ】
${candidateLines.join('\n')}
`;

      // 複数モデルでの順次フォールバック（高負荷エラー503/429を自動回避）
      for (const model of CANDIDATE_MODELS) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                  responseMimeType: 'application/json',
                },
              }),
            }
          );

          const json = await res.json();
          if (res.ok && !json.error) {
            const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
            if (rawText) {
              const cleanJsonText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
              try {
                parsedItems = JSON.parse(cleanJsonText);
                break; // 成功したのでループ終了
              } catch {
                const match = cleanJsonText.match(/\[[\s\S]*\]/);
                if (match) {
                  parsedItems = JSON.parse(match[0]);
                  break;
                }
              }
            }
          } else {
            lastErrorMsg = json.error?.message || `Model ${model} failed`;
            console.warn(`Model ${model} returned error:`, json.error);
          }
        } catch (e: any) {
          lastErrorMsg = e.message;
          console.warn(`Model ${model} fetch exception:`, e.message);
        }
      }
    }

    // 3. AIが全モデル高負荷またはAPIキーなしの場合は、ルールベースの安全フォールバック
    if (!parsedItems || !Array.isArray(parsedItems)) {
      console.warn('Falling back to rule-based classification due to Gemini high-demand:', lastErrorMsg);
      parsedItems = candidateLines
        .map((line) => {
          const parts = line.split(',').map((p) => p.trim());
          if (parts.length < 3) return null;
          const [d, store, name, amt] = parts;
          const { category, valueTag } = guessCategoryAndValue(name, store);
          const { season, clothingCategory } = guessSeasonAndClothingCategory(name);
          const amount = parseInt(amt || '0', 10) || 0;
          return {
            date: d.replace(/\//g, '-'),
            store,
            name,
            amount,
            category,
            valueTag,
            season,
            clothingCategory,
            author: null,
            publishedDate: null,
          };
        })
        .filter(Boolean);
    }

    const items: ClassifiedItem[] = parsedItems.map((it, idx) => {
      let normDate = it.date ? String(it.date).replace(/\//g, '-') : new Date().toISOString().slice(0, 10);
      if (normDate.split('-').length === 3) {
        const parts = normDate.split('-');
        normDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }

      return {
        id: `gen-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        date: normDate,
        store: it.store ? String(it.store).trim() : 'Amazon',
        name: it.name ? String(it.name).trim() : 'アイテム',
        amount: typeof it.amount === 'number' ? Math.abs(it.amount) : parseInt(String(it.amount || 0), 10) || 0,
        category: (['book', 'clothes', 'gadget'].includes(it.category) ? it.category : 'gadget') as any,
        valueTag: (['well-being', 'ownership', 'none'].includes(it.valueTag) ? it.valueTag : 'none') as any,
        author: it.author ? String(it.author).trim() : undefined,
        publishedDate: it.publishedDate ? String(it.publishedDate).trim() : undefined,
        clothingCategory: it.clothingCategory || undefined,
        season: it.season || undefined,
        selected: true,
      };
    });

    const skippedCount = Math.max(0, rawLines.length - items.length);

    return NextResponse.json({
      ok: true,
      items,
      totalInputLines: rawLines.length,
      classifiedCount: items.length,
      skippedCount,
    });
  } catch (e: any) {
    console.error('Classification error:', e);
    return NextResponse.json({ error: e.message || '仕分け処理中にエラーが発生しました。' }, { status: 500 });
  }
}
