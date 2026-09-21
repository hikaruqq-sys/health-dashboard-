'use client';

import { useState, useMemo, useEffect } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import Card from '../Card';
import FileDropZone from '../FileDropZone';
import { matchDailyLogToItems, MatchResult } from '@/lib/dailyLogMatcher';
import {
  loadReceiptItems,
  saveReceiptItems,
  loadViewingItems,
  saveViewingItems,
  parseReceiptCSV,
  parseImportCSV,
  computeMonthlyTrends,
  INVENTORY_CATEGORIES,
  VALUE_TAGS,
  CLOTHING_SEASONS,
  CLOTHING_CATEGORIES,
} from '@/lib/inventory';
import { tooltipStyle } from '@/lib/vizPalette';
import type { ReceiptItem, ViewingItem, InventoryCategory, ClothingSeason, ClothingCategory, ValueTag } from '@/types';

type SubTab = InventoryCategory | 'viewing';

export default function ValueInventoryTab() {
  const [receipts, setReceipts] = useState<ReceiptItem[]>([]);
  const [viewings, setViewings] = useState<ViewingItem[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('clothes');
  const [searchQuery, setSearchQuery] = useState('');
  const [csvText, setCsvText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [showDeletedSection, setShowDeletedSection] = useState(false);

  // Daily Log 反映用
  const [showDailyLogModal, setShowDailyLogModal] = useState(false);
  const [dailyLogInput, setDailyLogInput] = useState('');
  const [matchSummary, setMatchSummary] = useState<MatchResult | null>(null);

  // 手動追加モーダル用状態
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualCategory, setManualCategory] = useState<'viewing' | 'book' | 'clothes' | 'gadget'>('viewing');
  const [manualTitle, setManualTitle] = useState('');
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [manualPlatformOrStore, setManualPlatformOrStore] = useState('U-NEXT');
  const [manualDurationOrAmount, setManualDurationOrAmount] = useState('90');
  const [manualValueTag, setManualValueTag] = useState<ValueTag>('none');
  const [manualRating, setManualRating] = useState<number>(4);
  const [manualNotes, setManualNotes] = useState('');
  const [manualImageUrl, setManualImageUrl] = useState('');

  // 価値タグの切り替えハンドラ
  const handleChangeValueTagReceipt = (id: string, tag: ValueTag) => {
    handleUpdateReceipt(id, { valueTag: tag });
  };
  const handleChangeValueTagViewing = (id: string, tag: ValueTag) => {
    handleUpdateViewing(id, { valueTag: tag });
  };

  // 手動追加の実行
  const handleCreateManualItem = () => {
    if (!manualTitle.trim()) {
      alert('タイトルまたは品名を入力してください');
      return;
    }

    if (manualCategory === 'viewing') {
      const duration = parseInt(manualDurationOrAmount.replace(/[^\d]/g, ''), 10) || 90;
      const newItem: ViewingItem = {
        id: `v-manual-${Date.now()}`,
        date: manualDate,
        title: manualTitle.trim(),
        platform: (manualPlatformOrStore.trim() || 'U-NEXT') as any,
        durationMin: duration,
        category: manualTitle.includes('サッカー') || manualPlatformOrStore.includes('U-NEXT') ? 'soccer' : 'movie',
        valueTag: manualValueTag,
        notes: manualNotes.trim() || undefined,
        imageUrl: manualImageUrl.trim() || undefined,
        rating: manualRating,
      };
      const next = [newItem, ...viewings];
      setViewings(next);
      saveViewingItems(next);
    } else {
      const amount = parseInt(manualDurationOrAmount.replace(/[^\d]/g, ''), 10) || 0;
      const newItem: ReceiptItem = {
        id: `rc-manual-${Date.now()}`,
        date: manualDate,
        store: manualPlatformOrStore.trim() || 'その他',
        name: manualTitle.trim(),
        amount,
        category: manualCategory,
        valueTag: manualValueTag,
        season: manualCategory === 'clothes' ? 'all' : undefined,
        notes: manualNotes.trim() || undefined,
        imageUrl: manualImageUrl.trim() || undefined,
        rating: manualRating,
      };
      const next = [newItem, ...receipts];
      setReceipts(next);
      saveReceiptItems(next);
    }

    // リセット
    setManualTitle('');
    setManualNotes('');
    setManualImageUrl('');
    setShowManualModal(false);
    alert('アイテムを追加しました！');
  };

  // シーズン変更ハンドラ
  const handleChangeSeason = (id: string, season: ClothingSeason) => {
    handleUpdateReceipt(id, { season });
  };

  // Daily Log の解析と反映実行
  const handleApplyDailyLog = (text: string) => {
    if (!text.trim()) return;
    const { nextReceipts, nextViewings, result } = matchDailyLogToItems(text, receipts, viewings);
    setReceipts(nextReceipts);
    setViewings(nextViewings);
    saveReceiptItems(nextReceipts);
    saveViewingItems(nextViewings);
    setMatchSummary(result);
    setDailyLogInput('');
  };

  // 洋服のフィルター状態（Notion連動）
  const [selectedSeason, setSelectedSeason] = useState<ClothingSeason | 'all'>('all');
  const [selectedClothingCategory, setSelectedClothingCategory] = useState<ClothingCategory | 'all'>('all');

  // 画像編集用モーダル
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingImageUrl, setEditingImageUrl] = useState('');

  // 初期ロード (v3キー)
  useEffect(() => {
    // 既存の古いキャッシュをクリアして新Notionシードを反映
    const raw = localStorage.getItem('life_receipt_items_v3');
    if (!raw) {
      localStorage.removeItem('life_receipt_items_v1');
      localStorage.removeItem('life_receipt_items_v2');
    }
    setReceipts(loadReceiptItems());
    setViewings(loadViewingItems());
  }, []);

  // 月別推移（時系列）の計算
  const monthlyTrends = useMemo(() => computeMonthlyTrends(receipts, viewings), [receipts, viewings]);

  // アイテム更新（レシート）
  const handleUpdateReceipt = (id: string, updates: Partial<ReceiptItem>) => {
    const next = receipts.map((r) => (r.id === id ? { ...r, ...updates } : r));
    setReceipts(next);
    saveReceiptItems(next);
  };

  // アイテム更新（視聴）
  const handleUpdateViewing = (id: string, updates: Partial<ViewingItem>) => {
    const next = viewings.map((v) => (v.id === id ? { ...v, ...updates } : v));
    setViewings(next);
    saveViewingItems(next);
  };

  // カテゴリ変更（振り分け直し）
  const handleChangeCategory = (id: string, targetCategory: InventoryCategory) => {
    handleUpdateReceipt(id, { category: targetCategory });
  };

  // 削除（ゴミ箱へ）
  const handleDeleteReceipt = (id: string) => {
    handleUpdateReceipt(id, { deleted: true });
  };
  const handleDeleteViewing = (id: string) => {
    handleUpdateViewing(id, { deleted: true });
  };

  // 復元
  const handleRestoreReceipt = (id: string) => {
    handleUpdateReceipt(id, { deleted: false });
  };
  const handleRestoreViewing = (id: string) => {
    handleUpdateViewing(id, { deleted: false });
  };

  // 完全削除
  const handlePermanentDeleteReceipt = (id: string) => {
    if (!confirm('このアイテムを完全に削除しますか？（元に戻せません）')) return;
    const next = receipts.filter((r) => r.id !== id);
    setReceipts(next);
    saveReceiptItems(next);
  };
  const handlePermanentDeleteViewing = (id: string) => {
    if (!confirm('このアイテムを完全に削除しますか？（元に戻せません）')) return;
    const next = viewings.filter((v) => v.id !== id);
    setViewings(next);
    saveViewingItems(next);
  };

  // ファイルインポート（購入・視聴ログ両対応）
  const handleFileImport = async (files: File[]) => {
    if (files.length === 0) return;
    const file = files[0];
    const text = await file.text();
    const { receipts: newR, viewings: newV } = parseImportCSV(text);
    if (newR.length === 0 && newV.length === 0) {
      alert('有効なCSVデータを読み込めませんでした。形式を確認してください。');
      return;
    }
    if (newR.length > 0) {
      const nextR = [...newR, ...receipts];
      setReceipts(nextR);
      saveReceiptItems(nextR);
    }
    if (newV.length > 0) {
      const nextV = [...newV, ...viewings];
      setViewings(nextV);
      saveViewingItems(nextV);
    }
    setShowImport(false);
    alert(`取り込み完了！\n・購入アイテム: ${newR.length} 件\n・視聴ログ: ${newV.length} 件`);
  };

  // テキストインポート（購入・視聴ログ両対応）
  const handleImportCSV = () => {
    if (!csvText.trim()) return;
    const { receipts: newR, viewings: newV } = parseImportCSV(csvText);
    if (newR.length === 0 && newV.length === 0) {
      alert('有効なCSVデータを読み込めませんでした。形式を確認してください。');
      return;
    }
    if (newR.length > 0) {
      const nextR = [...newR, ...receipts];
      setReceipts(nextR);
      saveReceiptItems(nextR);
    }
    if (newV.length > 0) {
      const nextV = [...newV, ...viewings];
      setViewings(nextV);
      saveViewingItems(nextV);
    }
    setCsvText('');
    setShowImport(false);
    alert(`取り込み完了！\n・購入アイテム: ${newR.length} 件\n・視聴ログ: ${newV.length} 件`);
  };

  // 削除済みアイテム一覧
  const deletedReceipts = useMemo(() => receipts.filter((r) => r.deleted), [receipts]);
  const deletedViewings = useMemo(() => viewings.filter((v) => v.deleted), [viewings]);
  const totalDeletedCount = deletedReceipts.length + deletedViewings.length;

  // フィルタ済みレシート
  const filteredReceipts = useMemo(() => {
    return receipts
      .filter((r) => !r.deleted)
      .filter((r) => (activeSubTab !== 'viewing' ? r.category === activeSubTab : true))
      .filter((r) => {
        if (activeSubTab === 'clothes') {
          if (selectedSeason !== 'all' && r.season !== selectedSeason) return false;
          if (selectedClothingCategory !== 'all' && r.clothingCategory !== selectedClothingCategory) return false;
        }
        return true;
      })
      .filter((r) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
          r.name.toLowerCase().includes(q) ||
          r.store.toLowerCase().includes(q) ||
          (r.notes ?? '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [receipts, activeSubTab, selectedSeason, selectedClothingCategory, searchQuery]);

  // フィルタ済み視聴ログ
  const filteredViewings = useMemo(() => {
    return viewings
      .filter((v) => !v.deleted)
      .filter((v) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
          v.title.toLowerCase().includes(q) ||
          v.platform.toLowerCase().includes(q) ||
          (v.notes ?? '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [viewings, searchQuery]);

  // 画像URL保存
  const handleSaveImageUrl = (id: string, isViewing: boolean) => {
    if (isViewing) {
      handleUpdateViewing(id, { imageUrl: editingImageUrl.trim() });
    } else {
      handleUpdateReceipt(id, { imageUrl: editingImageUrl.trim() });
    }
    setEditingItemId(null);
    setEditingImageUrl('');
  };

  // 洋服のシーズン別カウント
  const seasonCounts = useMemo(() => {
    const clothes = receipts.filter((r) => !r.deleted && r.category === 'clothes');
    return {
      all: clothes.length,
      all_season: clothes.filter((r) => r.season === 'all').length,
      summer: clothes.filter((r) => r.season === 'summer').length,
      winter: clothes.filter((r) => r.season === 'winter').length,
    };
  }, [receipts]);

  return (
    <div className="flex flex-col gap-5">
      {/* ── 月別推移グラフ（支出金額 ＆ 視聴時間：複合グラフ） ── */}
      <Card
        title="💎 人生価値の月別推移（支出金額 ＆ 視聴時間）"
        action={
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 text-sky-500 font-medium">
              <span className="w-2.5 h-2.5 rounded-sm bg-sky-500 inline-block" /> 棒: WB支出
            </span>
            <span className="flex items-center gap-1 text-emerald-500 font-medium">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> 棒: OS支出
            </span>
            <span className="flex items-center gap-1 text-amber-400 font-medium">
              <span className="w-2.5 h-0.5 bg-amber-400 inline-block" /> 線: 視聴時間
            </span>
          </div>
        }
      >
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
            <span>棒グラフ（左軸：金額） ✕ 折れ線グラフ（右軸：視聴時間）で生活の投資と時間を可視化</span>
            <span className="text-[10px] bg-[var(--bg-card2)] px-2 py-0.5 rounded border border-[var(--border)]">
              グラフ内の数字：各月の支出合計 & 視聴時間
            </span>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyTrends} margin={{ top: 20, right: 20, left: 10, bottom: 5 }}>
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `¥${(v / 1000).toFixed(0)}k`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}h`}
                />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(val, name) => {
                    if (name === 'wbAmount') return [`¥${Number(val).toLocaleString()}`, '🌿 Well-being 支出'];
                    if (name === 'osAmount') return [`¥${Number(val).toLocaleString()}`, '🧭 Ownership 支出'];
                    if (name === 'totalHours') return [`${val} 時間`, '🎬 総視聴時間'];
                    return [val, name];
                  }}
                />
                <Bar yAxisId="left" dataKey="wbAmount" name="wbAmount" stackId="amt" fill="#0ea5e9" radius={[0, 0, 0, 0]} />
                <Bar yAxisId="left" dataKey="osAmount" name="osAmount" stackId="amt" fill="#10b981" radius={[4, 4, 0, 0]}>
                  <LabelList
                    dataKey="totalAmount"
                    position="top"
                    formatter={(v: any) => (Number(v) > 0 ? `¥${(Number(v) / 1000).toFixed(0)}k` : '')}
                    style={{ fontSize: 10, fill: 'var(--text-sub)', fontWeight: 'bold' }}
                  />
                </Bar>
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="totalHours"
                  name="totalHours"
                  stroke="#fbbf24"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#fbbf24', strokeWidth: 1.5, stroke: '#fff' }}
                  activeDot={{ r: 6 }}
                >
                  <LabelList
                    dataKey="totalHours"
                    position="top"
                    offset={8}
                    formatter={(v: any) => (Number(v) > 0 ? `${v}h` : '')}
                    style={{ fontSize: 10, fill: '#fbbf24', fontWeight: 'bold' }}
                  />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>

      {/* ── 4つの厳選タブ切り替え & 検索 ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setActiveSubTab('clothes')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
              activeSubTab === 'clothes'
                ? 'bg-[var(--accent)] text-white shadow'
                : 'bg-[var(--bg-card2)] text-[var(--text-sub)] hover:text-[var(--text)]'
            }`}
          >
            <span>👕</span>
            <span>洋服 (Notion連携)</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 text-white font-normal">
              {receipts.filter((r) => !r.deleted && r.category === 'clothes').length}
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('book')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
              activeSubTab === 'book'
                ? 'bg-[var(--accent)] text-white shadow'
                : 'bg-[var(--bg-card2)] text-[var(--text-sub)] hover:text-[var(--text)]'
            }`}
          >
            <span>📚</span>
            <span>読書記録</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 text-white font-normal">
              {receipts.filter((r) => !r.deleted && r.category === 'book').length}
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('viewing')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
              activeSubTab === 'viewing'
                ? 'bg-[var(--accent)] text-white shadow'
                : 'bg-[var(--bg-card2)] text-[var(--text-sub)] hover:text-[var(--text)]'
            }`}
          >
            <span>🎬</span>
            <span>視聴ログ</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 text-white font-normal">
              {viewings.filter((v) => !v.deleted).length}
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('gadget')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
              activeSubTab === 'gadget'
                ? 'bg-[var(--accent)] text-white shadow'
                : 'bg-[var(--bg-card2)] text-[var(--text-sub)] hover:text-[var(--text)]'
            }`}
          >
            <span>🔌</span>
            <span>家電・ギア</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 text-white font-normal">
              {receipts.filter((r) => !r.deleted && r.category === 'gadget').length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="タイトル・メモを検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="text-xs px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] w-full sm:w-52"
          />
          <button
            onClick={() => {
              setManualCategory(activeSubTab);
              setShowManualModal(true);
            }}
            className="text-xs px-3 py-1.5 rounded-xl font-bold bg-[var(--accent)] text-white hover:opacity-90 transition-opacity whitespace-nowrap flex items-center gap-1 shadow-sm"
          >
            <span>➕</span>
            <span>手入力で追加</span>
          </button>
          <button
            onClick={() => {
              setShowDailyLogModal(true);
              setMatchSummary(null);
            }}
            className="text-xs px-3 py-1.5 rounded-xl font-medium bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500 hover:text-white transition-all whitespace-nowrap flex items-center gap-1"
          >
            <span>📝</span>
            <span>Daily Log感想同期</span>
          </button>
          <button
            onClick={() => setShowImport(!showImport)}
            className="text-xs px-3 py-1.5 rounded-xl font-medium bg-[var(--bg-card2)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--accent)] hover:text-white transition-colors whitespace-nowrap"
          >
            📥 CSV追加
          </button>
        </div>
      </div>

      {/* ── 👕 洋服タブ専用：Notion風シーズン切り替えバー ── */}
      {activeSubTab === 'clothes' && (
        <div className="flex flex-col gap-2 p-3 rounded-2xl bg-[var(--bg-card)] border border-[var(--border)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--text)] flex items-center gap-1.5">
              <span>2026Clothes</span>
              <span className="text-[10px] text-[var(--text-muted)] font-normal">（Notionボード連携）</span>
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">
              全 {seasonCounts.all} 点
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setSelectedSeason('all')}
              className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all ${
                selectedSeason === 'all'
                  ? 'bg-[var(--text)] text-[var(--bg)] font-bold shadow'
                  : 'bg-[var(--bg-card2)] text-[var(--text-sub)] hover:text-[var(--text)]'
              }`}
            >
              すべて ({seasonCounts.all})
            </button>
            <button
              onClick={() => setSelectedSeason('all' as any)}
              className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1 ${
                selectedSeason === ('all' as any)
                  ? 'bg-amber-600 text-white font-bold shadow'
                  : 'bg-[var(--bg-card2)] text-[var(--text-sub)] hover:text-[var(--text)]'
              }`}
            >
              <span>🔄</span>
              <span>オールシーズン ({seasonCounts.all_season})</span>
            </button>
            <button
              onClick={() => setSelectedSeason('winter')}
              className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1 ${
                selectedSeason === 'winter'
                  ? 'bg-blue-600 text-white font-bold shadow'
                  : 'bg-[var(--bg-card2)] text-[var(--text-sub)] hover:text-[var(--text)]'
              }`}
            >
              <span>❄️</span>
              <span>冬 ({seasonCounts.winter})</span>
            </button>
            <button
              onClick={() => setSelectedSeason('summer')}
              className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1 ${
                selectedSeason === 'summer'
                  ? 'bg-emerald-600 text-white font-bold shadow'
                  : 'bg-[var(--bg-card2)] text-[var(--text-sub)] hover:text-[var(--text)]'
              }`}
            >
              <span>☀️</span>
              <span>夏 ({seasonCounts.summer})</span>
            </button>
          </div>
        </div>
      )}

      {/* ── CSV取り込み（ファイル ＆ テキスト両対応） ── */}
      {showImport && (
        <Card
          title="📥 レシート・購入詳細CSVのインポート"
          action={
            <button
              onClick={() => setShowImport(false)}
              className="text-xs px-2.5 py-1 rounded-lg bg-[var(--bg-card2)] text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              ✕ 閉じる
            </button>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-[var(--text)] flex items-center gap-1.5">
                📁 ファイルで取り込む (.csv)
              </span>
              <FileDropZone
                label="CSVファイルを選択またはドロップ"
                hint="日付,店舗名,商品名,金額 のファイルを自動仕分け"
                onFiles={handleFileImport}
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--text)]">📝 テキスト貼り付けで取り込む</span>
                <button
                  type="button"
                  onClick={() => {
                    const prompt = `# 役割\nあなたはAmazon Prime Videoの視聴履歴データ抽出エキスパートです。\n提示されるAmazonプライムの視聴履歴テキストを解析し、ダッシュボード取り込み専用のCSV形式で出力してください。\n\n# 出力形式\n日付(YYYY/MM/DD),Prime Video,作品タイトル,推定時間(分),価値(Well-being または Ownership または なし)\n\n# ルール\n1. 各行に1エピソードまたは1作品を出力。\n2. 推定時間: アニメ・ドラマ1話は45分、映画は100分、バラエティ1話は50分。\n3. 余計な挨拶やコードブロック等の装飾は一切入れず、CSVテキストのみ出力。\n\n# 出力例\n2025/06/22,Prime Video,バチェラー・ジャパン シーズン６,50,Well-being\n2025/06/01,Prime Video,アプレンティス：ドナルド・トランプの創り方,100,Ownership\n2025/05/26,Prime Video,アンナチュラル,45,Well-being`;
                    navigator.clipboard.writeText(prompt);
                    alert('Amazon Prime Video用 Geminiプロンプトをクリップボードにコピーしました！Geminiに貼り付けて履歴テキストを渡してください。');
                  }}
                  className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-bold hover:bg-amber-500 hover:text-white transition-colors"
                >
                  📋 Prime用Geminiプロンプトをコピー
                </button>
              </div>
              <textarea
                rows={5}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="2025/06/22,Prime Video,バチェラー・ジャパン シーズン６,50,Well-being&#10;2026/08/10,Amazon,Insta360 Ace Pro 2,58300"
                className="text-xs font-mono p-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-card2)] text-[var(--text)] flex-1 resize-none"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleImportCSV}
                  disabled={!csvText.trim()}
                  className="text-xs px-4 py-2 rounded-xl font-bold bg-[var(--accent)] text-white disabled:opacity-50 transition-opacity"
                >
                  テキストから自動仕分け取り込み
                </button>
              </div>
            </div>
          </div>
        </Card>
      )}

      
      
      {/* ── ➕ 手動アイテム追加モーダル（サッカー試合・読書・服・家電） ── */}
      {showManualModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 w-full max-w-md flex flex-col gap-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
              <h3 className="text-sm font-bold text-[var(--text)] flex items-center gap-1.5">
                <span>➕</span>
                <span>アイテムを手動で追加</span>
              </h3>
              <button
                onClick={() => setShowManualModal(false)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                ✕ 閉じる
              </button>
            </div>

            {/* カテゴリ選択 */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[var(--text-sub)]">カテゴリ:</label>
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => { setManualCategory('viewing'); setManualPlatformOrStore('U-NEXT'); setManualDurationOrAmount('90'); }}
                  className={`text-xs py-1.5 rounded-lg font-medium transition-all ${
                    manualCategory === 'viewing' ? 'bg-[var(--accent)] text-white font-bold' : 'bg-[var(--bg-card2)] text-[var(--text-sub)]'
                  }`}
                >
                  🎬 視聴
                </button>
                <button
                  type="button"
                  onClick={() => { setManualCategory('book'); setManualPlatformOrStore('Amazon'); setManualDurationOrAmount('1500'); }}
                  className={`text-xs py-1.5 rounded-lg font-medium transition-all ${
                    manualCategory === 'book' ? 'bg-[var(--accent)] text-white font-bold' : 'bg-[var(--bg-card2)] text-[var(--text-sub)]'
                  }`}
                >
                  📚 読書
                </button>
                <button
                  type="button"
                  onClick={() => { setManualCategory('clothes'); setManualPlatformOrStore('ユニクロ'); setManualDurationOrAmount('3990'); }}
                  className={`text-xs py-1.5 rounded-lg font-medium transition-all ${
                    manualCategory === 'clothes' ? 'bg-[var(--accent)] text-white font-bold' : 'bg-[var(--bg-card2)] text-[var(--text-sub)]'
                  }`}
                >
                  👕 洋服
                </button>
                <button
                  type="button"
                  onClick={() => { setManualCategory('gadget'); setManualPlatformOrStore('Amazon'); setManualDurationOrAmount('5000'); }}
                  className={`text-xs py-1.5 rounded-lg font-medium transition-all ${
                    manualCategory === 'gadget' ? 'bg-[var(--accent)] text-white font-bold' : 'bg-[var(--bg-card2)] text-[var(--text-sub)]'
                  }`}
                >
                  🔌 家電
                </button>
              </div>
            </div>

            {/* タイトル / 品名 */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[var(--text-sub)]">
                {manualCategory === 'viewing' ? '作品名・試合名 (例: U-NEXT サッカーCL アトレティコ戦):' : '品名・タイトル:'}
              </label>
              <input
                type="text"
                placeholder={manualCategory === 'viewing' ? '例: サッカー日本代表戦' : '例: 新しいTシャツ'}
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                className="text-xs p-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card2)] text-[var(--text)]"
              />
            </div>

            {/* 日付 ＆ 時間/金額 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[var(--text-sub)]">
                  {manualCategory === 'viewing' ? 'みた日:' : '買った日:'}
                </label>
                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="text-xs p-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card2)] text-[var(--text)]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[var(--text-sub)]">
                  {manualCategory === 'viewing' ? '視聴時間 (分):' : '金額 (円):'}
                </label>
                <input
                  type="number"
                  placeholder={manualCategory === 'viewing' ? '90' : '3000'}
                  value={manualDurationOrAmount}
                  onChange={(e) => setManualDurationOrAmount(e.target.value)}
                  className="text-xs p-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card2)] text-[var(--text)]"
                />
              </div>
            </div>

            {/* 媒体/店舗 ＆ 価値タグ */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[var(--text-sub)]">
                  {manualCategory === 'viewing' ? '媒体 (U-NEXT/TVer等):' : '店舗/購入先:'}
                </label>
                <input
                  type="text"
                  placeholder={manualCategory === 'viewing' ? 'U-NEXT' : 'Amazon'}
                  value={manualPlatformOrStore}
                  onChange={(e) => setManualPlatformOrStore(e.target.value)}
                  className="text-xs p-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card2)] text-[var(--text)]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[var(--text-sub)]">人生価値タグ:</label>
                <select
                  value={manualValueTag}
                  onChange={(e) => setManualValueTag(e.target.value as ValueTag)}
                  className="text-xs p-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card2)] text-[var(--text)] font-semibold"
                >
                  <option value="none">⚪ なし（未分類）</option>
                  <option value="well-being">🌿 Well-being</option>
                  <option value="ownership">🧭 Ownership</option>
                </select>
              </div>
            </div>

            {/* 評価（★1〜4） */}
            <div className="flex items-center justify-between py-1">
              <span className="text-xs font-semibold text-[var(--text-sub)]">評価 (1〜4):</span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setManualRating(star)}
                    className={`text-lg transition-transform hover:scale-125 ${
                      star <= manualRating ? 'text-amber-500' : 'text-slate-300 dark:text-slate-700'
                    }`}
                  >
                    ★
                  </button>
                ))}
                <span className="text-xs text-[var(--text-muted)] ml-1">{manualRating}/4</span>
              </div>
            </div>

            {/* 感想メモ */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[var(--text-sub)]">感想・メモ:</label>
              <textarea
                rows={2}
                placeholder="戦術の深掘りになった、リフレッシュできた等"
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                className="text-xs p-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card2)] text-[var(--text)] resize-none"
              />
            </div>

            {/* 画像URL（任意） */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[var(--text-muted)]">画像URL（任意）:</label>
              <input
                type="url"
                placeholder="https://..."
                value={manualImageUrl}
                onChange={(e) => setManualImageUrl(e.target.value)}
                className="text-xs p-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card2)] text-[var(--text)]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="text-xs px-3 py-1.5 rounded-lg bg-[var(--bg-card2)] text-[var(--text-sub)]"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleCreateManualItem}
                className="text-xs px-5 py-2 rounded-xl font-bold bg-[var(--accent)] text-white shadow"
              >
                追加する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 📝 Daily Log 感想自動反映モーダル ── */}
      {showDailyLogModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 w-full max-w-lg flex flex-col gap-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 className="text-sm font-bold text-[var(--text)] flex items-center gap-1.5">
                <span>📝</span>
                <span>Daily Logからアイテム感想・見たものを自動同期</span>
              </h3>
              <button
                onClick={() => setShowDailyLogModal(false)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                ✕ 閉じる
              </button>
            </div>

            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              iPhoneに保存している日々の思考ログ（<code>YYYY-MM-DD 内容</code>）を貼り付けるかファイルをドロップしてください。
              ログ内の書籍、映画、ドラマ、服、家電の感想を自動で各アイテムの「💡 感想」欄に追記・同期します。
            </p>

            {/* ファイルドロップ */}
            <FileDropZone
              label="daily_log.csv をドロップ"
              hint="月1回のデイリーログファイルを直接解析"
              onFiles={async (files) => {
                if (files.length === 0) return;
                const text = await files[0].text();
                handleApplyDailyLog(text);
              }}
            />

            {/* またはテキスト貼り付け */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-[var(--text-sub)]">またはテキストを貼り付け:</span>
              <textarea
                rows={4}
                value={dailyLogInput}
                onChange={(e) => setDailyLogInput(e.target.value)}
                placeholder="2026-02-20 言語沼最高すぎるなあ。オノマトペは偉大。&#10;2026-08-16 買ったモバイル高圧洗浄機で洗車を楽しむ。最高だった。ケルヒャー"
                className="text-xs font-mono p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card2)] text-[var(--text)]"
              />
            </div>

            {/* 解析結果サマリー */}
            {matchSummary && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col gap-2">
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  ✓ 同期が完了しました！
                </span>
                <ul className="text-xs text-[var(--text-sub)] space-y-1">
                  <li>• 読書・洋服・家電の感想更新: <strong>{matchSummary.updatedReceipts.length}</strong> 件</li>
                  <li>• 視聴ログの感想更新: <strong>{matchSummary.updatedViewings.length}</strong> 件</li>
                  {matchSummary.newViewings.length > 0 && (
                    <li>• ログから自動検出された新規視聴作品: <strong>{matchSummary.newViewings.length}</strong> 件 ({matchSummary.newViewings.map(v => v.title).join(', ')})</li>
                  )}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
              <button
                onClick={() => setShowDailyLogModal(false)}
                className="text-xs px-3 py-1.5 rounded-lg bg-[var(--bg-card2)] text-[var(--text-sub)]"
              >
                閉じる
              </button>
              <button
                onClick={() => handleApplyDailyLog(dailyLogInput)}
                disabled={!dailyLogInput.trim()}
                className="text-xs px-4 py-1.5 rounded-lg font-bold bg-[var(--accent)] text-white disabled:opacity-50 transition-opacity"
              >
                テキストを解析して同期する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 画像URL変更モーダル ── */}
      {editingItemId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 w-full max-w-md flex flex-col gap-4 shadow-2xl">
            <h3 className="text-sm font-bold text-[var(--text)]">🖼 画像リンク（URL）の設定</h3>
            <p className="text-xs text-[var(--text-muted)]">
              Web上の画像URL（Amazonの書影、公式サイトの画像、Unsplashなど）を貼り付けてください。
            </p>
            <input
              type="url"
              placeholder="https://images.unsplash.com/..."
              value={editingImageUrl}
              onChange={(e) => setEditingImageUrl(e.target.value)}
              className="text-xs p-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card2)] text-[var(--text)]"
            />
            {editingImageUrl && (
              <div className="w-full h-36 rounded-xl overflow-hidden bg-black/10 border border-[var(--border)] flex items-center justify-center">
                <img src={editingImageUrl} alt="Preview" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setEditingItemId(null);
                  setEditingImageUrl('');
                }}
                className="text-xs px-3 py-1.5 rounded-lg bg-[var(--bg-card2)] text-[var(--text-sub)]"
              >
                キャンセル
              </button>
              <button
                onClick={() => handleSaveImageUrl(editingItemId, activeSubTab === 'viewing')}
                className="text-xs px-4 py-1.5 rounded-lg font-semibold bg-[var(--accent)] text-white"
              >
                保存する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── カードグリッド表示（読書・洋服・家電・視聴） ── */}
      {activeSubTab !== 'viewing' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredReceipts.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden flex flex-col transition-all hover:border-[var(--accent)] shadow-sm"
            >
              {/* 画像エリア */}
              <div className="relative w-full h-44 bg-[var(--bg-card2)] overflow-hidden group">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-[var(--text-muted)] bg-gradient-to-br from-slate-800 to-slate-900">
                    <span className="text-3xl">
                      {item.category === 'clothes' ? '👕' : item.category === 'gadget' ? '🔌' : '📚'}
                    </span>
                    <span className="text-xs font-medium">{item.store}</span>
                  </div>
                )}

                {/* 価値バッジ（直接変更可能） ＆ シーズンバッジ */}
                <div className="absolute top-2.5 left-2.5 flex flex-wrap items-center gap-1.5 z-10">
                  <select
                    value={item.valueTag || 'none'}
                    onChange={(e) => handleChangeValueTagReceipt(item.id, e.target.value as ValueTag)}
                    className="text-[10px] px-2 py-0.5 rounded-md font-bold text-white shadow backdrop-blur cursor-pointer border-0 outline-none"
                    style={{ backgroundColor: VALUE_TAGS[item.valueTag]?.color || '#94a3b8' }}
                    title="価値タグを変更（Well-being / Ownership / なし）"
                  >
                    <option value="well-being">🌿 Well-being</option>
                    <option value="ownership">🧭 Ownership</option>
                    <option value="none">⚪ なし</option>
                  </select>
                  {item.category === 'clothes' && item.season && (
                    <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-black/60 text-white backdrop-blur shadow">
                      {item.season === 'winter' ? '❄️ 冬' : item.season === 'summer' ? '☀️ 夏' : '🔄 オール'}
                    </span>
                  )}
                </div>

                {/* 右上：削除ボタン */}
                <button
                  onClick={() => handleDeleteReceipt(item.id)}
                  title="削除（ゴミ箱へ移動）"
                  className="absolute top-2.5 right-2.5 w-7 h-7 rounded-lg bg-black/60 hover:bg-rose-600 backdrop-blur text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-all shadow"
                >
                  🗑
                </button>

                {/* 画像編集ボタン */}
                <button
                  onClick={() => {
                    setEditingItemId(item.id);
                    setEditingImageUrl(item.imageUrl || '');
                  }}
                  className="absolute bottom-2.5 right-2.5 text-[11px] px-2 py-1 rounded-lg bg-black/60 backdrop-blur text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  📷 画像リンク編集
                </button>
              </div>

              {/* カード本文 */}
              <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      📅 買った日: {item.date}
                    </span>
                    <span className="text-sm font-bold text-[var(--text)] tabular-nums">
                      ¥{item.amount.toLocaleString()}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-[var(--text)] leading-snug line-clamp-2">
                    {item.name}
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">{item.store}</p>
                  {item.notes && (
                    <p className="text-xs text-[var(--text-sub)] bg-[var(--bg-card2)] p-2 rounded-lg leading-relaxed line-clamp-3">
                      💡 {item.notes}
                    </p>
                  )}
                </div>

                {/* 下部操作バー（評価 ＆ カテゴリ再振り分け移動） */}
                <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between gap-2">
                  {/* 4段階評価 */}
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4].map((star) => (
                      <button
                        key={star}
                        onClick={() => handleUpdateReceipt(item.id, { rating: star })}
                        title={`評価: ${star}/4`}
                        className={`text-sm px-0.5 transition-transform hover:scale-125 ${
                          star <= (item.rating ?? 0) ? 'text-amber-500' : 'text-slate-300 dark:text-slate-700'
                        }`}
                      >
                        ★
                      </button>
                    ))}
                    <span className="text-[10px] text-[var(--text-muted)] ml-1">
                      {item.rating ? `${item.rating}/4` : ''}
                    </span>
                  </div>

                  {/* 洋服の場合：シーズンクイック切り替え */}
                  {item.category === 'clothes' && (
                    <select
                      value={item.season || 'all'}
                      onChange={(e) => handleChangeSeason(item.id, e.target.value as ClothingSeason)}
                      className="text-[10px] px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card2)] text-[var(--text-sub)] font-semibold cursor-pointer hover:border-[var(--accent)]"
                      title="季節を変更"
                    >
                      <option value="all">🔄 オール</option>
                      <option value="winter">❄️ 冬</option>
                      <option value="summer">☀️ 夏</option>
                      <option value="spring_autumn">🍂 春秋</option>
                    </select>
                  )}

                  {/* カテゴリ移動（振り分け間違い修正用） */}
                  <div className="flex items-center gap-1">
                    <select
                      value={item.category}
                      onChange={(e) => handleChangeCategory(item.id, e.target.value as InventoryCategory)}
                      className="text-[10px] px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card2)] text-[var(--text-sub)] font-medium cursor-pointer hover:border-[var(--accent)]"
                      title="別のカテゴリへ移動"
                    >
                      <option value="clothes">👕 洋服へ</option>
                      <option value="book">📚 読書へ</option>
                      <option value="gadget">🔌 家電へ</option>
                    </select>

                    {/* 本の場合は読了ボタン */}
                    {item.category === 'book' && (
                      <button
                        onClick={() => handleUpdateReceipt(item.id, { isFinished: !item.isFinished })}
                        className={`text-[10px] px-2 py-1 rounded-lg font-medium ${
                          item.isFinished ? 'bg-emerald-500/10 text-emerald-500 font-bold' : 'bg-[var(--bg-card2)] text-[var(--text-muted)]'
                        }`}
                      >
                        {item.isFinished ? '読了' : '未読'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── 🎬 視聴ロググリッド ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredViewings.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden flex flex-col transition-all hover:border-[var(--accent)] shadow-sm"
            >
              <div className="relative w-full h-44 bg-[var(--bg-card2)] overflow-hidden group">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-[var(--text-muted)] bg-gradient-to-br from-indigo-950 to-slate-900">
                    <span className="text-3xl">🎬</span>
                    <span className="text-xs">{item.platform}</span>
                  </div>
                )}
                <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10">
                  <select
                    value={item.valueTag || 'none'}
                    onChange={(e) => handleChangeValueTagViewing(item.id, e.target.value as ValueTag)}
                    className="text-[10px] px-2 py-0.5 rounded-md font-bold text-white shadow backdrop-blur cursor-pointer border-0 outline-none"
                    style={{ backgroundColor: VALUE_TAGS[item.valueTag]?.color || '#94a3b8' }}
                    title="価値タグを変更（Well-being / Ownership / なし）"
                  >
                    <option value="well-being">🌿 Well-being</option>
                    <option value="ownership">🧭 Ownership</option>
                    <option value="none">⚪ なし</option>
                  </select>
                  <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-black/60 text-white shadow">
                    {item.platform}
                  </span>
                </div>
                {/* 削除ボタン */}
                <button
                  onClick={() => handleDeleteViewing(item.id)}
                  title="削除（ゴミ箱へ移動）"
                  className="absolute top-2.5 right-2.5 w-7 h-7 rounded-lg bg-black/60 hover:bg-rose-600 backdrop-blur text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-all shadow"
                >
                  🗑
                </button>
                {/* 画像編集ボタン */}
                <button
                  onClick={() => {
                    setEditingItemId(item.id);
                    setEditingImageUrl(item.imageUrl || '');
                  }}
                  className="absolute bottom-2.5 right-2.5 text-[11px] px-2 py-1 rounded-lg bg-black/60 backdrop-blur text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  📷 画像リンク編集
                </button>
              </div>

              <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1">
                      📅 みた日: {item.date}
                    </span>
                    <span className="font-bold text-[var(--text-sub)]">{item.durationMin}分</span>
                  </div>
                  <h3 className="text-sm font-bold text-[var(--text)] leading-snug line-clamp-2">
                    {item.title}
                  </h3>
                  {item.notes && (
                    <p className="text-xs text-[var(--text-sub)] bg-[var(--bg-card2)] p-2 rounded-lg leading-relaxed line-clamp-3">
                      💡 {item.notes}
                    </p>
                  )}
                </div>

                <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between">
                  <span className="text-xs text-[var(--text-muted)]">評価:</span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4].map((star) => (
                      <button
                        key={star}
                        onClick={() => handleUpdateViewing(item.id, { rating: star })}
                        title={`評価: ${star}/4`}
                        className={`text-sm px-0.5 transition-transform hover:scale-125 ${
                          star <= (item.rating ?? 0) ? 'text-amber-500' : 'text-slate-300 dark:text-slate-700'
                        }`}
                      >
                        ★
                      </button>
                    ))}
                    <span className="text-[11px] text-[var(--text-sub)] ml-1 font-semibold">
                      {item.rating ? `${item.rating}/4` : '未評価'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 🗑 削除したアイテム（誤削除防止・復元用） ── */}
      {totalDeletedCount > 0 && (
        <Card
          title={`🗑 削除したアイテム (${totalDeletedCount}件)`}
          action={
            <button
              onClick={() => setShowDeletedSection(!showDeletedSection)}
              className="text-xs px-2.5 py-1 rounded-lg bg-[var(--bg-card2)] text-[var(--text-sub)] hover:text-[var(--text)] transition-colors"
            >
              {showDeletedSection ? '▲ 閉じる' : '▼ 削除アイテムを表示・復元'}
            </button>
          }
        >
          {showDeletedSection && (
            <div className="flex flex-col gap-3 pt-2">
              <p className="text-xs text-[var(--text-muted)]">
                間違えて削除したアイテムは「↩ 復元」ボタンで元のリストに戻せます。
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {deletedReceipts.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card2)]/60 flex items-center justify-between gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/20 text-[var(--text-muted)]">
                          {item.category === 'book' ? '読書' : item.category === 'clothes' ? '洋服' : '家電'}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)]">{item.date}</span>
                      </div>
                      <p className="text-xs font-bold text-[var(--text)] truncate">{item.name}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">¥{item.amount.toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleRestoreReceipt(item.id)}
                        className="text-xs px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold hover:bg-emerald-500/20 transition-colors"
                      >
                        ↩ 復元
                      </button>
                      <button
                        onClick={() => handlePermanentDeleteReceipt(item.id)}
                        className="text-xs px-2 py-1 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors"
                        title="完全削除"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}

                {deletedViewings.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card2)]/60 flex items-center justify-between gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/20 text-[var(--text-muted)]">
                          {item.platform}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)]">{item.date}</span>
                      </div>
                      <p className="text-xs font-bold text-[var(--text)] truncate">{item.title}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">{item.durationMin}分</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleRestoreViewing(item.id)}
                        className="text-xs px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold hover:bg-emerald-500/20 transition-colors"
                      >
                        ↩ 復元
                      </button>
                      <button
                        onClick={() => handlePermanentDeleteViewing(item.id)}
                        className="text-xs px-2 py-1 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors"
                        title="完全削除"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
