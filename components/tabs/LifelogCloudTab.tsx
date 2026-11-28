'use client';

import { useEffect, useMemo, useState } from 'react';

type SubTab = 'pantry' | 'gear' | 'books' | 'gifts' | 'specs';

interface CloudPayload {
  ok: boolean;
  backedUpAt: string | null;
  counts: { purchases: number; gear: number; books: number; gifts: number; specs: number };
  staples: { name: string; count: number; totalSpent: number; minPrice: number; cheapestStore: string; latestPrice: number }[];
  recentPurchases: { date: string; store: string; name: string; price: number }[];
  gear: { id: string; name: string; type: string; brand: string; season: string; cost: number; date: string; image_url: string }[];
  books: { id: string; title: string; author: string; genre: string; status: string; date: string; image_url: string; note: string }[];
  gifts: { id: string; title: string; recipients: string; price: number; url: string; image_url: string; created_at: string }[];
  specs: { id: string; category: string; item_name: string; spec_detail: string; memo: string }[];
}

export default function LifelogCloudTab() {
  const [data, setData] = useState<CloudPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<SubTab>('gifts');
  const [search, setSearch] = useState('');
  const [gearFilter, setGearFilter] = useState('ALL');
  const [bookFilter, setBookFilter] = useState<'ALL' | 'FINISHED' | 'UNREAD'>('ALL');
  const [giftWho, setGiftWho] = useState('ALL');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/lifelog/cloud');
      const d = await res.json();
      if (!d?.ok) {
        setError(d?.error || '読み込みに失敗しました');
      } else {
        setData(d as CloudPayload);
      }
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const q = search.trim().toLowerCase();

  const filteredGear = useMemo(() => {
    if (!data) return [];
    return data.gear.filter((g) => {
      if (gearFilter !== 'ALL' && g.type !== gearFilter) return false;
      if (q && !g.name.toLowerCase().includes(q) && !g.brand.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, gearFilter, q]);

  const filteredBooks = useMemo(() => {
    if (!data) return [];
    return data.books.filter((b) => {
      if (bookFilter !== 'ALL' && b.status !== bookFilter) return false;
      if (q && !b.title.toLowerCase().includes(q) && !b.author.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, bookFilter, q]);

  const filteredGifts = useMemo(() => {
    if (!data) return [];
    return data.gifts.filter((g) => {
      if (giftWho !== 'ALL' && !g.recipients.toLowerCase().includes(giftWho.toLowerCase())) return false;
      if (q && !g.title.toLowerCase().includes(q) && !g.url.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, giftWho, q]);

  const filteredStaples = useMemo(() => {
    if (!data) return [];
    return data.staples.filter((s) => !q || s.name.toLowerCase().includes(q) || s.cheapestStore.toLowerCase().includes(q));
  }, [data, q]);

  if (loading) {
    return (
      <div className="py-16 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
        ☁️ Supabase から買い物・持ち物・読書・プレゼントを読み込み中...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 rounded-xl border text-center space-y-2 text-xs" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="font-bold">⚠️ {error || 'データが見つかりません'}</div>
        <button type="button" onClick={load} className="px-3 py-1.5 rounded font-bold" style={{ background: 'var(--accent)', color: '#1e1a16' }}>
          再読み込み
        </button>
      </div>
    );
  }

  const syncTime = data.backedUpAt ? new Date(data.backedUpAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="max-w-6xl mx-auto space-y-3 text-xs" style={{ color: 'var(--text)' }}>
      {/* HEADER */}
      <div className="p-3 rounded-lg border flex flex-wrap items-center justify-between gap-2" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div>
          <div className="text-sm font-black">🍎 買い物・持ち物・読書・プレゼント（クラウド版）</div>
          <div className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
            ☁️ 最終同期: {syncTime || '済'} ・ スマホ／外出先からも全データ閲覧OK
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={load}
            className="px-2.5 py-1 rounded border font-bold text-[11px]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-sub)' }}
          >
            ↻ 更新
          </button>
          <a
            href="http://127.0.0.1:8788/"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:inline-flex px-2.5 py-1 rounded border font-bold text-[11px]"
            style={{ borderColor: 'var(--zelda-gold)', color: 'var(--zelda-gold)' }}
          >
            🖥️ Macローカル版(編集) ↗
          </a>
        </div>
      </div>

      {/* SUBTABS + SEARCH */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['pantry', `🍎 買い物 (${data.counts.purchases})`],
              ['gear', `⚔️ 持ち物 (${data.counts.gear})`],
              ['books', `📖 読書 (${data.counts.books})`],
              ['gifts', `🎁 プレゼント (${data.counts.gifts})`],
              ['specs', `🪞 スペック (${data.counts.specs})`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setSubTab(k);
                setSearch('');
              }}
              className="px-2.5 py-1.5 rounded-lg border font-black text-[11px]"
              style={{
                background: subTab === k ? 'var(--accent)' : 'var(--bg-card)',
                borderColor: subTab === k ? 'var(--zelda-gold)' : 'var(--border)',
                color: subTab === k ? '#1e1a16' : 'var(--text)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 キーワード検索..."
          className="w-full sm:w-56 px-2.5 py-1.5 rounded-lg border text-xs"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        />
      </div>

      {/* 1. PANTRY */}
      {subTab === 'pantry' && (
        <div className="space-y-3">
          <div className="rounded-lg border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <div className="px-3 py-2 border-b font-black text-xs" style={{ borderColor: 'var(--border)', background: 'var(--bg-card2)' }}>
              🔥 定番アイテム 最安底値 ＆ 累計支出（上位35品）
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {filteredStaples.map((s) => (
                <div key={s.name} className="px-3 py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold truncate">{s.name}</div>
                    <div className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
                      {s.count}回購入 ・ 最安店舗: {s.cheapestStore || '-'}
                    </div>
                  </div>
                  <div className="text-right whitespace-nowrap">
                    <div className="font-black" style={{ color: 'var(--zelda-zonai)' }}>最安 ¥{s.minPrice.toLocaleString()}</div>
                    <div className="text-[10.5px]" style={{ color: 'var(--zelda-gold)' }}>累計 ¥{s.totalSpent.toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 2. GEAR */}
      {subTab === 'gear' && (
        <div className="space-y-2.5">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['ALL', '✨ すべて'],
                ['APPLIANCE', '🔌 ギア・家電'],
                ['CLOTHING', '👕 洋服'],
                ['BAG', '🎒 カバン'],
                ['SHOES', '👟 靴'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setGearFilter(k)}
                className="px-2 py-1 rounded border text-[11px] font-bold"
                style={{
                  background: gearFilter === k ? 'var(--accent)' : 'var(--bg-card)',
                  borderColor: 'var(--border)',
                  color: gearFilter === k ? '#1e1a16' : 'var(--text-sub)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {filteredGear.map((g) => (
              <div key={g.id} className="p-2.5 rounded-lg border flex flex-col justify-between gap-2" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <div className="h-28 rounded flex items-center justify-center overflow-hidden" style={{ background: 'var(--bg-card2)' }}>
                  {g.image_url ? (
                    <img src={g.image_url} alt={g.name} loading="lazy" className="w-full h-full object-contain p-1" />
                  ) : (
                    <span className="text-2xl opacity-60">⚔️</span>
                  )}
                </div>
                <div>
                  <div className="font-bold text-[11.5px] line-clamp-2">{g.name}</div>
                  <div className="flex justify-between items-center mt-1 text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
                    <span>{g.brand || g.type}</span>
                    <strong style={{ color: 'var(--zelda-gold)' }}>{g.cost > 0 ? `¥${g.cost.toLocaleString()}` : ''}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. BOOKS */}
      {subTab === 'books' && (
        <div className="space-y-2.5">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['ALL', '📖 すべて'],
                ['FINISHED', '✅ 読了済'],
                ['UNREAD', '📕 積読'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setBookFilter(k)}
                className="px-2.5 py-1 rounded border text-[11px] font-bold"
                style={{
                  background: bookFilter === k ? 'var(--accent)' : 'var(--bg-card)',
                  borderColor: 'var(--border)',
                  color: bookFilter === k ? '#1e1a16' : 'var(--text-sub)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
            {filteredBooks.map((b) => (
              <div key={b.id} className="p-2 rounded-lg border flex flex-col justify-between gap-1.5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <div className="h-32 rounded flex items-center justify-center overflow-hidden" style={{ background: 'var(--bg-card2)' }}>
                  {b.image_url ? (
                    <img src={b.image_url} alt={b.title} loading="lazy" className="w-full h-full object-contain p-1" />
                  ) : (
                    <span className="text-2xl opacity-60">📖</span>
                  )}
                </div>
                <div>
                  <span
                    className="inline-block px-1.5 py-0.2 rounded text-[9.5px] font-bold mb-1"
                    style={{
                      background: b.status === 'FINISHED' ? 'rgba(111,176,135,0.2)' : 'rgba(217,168,78,0.16)',
                      color: b.status === 'FINISHED' ? 'var(--zelda-zonai)' : 'var(--zelda-gold)',
                    }}
                  >
                    {b.status === 'FINISHED' ? '✅ 読了' : '📕 積読'}
                  </span>
                  <div className="font-bold text-[11px] line-clamp-2">{b.title}</div>
                  {b.author && (
                    <div className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {b.author}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. GIFTS */}
      {subTab === 'gifts' && (
        <div className="space-y-2.5">
          <div className="flex flex-wrap gap-1.5">
            {(['ALL', 'myself', 'arisa', 'rio', 'others'] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setGiftWho(w)}
                className="px-2.5 py-1 rounded border text-[11px] font-bold"
                style={{
                  background: giftWho === w ? 'var(--accent)' : 'var(--bg-card)',
                  borderColor: 'var(--border)',
                  color: giftWho === w ? '#1e1a16' : 'var(--text-sub)',
                }}
              >
                {w === 'ALL' ? '✨ すべて' : w}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {filteredGifts.map((g) => (
              <div key={g.id} className="p-2.5 rounded-lg border flex flex-col justify-between gap-2" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <div className="h-32 rounded flex items-center justify-center overflow-hidden" style={{ background: 'var(--bg-card2)' }}>
                  {g.image_url ? (
                    <img src={g.image_url} alt={g.title} loading="lazy" className="w-full h-full object-contain p-1" />
                  ) : (
                    <span className="text-2xl opacity-60">🎁</span>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-[11.5px] line-clamp-2">{g.title}</div>
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {g.recipients}
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                  <strong style={{ color: 'var(--zelda-gold)' }}>{g.price > 0 ? `¥${g.price.toLocaleString()}` : '—'}</strong>
                  {g.url && (
                    <a
                      href={g.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-0.5 rounded border text-[10.5px] font-bold"
                      style={{ borderColor: 'var(--border)', color: 'var(--zelda-cyan)' }}
                    >
                      開く ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. PROFILE SPECS */}
      {subTab === 'specs' && (
        <div className="rounded-lg border divide-y" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          {data.specs.map((s) => (
            <div key={s.id} className="p-3 space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: 'var(--bg-card2)', color: 'var(--zelda-gold)' }}>
                  {s.category}
                </span>
                <span className="font-black text-xs">{s.item_name}</span>
              </div>
              <div className="font-bold text-xs pt-0.5">{s.spec_detail}</div>
              {s.memo && (
                <div className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
                  {s.memo}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
