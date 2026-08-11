'use client';

import { useMemo, useState } from 'react';
import Card from '../Card';
import FileDropZone from '../FileDropZone';
import ProgressRing from '../ProgressRing';
import { useLifeData } from '../LifeDataProvider';
import { parseLibraryCSV, STATUS_LABELS, TYPE_LABELS } from '@/lib/library';
import { saveLibrary } from '@/lib/lifeStore';
import type { LibraryItem, LibraryStatus, LibraryType } from '@/types';

const BOOK_GOAL = 24; // 2026 Target の「年間24冊読了」に対応

const TYPE_FILTERS: { id: LibraryType | 'all'; label: string }[] = [
  { id: 'all', label: 'すべて' },
  { id: 'book', label: '📖 本' },
  { id: 'movie', label: '🎬 映画' },
  { id: 'other', label: '📦 その他' },
];

const STATUS_FILTERS: { id: LibraryStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'すべて' },
  { id: 'want', label: '未着手' },
  { id: 'doing', label: '進行中' },
  { id: 'done', label: '完了' },
];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nextStatus(s: LibraryStatus): LibraryStatus {
  return s === 'want' ? 'doing' : s === 'doing' ? 'done' : 'want';
}

export default function LibraryTab() {
  const { library, setLibrary } = useLifeData();
  const [typeFilter, setTypeFilter] = useState<LibraryType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<LibraryStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const year = new Date().getFullYear();

  const finishedThisYear = useMemo(
    () => library.filter((i) => i.type === 'book' && i.finishedOn?.startsWith(String(year))).length,
    [library, year]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return library
      .filter((i) => (typeFilter === 'all' ? true : i.type === typeFilter))
      .filter((i) => (statusFilter === 'all' ? true : i.status === statusFilter))
      .filter((i) => (q ? i.title.toLowerCase().includes(q) || (i.recommender ?? '').toLowerCase().includes(q) : true))
      .sort((a, b) => {
        // 完了したものは新しい順に前へ、それ以外はタイトル順
        if (a.finishedOn && b.finishedOn) return b.finishedOn.localeCompare(a.finishedOn);
        if (a.finishedOn) return -1;
        if (b.finishedOn) return 1;
        return a.title.localeCompare(b.title, 'ja');
      });
  }, [library, typeFilter, statusFilter, query]);

  const handleImport = async (files: File[]) => {
    setImportMsg(null);
    try {
      const items = parseLibraryCSV(await files[0].text());
      if (items.length === 0) {
        setImportMsg('読み取れる行がありませんでした。Notionから書き出したCSVか確認してください。');
        return;
      }
      const merged = await saveLibrary(items);
      setLibrary(merged);
      setImportMsg(`${items.length}件を取り込みました。`);
    } catch {
      setImportMsg('読み込みに失敗しました。');
    }
  };

  const cycleStatus = async (item: LibraryItem) => {
    const status = nextStatus(item.status);
    const updated: LibraryItem = {
      ...item,
      status,
      finishedOn: status === 'done' ? item.finishedOn ?? todayIso() : undefined,
      startedOn: status === 'want' ? undefined : item.startedOn ?? todayIso(),
    };
    const merged = await saveLibrary([updated]);
    setLibrary(merged);
  };

  const counts = useMemo(() => ({
    total: library.length,
    doing: library.filter((i) => i.status === 'doing').length,
    done: library.filter((i) => i.status === 'done').length,
  }), [library]);

  return (
    <div className="flex flex-col gap-4">
      <Card title={`📚 ${year}年の読書`}>
        <div className="flex items-center gap-5 flex-wrap">
          <ProgressRing
            percent={(finishedThisYear / BOOK_GOAL) * 100}
            center={`${finishedThisYear}`}
            sub={`/ ${BOOK_GOAL}冊`}
            label="年間読了"
            color="var(--accent)"
          />
          <div className="flex flex-col gap-1 text-sm">
            <Line label="登録数" value={`${counts.total} 件`} />
            <Line label="進行中" value={`${counts.doing} 件`} />
            <Line label="完了" value={`${counts.done} 件`} />
          </div>
        </div>
        {library.length === 0 && (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            まだ登録がありません。下の取り込みカードから Notion の book&amp;movies CSV をアップロードしてください。
          </p>
        )}
      </Card>

      {library.length > 0 && (
        <>
          {/* フィルタは1行にまとめて、下のグリッド全体に効かせる */}
          <div className="flex flex-col gap-2">
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              {TYPE_FILTERS.map((f) => (
                <Chip key={f.id} active={typeFilter === f.id} onClick={() => setTypeFilter(f.id)}>{f.label}</Chip>
              ))}
              <span className="w-px flex-shrink-0" style={{ background: 'var(--border)' }} />
              {STATUS_FILTERS.map((f) => (
                <Chip key={f.id} active={statusFilter === f.id} onClick={() => setStatusFilter(f.id)}>{f.label}</Chip>
              ))}
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="タイトル・推薦者で検索"
              className="text-xs px-3 py-2 rounded-xl border w-full"
              style={{ background: 'var(--bg-card)', color: 'var(--text)', borderColor: 'var(--border)' }}
            />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{filtered.length}件</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.slice(0, 300).map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border p-4 flex flex-col gap-2"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ background: 'var(--bg-card2)', color: 'var(--text-muted)' }}>
                    {TYPE_LABELS[item.type]}
                  </span>
                  <button
                    onClick={() => cycleStatus(item)}
                    className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 border"
                    style={{
                      background: item.status === 'done' ? 'var(--accent)' : 'var(--bg-card2)',
                      color: item.status === 'done' ? '#fff' : 'var(--text-sub)',
                      borderColor: item.status === 'done' ? 'var(--accent)' : 'var(--border)',
                    }}
                  >
                    {item.status === 'done' ? '✓ ' : ''}{STATUS_LABELS[item.status]}
                  </button>
                </div>

                <p className="text-sm font-medium leading-snug" style={{ color: 'var(--text)' }}>{item.title}</p>

                <div className="flex items-center gap-2 flex-wrap mt-auto pt-1">
                  {item.finishedOn && (
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>完了 {item.finishedOn}</span>
                  )}
                  {item.recommender && (
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>推薦 {item.recommender}</span>
                  )}
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] ml-auto"
                      style={{ color: 'var(--accent)' }}
                    >
                      開く ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
          {filtered.length > 300 && (
            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              300件まで表示しています。検索で絞り込んでください。
            </p>
          )}
        </>
      )}

      <Card title="📥 Notion の book&movies を取り込む">
        <FileDropZone label="book&movies のCSVをアップロード" onFiles={handleImport} />
        {importMsg && <p className="text-xs" style={{ color: 'var(--text-sub)' }}>{importMsg}</p>}
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          同じタイトルは上書きされるので、何度取り込んでも重複しません。
          type 列が空の行は URL のドメインから 本 / 映画 を推定します。
        </p>
      </Card>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="text-xs px-3 py-1.5 rounded-full whitespace-nowrap flex-shrink-0 border transition-colors"
      style={{
        background: active ? 'var(--accent)' : 'var(--bg-card)',
        color: active ? '#fff' : 'var(--text-sub)',
        borderColor: active ? 'var(--accent)' : 'var(--border)',
      }}
    >
      {children}
    </button>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs w-14" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  );
}
