import { ReceiptItem, ViewingItem } from '@/types';

export interface MatchResult {
  updatedReceipts: { id: string; name: string; date: string; matchedText: string }[];
  updatedViewings: { id: string; title: string; date: string; matchedText: string }[];
  newViewings: ViewingItem[];
  skippedDuplicates: number;
}

function cleanNoteText(s: string): string {
  return s.replace(/[\[\]\(\)（）\s・、。_–—\-:：]/g, '').toLowerCase();
}

/**
 * 既存の感想メモ（notes）に、すでに同じ内容が登録されているか高精度に判定
 */
function isCommentAlreadyInNotes(existingNotes: string | undefined, logDate: string, content: string): boolean {
  if (!existingNotes) return false;

  // 1. 完全部分一致
  if (existingNotes.includes(content)) return true;

  // 2. 記号・スペースを除去した比較（6文字以上の一致）
  const cleanContent = cleanNoteText(content);
  if (cleanContent.length >= 6) {
    const cleanNotes = cleanNoteText(existingNotes);
    if (cleanNotes.includes(cleanContent)) return true;
  }

  // 3. 同一日付ブロックでの類似比較（同じ日付で先頭部分が一致）
  if (logDate && existingNotes.includes(logDate)) {
    const sample = cleanNoteText(content.slice(0, 15));
    if (sample && cleanNoteText(existingNotes).includes(sample)) {
      return true;
    }
  }

  return false;
}

/**
 * デイリーログ（テキストまたはCSV）を解析し、既存アイテムの感想（notes）に自動紐付け、
 * または未登録の映画・本を新規アイテムとして抽出するエンジン（重複自動排除付き）
 */
export function matchDailyLogToItems(
  dailyLogText: string,
  currentReceipts: ReceiptItem[],
  currentViewings: ViewingItem[]
): {
  nextReceipts: ReceiptItem[];
  nextViewings: ViewingItem[];
  result: MatchResult;
} {
  const lines = dailyLogText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const receiptsMap = new Map(currentReceipts.map((r) => [r.id, { ...r }]));
  const viewingsMap = new Map(currentViewings.map((v) => [v.id, { ...v }]));

  const updatedReceipts: MatchResult['updatedReceipts'] = [];
  const updatedViewings: MatchResult['updatedViewings'] = [];
  const newViewings: ViewingItem[] = [];
  let skippedDuplicates = 0;

  let currentLogDate = '';
  for (const line of lines) {
    // 日付抽出 (YYYY-MM-DD または YYYY/MM/DD)
    const dateMatch = line.match(/^(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
    if (dateMatch) {
      currentLogDate = dateMatch[1].replace(/\//g, '-');
    }
    const logDate = currentLogDate;
    const content = line.replace(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}[,\s\d:]*/, '').trim();
    if (!content) continue;

    // 1. 既存の本・洋服・家電（ReceiptItems）とマッチング
    for (const [id, item] of receiptsMap.entries()) {
      const keywords = getItemKeywords(item.name);
      const isMatched = keywords.some((kw) => content.toLowerCase().includes(kw.toLowerCase()));

      if (isMatched) {
        if (isCommentAlreadyInNotes(item.notes, logDate, content)) {
          skippedDuplicates++;
        } else {
          const comment = `[${logDate || 'Daily Log'}] ${content}`;
          item.notes = item.notes ? `${item.notes}\n${comment}` : comment;
          receiptsMap.set(id, item);
          updatedReceipts.push({ id, name: item.name, date: logDate, matchedText: content });
        }
      }
    }

    // 2. 既存の視聴ログ（ViewingItems）とマッチング
    for (const [id, item] of viewingsMap.entries()) {
      const keywords = getItemKeywords(item.title);
      const isMatched = keywords.some((kw) => content.toLowerCase().includes(kw.toLowerCase()));

      if (isMatched) {
        if (isCommentAlreadyInNotes(item.notes, logDate, content)) {
          skippedDuplicates++;
        } else {
          const comment = `[${logDate || 'Daily Log'}] ${content}`;
          item.notes = item.notes ? `${item.notes}\n${comment}` : comment;
          viewingsMap.set(id, item);
          updatedViewings.push({ id, title: item.title, date: logDate, matchedText: content });
        }
      }
    }

    // 3. ログ内から未登録の視聴作品を自動検出
    // 例: 「Netflixのイクサガミ」「リブート面白すぎる」「マリオの映画」
    const mediaPatterns = [
      { trigger: 'netflix', defaultPlatform: 'Netflix' as const },
      { trigger: 'イクサガミ', title: 'イクサガミ', platform: 'Netflix' as const, category: 'drama' as const },
      { trigger: 'リブート', title: 'リブート', platform: 'Netflix' as const, category: 'drama' as const },
      { trigger: '九条の大罪', title: '九条の大罪', platform: 'Netflix' as const, category: 'drama' as const },
      { trigger: 'マリオの映画', title: 'ザ・スーパーマリオブラザーズ・ムービー', platform: 'Other' as const, category: 'movie' as const },
    ];

    for (const p of mediaPatterns) {
      if (p.title && content.toLowerCase().includes(p.trigger.toLowerCase())) {
        const cleanTarget = cleanNoteText(p.title);
        const alreadyExists = Array.from(viewingsMap.values()).some((v) => {
          const cv = cleanNoteText(v.title);
          return cv.includes(cleanTarget) || cleanTarget.includes(cv);
        });
        const alreadyInNew = newViewings.some((v) => {
          const cv = cleanNoteText(v.title);
          return cv.includes(cleanTarget) || cleanTarget.includes(cv);
        });

        if (alreadyExists || alreadyInNew) {
          skippedDuplicates++;
          continue;
        }

        const newItem: ViewingItem = {
          id: `v-log-${Date.now()}-${newViewings.length}`,
          date: logDate || '2026-05-01',
          title: p.title,
          platform: p.platform || 'Netflix',
          durationMin: 90,
          category: p.category || 'drama',
          valueTag: 'well-being',
          notes: `[${logDate}] ${content}`,
          rating: 4,
        };
        newViewings.push(newItem);
        viewingsMap.set(newItem.id, newItem);
      }
    }
  }

  return {
    nextReceipts: Array.from(receiptsMap.values()),
    nextViewings: Array.from(viewingsMap.values()),
    result: {
      updatedReceipts,
      updatedViewings,
      newViewings,
      skippedDuplicates,
    },
  };
}

/** 品名から判定用キーワードリストを作成 */
export function getItemKeywords(name: string): string[] {
  const list: string[] = [];
  const clean = name.toLowerCase();

  // 本
  if (clean.includes('ヘイル・メアリー')) list.push('ヘイルメアリー', 'ヘイル・メアリー');
  if (clean.includes('宇宙兄弟')) list.push('宇宙兄弟');
  if (clean.includes('言語オタク') || clean.includes('言語沼')) list.push('言語沼', '言語オタク');
  if (clean.includes('松岡まどか')) list.push('松岡まどか');
  if (clean.includes('推し、燃ゆ') || clean.includes('推し燃ゆ')) list.push('推し、燃ゆ', '推し燃ゆ');
  if (clean.includes('自分とか、ないから')) list.push('自分とか、ないから', '自分とか');
  if (clean.includes('毒を持て')) list.push('毒を持て');
  if (clean.includes('ドリルを売るには')) list.push('ドリルを売る');
  if (clean.includes('世界秩序')) list.push('世界秩序');
  if (clean.includes('経済指標')) list.push('経済指標');

  // 洋服・持ち物・ギア
  if (clean.includes('オリヒカ') || clean.includes('ビズポロ')) list.push('オリヒカ', 'ビズポロ');
  if (clean.includes('ワークマン')) list.push('ワークマン');
  if (clean.includes('リーガル')) list.push('リーガル', '革靴');
  if (clean.includes('ケルヒャー') || clean.includes('高圧洗浄機')) list.push('ケルヒャー', '高圧洗浄機');
  if (clean.includes('insta360')) list.push('insta360', 'アクションカメラ');
  if (clean.includes('リカバリー')) list.push('リカバリーウェア', 'リカバリー');

  // 視聴
  if (clean.includes('モウリーニョ')) list.push('モウリーニョ');
  if (clean.includes('ジョコビッチ')) list.push('ジョコビッチ');
  if (clean.includes('ナダル') || clean.includes('ラファ')) list.push('ラファ', 'ナダル');
  if (clean.includes('日本三國')) list.push('日本三國');
  if (clean.includes('ダーウィン事変')) list.push('ダーウィン事変');
  if (clean.includes('黄泉のツガイ')) list.push('黄泉のツガイ');
  if (clean.includes('tシャツが乾くまで')) list.push('tシャツが乾くまで', 'yシャツが乾くまで');
  if (clean.includes('アトレティコ')) list.push('アトレティコ');

  // 汎用自動抽出: タイトルから余分な記号を省いたコア文字列
  const sanitized = clean
    .replace(/【[^】]*】/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/（[^）]*）/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/kindle(本)?/g, '')
    .replace(/単行本|文庫|新書/g, '')
    .trim();

  if (sanitized.length >= 2 && !list.includes(sanitized)) {
    list.push(sanitized);
  }

  if (sanitized.length >= 4) {
    const sub = sanitized.slice(0, 6);
    if (!list.includes(sub)) list.push(sub);
  }

  return list;
}
