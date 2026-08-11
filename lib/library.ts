import type { LibraryItem, LibraryType } from '@/types';
import { normalizeDate } from './habits';

/**
 * Notion の book&movies データベースを書き出した CSV を取り込む。
 * 列: 名前, URL, finish, start, type, 作成日時, 感想, 推薦者, 月
 *
 * type 列はほとんど空なので、URL のドメインから book / movie を推定する。
 */

const MOVIE_HINTS = [
  'netflix', 'filmarks', 'movie', 'eiga.com', 'warnerbros', 'studios', 'tsutaya', 'hulu', 'disney',
];

function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** 改行を含むセルがあるので、引用符の対応を見ながら論理行にまとめ直す。 */
function logicalLines(text: string): string[] {
  const rows: string[] = [];
  let cur = '';
  let quotes = 0;
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    cur = cur ? `${cur}\n${line}` : line;
    quotes += (line.match(/"/g) ?? []).length;
    if (quotes % 2 === 0) {
      if (cur.trim()) rows.push(cur);
      cur = '';
    }
  }
  if (cur.trim()) rows.push(cur);
  return rows;
}

/** Amazon の商品ページタイトルから、余分な販売店情報を落として作品名だけにする。 */
export function cleanTitle(raw: string): string {
  let t = raw.trim().replace(/^"|"$/g, '');
  t = t.replace(/^Amazon(\.co\.jp)?\s*[:：]\s*/i, '');
  t = t.replace(/\s*\+\s*配送料無料\s*$/, '');
  t = t.replace(/を観る\s*$/, ''); // Prime Video の「〇〇を観る」
  // "本 | 通販 | Amazon" のような末尾を落とす
  t = t.replace(/\s*\|\s*[^|]*\|?\s*(通販|本|Amazon)\s*(\|\s*Amazon)?\s*$/i, '');
  // 先頭のタイトル部分だけ残す（著者・出版社が " | " 区切りで続く形）
  const bar = t.indexOf(' | ');
  if (bar > 8) t = t.slice(0, bar);
  // ": 著者名: 本" のような末尾
  t = t.replace(/\s*[:：]\s*[^:：]{1,20}\s*[:：]\s*本\s*$/, '');
  return t.trim() || raw.trim();
}

function inferType(explicit: string, url: string): LibraryType {
  const e = explicit.trim().toLowerCase();
  if (e === 'book' || e === 'movie' || e === 'drama' || e === 'anime') return e as LibraryType;
  const u = url.toLowerCase();
  if (!u) return 'other';
  if (MOVIE_HINTS.some((h) => u.includes(h))) return 'movie';
  if (u.includes('amazon') || u.includes('amzn')) return 'book';
  return 'other';
}

/** タイトルから安定した id を作る（再インポートで重複しないように） */
function slug(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) | 0;
  }
  return `lib_${Math.abs(hash).toString(36)}`;
}

export function parseLibraryCSV(csvText: string): LibraryItem[] {
  const rows = logicalLines(csvText);
  if (rows.length < 2) return [];

  const headers = splitLine(rows[0]).map((h) => h.replace(/^"|"$/g, ''));
  const col = (name: string) => headers.indexOf(name);
  const iTitle = col('名前') >= 0 ? col('名前') : 0;
  const iUrl = col('URL');
  const iFinish = col('finish');
  const iStart = col('start');
  const iType = col('type');
  const iNote = col('感想');
  const iRec = col('推薦者');

  const items = new Map<string, LibraryItem>();
  for (const row of rows.slice(1)) {
    const cols = splitLine(row).map((c) => c.replace(/^"|"$/g, ''));
    const rawTitle = cols[iTitle] ?? '';
    if (!rawTitle.trim()) continue;

    const title = cleanTitle(rawTitle);
    const url = iUrl >= 0 ? cols[iUrl] ?? '' : '';
    const finishedOn = iFinish >= 0 ? normalizeDate(cols[iFinish] ?? '') : null;
    const startedOn = iStart >= 0 ? normalizeDate(cols[iStart] ?? '') : null;

    items.set(title, {
      id: slug(title),
      title,
      url: url || undefined,
      type: inferType(iType >= 0 ? cols[iType] ?? '' : '', url),
      status: finishedOn ? 'done' : startedOn ? 'doing' : 'want',
      startedOn: startedOn ?? undefined,
      finishedOn: finishedOn ?? undefined,
      recommender: (iRec >= 0 ? cols[iRec] : '')?.trim() || undefined,
      note: (iNote >= 0 ? cols[iNote] : '')?.trim() || undefined,
    });
  }
  return Array.from(items.values());
}

export const TYPE_LABELS: Record<LibraryType, string> = {
  book: '📖 本',
  movie: '🎬 映画',
  drama: '📺 ドラマ',
  anime: '🎨 アニメ',
  other: '📦 その他',
};

export const STATUS_LABELS: Record<LibraryItem['status'], string> = {
  want: '未着手',
  doing: '進行中',
  done: '完了',
};
