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
  saveItemOverride,
  loadUserOverrides,
  parseReceiptCSV,
  parseImportCSV,
  computeMonthlyTrends,
  INVENTORY_CATEGORIES,
  VALUE_TAGS,
  CLOTHING_SEASONS,
  CLOTHING_CATEGORIES,
  GEMINI_IMPORT_PROMPT,
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

  // クラウド同期（MacBook ⇆ iPhone）用状態
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [cloudUpdatedAt, setCloudUpdatedAt] = useState<string | null>(null);
  const [cloudHistory, setCloudHistory] = useState<{ id: string; createdAt: string; label: string; receiptCount: number; viewingCount: number }[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // クラウドへバックグラウンド自動保存（スナップショット履歴付き）
  const autoPushToCloud = async (
    overrideReceipts?: ReceiptItem[],
    overrideViewings?: ViewingItem[],
    label = '自動同期',
    showAlert = false
  ) => {
    setCloudSyncStatus('syncing');
    try {
      const payload = {
        receipts: overrideReceipts || receipts,
        viewings: overrideViewings || viewings,
        overrides: loadUserOverrides(),
        updatedBy: typeof window !== 'undefined' && navigator.userAgent.includes('Macintosh') ? 'MacBook' : 'iPhone',
        label,
      };
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.ok) {
        setCloudSyncStatus('synced');
        setCloudUpdatedAt(json.data.updatedAt);
        if (json.history) setCloudHistory(json.history);
        if (showAlert) {
          alert('✅ クラウドDBへ保存しました！');
        }
      } else {
        setCloudSyncStatus('error');
      }
    } catch {
      setCloudSyncStatus('error');
    }
  };

  // クラウドから最新データを取得・自動同期
  const handlePullFromCloud = async (silent = false) => {
    if (!silent) setCloudSyncStatus('syncing');
    try {
      const res = await fetch('/api/inventory');
      const json = await res.json();
      if (json.ok && json.data) {
        const cloudData = json.data;
        if (Array.isArray(cloudData.receipts) && Array.isArray(cloudData.viewings)) {
          setReceipts(cloudData.receipts);
          setViewings(cloudData.viewings);
          saveReceiptItems(cloudData.receipts);
          saveViewingItems(cloudData.viewings);
          if (cloudData.overrides) {
            localStorage.setItem('life_user_overrides_v1', JSON.stringify(cloudData.overrides));
          }
          setCloudSyncStatus('synced');
          setCloudUpdatedAt(cloudData.updatedAt);
          if (json.history) setCloudHistory(json.history);
          if (!silent) {
            alert(`✅ クラウドから最新データを同期しました！\n・購入アイテム: ${cloudData.receipts.length} 件\n・視聴ログ: ${cloudData.viewings.length} 件\n(更新元: ${cloudData.updatedBy || 'クラウド'})`);
          }
        }
      } else {
        if (!silent) {
          alert('クラウドにデータがありません。');
        }
      }
    } catch (e: any) {
      if (!silent) {
        setCloudSyncStatus('error');
        alert('クラウド同期エラー: ' + e.message);
      }
    }
  };

  // スナップショット復元（過去の状態に戻す）
  const handleRestoreSnapshot = async (snapshotId: string, label: string, createdAt: string) => {
    const dateStr = new Date(createdAt).toLocaleString('ja-JP');
    if (!confirm(`【${dateStr}】時点の状態に戻しますか？\n現在のデータはその時点のデータに上書き復元されます。`)) {
      return;
    }
    setCloudSyncStatus('syncing');
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', snapshotId }),
      });
      const json = await res.json();
      if (json.ok && json.data) {
        const restored = json.data;
        setReceipts(restored.receipts);
        setViewings(restored.viewings);
        saveReceiptItems(restored.receipts);
        saveViewingItems(restored.viewings);
        if (restored.overrides) {
          localStorage.setItem('life_user_overrides_v1', JSON.stringify(restored.overrides));
        }
        setCloudSyncStatus('synced');
        setCloudUpdatedAt(restored.updatedAt);
        if (json.history) setCloudHistory(json.history);
        setShowHistoryModal(false);
        alert(`✅ 【${dateStr}】の状態に復元しました！`);
      } else {
        alert('復元に失敗しました: ' + (json.error || '不明なエラー'));
      }
    } catch (e: any) {
      alert('復元エラー: ' + e.message);
    }
  };

  // Daily Log 反映用
  const [showDailyLogModal, setShowDailyLogModal] = useState(false);
  const [dailyLogInput, setDailyLogInput] = useState('');
  const [matchSummary, setMatchSummary] = useState<MatchResult | null>(null);

  // ── AI仕分け（Gemini 3.6 Flash）＆ 取り込み前プレビュー用状態 ──
  const [isClassifying, setIsClassifying] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [pendingClassifiedItems, setPendingClassifiedItems] = useState<{
    id: string;
    date: string;
    store: string;
    name: string;
    amount: number;
    category: InventoryCategory;
    valueTag: ValueTag;
    author?: string;
    publishedDate?: string;
    clothingCategory?: ClothingCategory;
    season?: ClothingSeason;
    selected?: boolean;
  }[]>([]);
  const [classifyStats, setClassifyStats] = useState<{ total: number; skipped: number }>({ total: 0, skipped: 0 });

  // ── カードごとのフル編集用状態 ──
  const [editingReceiptItem, setEditingReceiptItem] = useState<ReceiptItem | null>(null);
  const [showReceiptEditModal, setShowReceiptEditModal] = useState(false);

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
  const [manualAuthor, setManualAuthor] = useState('');
  const [manualPublishedDate, setManualPublishedDate] = useState('');

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
        author: manualCategory === 'book' ? manualAuthor.trim() || undefined : undefined,
        publishedDate: manualCategory === 'book' ? manualPublishedDate.trim() || undefined : undefined,
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
    setManualAuthor('');
    setManualPublishedDate('');
    setShowManualModal(false);
    alert('アイテムを追加しました！');
  };

  // ── AI仕分け（Gemini 3.6 Flash）の実行 ──
  const handleClassifyCSV = async (text: string) => {
    if (!text.trim()) {
      alert('CSVテキストが空です。');
      return;
    }
    setIsClassifying(true);
    try {
      const res = await fetch('/api/inventory/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText: text }),
      });
      const json = await res.json();
      if (json.ok && Array.isArray(json.items)) {
        if (json.items.length === 0) {
          alert(`対象となるアイテム（洋服・本・家電）が見つかりませんでした。\n（※生活費・食費など ${json.skippedCount || 0} 件が安全に除外されました）`);
          setIsClassifying(false);
          return;
        }
        setPendingClassifiedItems(json.items);
        setClassifyStats({ total: json.totalInputLines || json.items.length, skipped: json.skippedCount || 0 });
        setShowImport(false);
        setShowReviewModal(true);
      } else {
        alert('AI仕分けエラー: ' + (json.error || '不明なエラー'));
      }
    } catch (e: any) {
      alert('通信エラー: ' + e.message);
    } finally {
      setIsClassifying(false);
    }
  };

  // ── 取り込み前プレビューの確定 ──
  const handleConfirmReviewImport = () => {
    const selected = pendingClassifiedItems.filter((it) => it.selected);
    if (selected.length === 0) {
      alert('取り込むアイテムが1つも選択されていません。');
      return;
    }

    const newReceiptItems: ReceiptItem[] = selected.map((it) => ({
      id: it.id || `rc-gen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: it.date,
      store: it.store,
      name: it.name,
      amount: it.amount,
      category: it.category,
      valueTag: it.valueTag,
      author: it.author,
      publishedDate: it.publishedDate,
      clothingCategory: it.clothingCategory,
      season: it.season,
    }));

    const nextReceipts = [...newReceiptItems, ...receipts];
    setReceipts(nextReceipts);
    saveReceiptItems(nextReceipts);

    // 永続オーバーライドにも著者名・発行年月・カテゴリを保存
    newReceiptItems.forEach((it) => {
      saveItemOverride(it.id, it.name, {
        author: it.author,
        publishedDate: it.publishedDate,
        category: it.category,
        season: it.season,
        clothingCategory: it.clothingCategory,
        valueTag: it.valueTag,
      });
    });

    setShowReviewModal(false);
    setPendingClassifiedItems([]);
    setCsvText('');

    // クラウド自動保存＆スナップショット
    autoPushToCloud(nextReceipts, viewings, 'AI-CSV取り込み');
    alert(`✅ ${newReceiptItems.length} 件のアイテムを取り込みました！\n（クラウドへ自動保存されました）`);
  };

  // ── アイテム情報のフル編集保存 ──
  const handleSaveReceiptEdit = () => {
    if (!editingReceiptItem) return;
    const updated = receipts.map((r) => (r.id === editingReceiptItem.id ? editingReceiptItem : r));
    setReceipts(updated);
    saveReceiptItems(updated);

    // 永続オーバーライド
    saveItemOverride(editingReceiptItem.id, editingReceiptItem.name, {
      name: editingReceiptItem.name,
      category: editingReceiptItem.category,
      store: editingReceiptItem.store,
      date: editingReceiptItem.date,
      amount: editingReceiptItem.amount,
      valueTag: editingReceiptItem.valueTag,
      notes: editingReceiptItem.notes,
      imageUrl: editingReceiptItem.imageUrl,
      author: editingReceiptItem.author,
      publishedDate: editingReceiptItem.publishedDate,
      season: editingReceiptItem.season,
      clothingCategory: editingReceiptItem.clothingCategory,
    });

    autoPushToCloud(updated, viewings, `編集: ${editingReceiptItem.name}`);
    setShowReceiptEditModal(false);
    setEditingReceiptItem(null);
    alert('✅ アイテム情報を更新しました！');
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

  // 初期ロード（過去データ反映 ＆ クラウド最新データ自動同期）
  useEffect(() => {
    setReceipts(loadReceiptItems());
    setViewings(loadViewingItems());

    // 画面を開いた時に自動でクラウドから最新データを取得・同期
    handlePullFromCloud(true);
  }, []);

  // 月別推移（時系列）の計算
  const monthlyTrends = useMemo(() => computeMonthlyTrends(receipts, viewings), [receipts, viewings]);

  // アイテム更新（レシート：画像やメモ変更を確実に保護）
  const handleUpdateReceipt = (id: string, updates: Partial<ReceiptItem>) => {
    const item = receipts.find((r) => r.id === id);
    if (item) {
      saveItemOverride(id, item.name, {
        ...(updates.imageUrl !== undefined && { imageUrl: updates.imageUrl }),
        ...(updates.rating !== undefined && { rating: updates.rating }),
        ...(updates.notes !== undefined && { notes: updates.notes }),
        ...(updates.valueTag !== undefined && { valueTag: updates.valueTag }),
        ...(updates.season !== undefined && { season: updates.season }),
        ...(updates.clothingCategory !== undefined && { clothingCategory: updates.clothingCategory }),
        ...(updates.category !== undefined && { category: updates.category }),
      });
    }
    const next = receipts.map((r) => (r.id === id ? { ...r, ...updates } : r));
    setReceipts(next);
    saveReceiptItems(next);
  };

  // アイテム更新（視聴：画像やメモ変更を確実に保護）
  const handleUpdateViewing = (id: string, updates: Partial<ViewingItem>) => {
    const item = viewings.find((v) => v.id === id);
    if (item) {
      saveItemOverride(id, item.title.trim(), {
        ...(updates.imageUrl !== undefined && { imageUrl: updates.imageUrl }),
        ...(updates.rating !== undefined && { rating: updates.rating }),
        ...(updates.notes !== undefined && { notes: updates.notes }),
        ...(updates.valueTag !== undefined && { valueTag: updates.valueTag }),
        ...(updates.durationMin !== undefined && { durationMin: updates.durationMin }),
      });
    }
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

  // ファイルインポート（ファイル選択時は自動でGemini AI高精度仕分けを実行）
  const handleFileImport = async (files: File[]) => {
    if (files.length === 0) return;
    const file = files[0];
    const text = await file.text();
    setCsvText(text);
    handleClassifyCSV(text);
  };

  // テキストインポート（購入・視聴ログ両対応 ＆ 食費・生活費除外 ＆ 自動クラウド保存）
  const handleImportCSV = () => {
    if (!csvText.trim()) return;
    const { receipts: newR, viewings: newV, skippedCount } = parseImportCSV(csvText);
    if (newR.length === 0 && newV.length === 0) {
      alert(`有効なアイテムを読み込めませんでした。形式を確認してください。${skippedCount > 0 ? `\n（※生活費・食費・日用品 ${skippedCount} 件が安全にスキップされました）` : ''}`);
      return;
    }
    let updatedReceipts = receipts;
    let updatedViewings = viewings;
    if (newR.length > 0) {
      updatedReceipts = [...newR, ...receipts];
      setReceipts(updatedReceipts);
      saveReceiptItems(updatedReceipts);
    }
    if (newV.length > 0) {
      updatedViewings = [...newV, ...viewings];
      setViewings(updatedViewings);
      saveViewingItems(updatedViewings);
    }
    setCsvText('');
    setShowImport(false);
    // 自動でクラウドにも保存＆スナップショット記録
    autoPushToCloud(updatedReceipts, updatedViewings, 'テキストCSV取り込み');
    const skipMsg = skippedCount > 0 ? `\n・生活費・食費・日用品・交通費（スキップ除外）: ${skippedCount} 件` : '';
    alert(`取り込み完了！\n・購入アイテム: ${newR.length} 件\n・視聴ログ: ${newV.length} 件${skipMsg}\n\n☁️ クラウドへ自動同期しました（他端末でも自動反映されます）。`);
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

  // 視聴ログのインライン編集用状態
  const [editingViewingGroupTitle, setEditingViewingGroupTitle] = useState<string | null>(null);
  const [editingViewingDuration, setEditingViewingDuration] = useState<string>('0');
  const [editingViewingNotes, setEditingViewingNotes] = useState<string>('');

  // 複数エピソードのアコーディオン展開状態
  const [expandedViewingGroups, setExpandedViewingGroups] = useState<Record<string, boolean>>({});

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

  // タイトルごとに集約した視聴ログ（同じタイトルは合算）
  const groupedViewings = useMemo(() => {
    const map = new Map<string, ViewingItem[]>();
    for (const v of filteredViewings) {
      const key = v.title.trim();
      const list = map.get(key) || [];
      list.push(v);
      map.set(key, list);
    }

    const groups: {
      title: string;
      items: ViewingItem[];
      totalDurationMin: number;
      latestDate: string;
      earliestDate: string;
      platform: string;
      valueTag: ValueTag;
      rating?: number;
      imageUrl?: string;
      notes?: string;
    }[] = [];

    for (const [title, list] of map.entries()) {
      const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date));
      const totalDurationMin = sorted.reduce((sum, it) => sum + (it.durationMin || 0), 0);
      const latestDate = sorted[0].date;
      const earliestDate = sorted[sorted.length - 1].date;
      const platform = sorted[0].platform || 'Prime Video';

      const hasWb = sorted.some((it) => it.valueTag === 'well-being');
      const hasOs = sorted.some((it) => it.valueTag === 'ownership');
      const valueTag: ValueTag = hasWb ? 'well-being' : hasOs ? 'ownership' : (sorted[0].valueTag || 'none');

      const rating = sorted.find((it) => it.rating !== undefined && it.rating > 0)?.rating;
      const imageUrl = sorted.find((it) => it.imageUrl)?.imageUrl;
      const notes = sorted.find((it) => it.notes)?.notes;

      groups.push({
        title,
        items: sorted,
        totalDurationMin,
        latestDate,
        earliestDate,
        platform,
        valueTag,
        rating,
        imageUrl,
        notes,
      });
    }

    return groups.sort((a, b) => b.latestDate.localeCompare(a.latestDate));
  }, [filteredViewings]);

  // 視聴グループの価値タグ一括更新
  const handleChangeValueTagViewingGroup = (groupTitle: string, tag: ValueTag) => {
    saveItemOverride(groupTitle, groupTitle, { valueTag: tag });
    const next = viewings.map((v) => (v.title.trim() === groupTitle ? { ...v, valueTag: tag } : v));
    setViewings(next);
    saveViewingItems(next);
  };

  // 視聴グループの評価一括更新
  const handleUpdateViewingGroupRating = (groupTitle: string, rating: number) => {
    saveItemOverride(groupTitle, groupTitle, { rating });
    const next = viewings.map((v) => (v.title.trim() === groupTitle ? { ...v, rating } : v));
    setViewings(next);
    saveViewingItems(next);
  };

  // 視聴グループ削除（全エピソードをゴミ箱へ）
  const handleDeleteViewingGroup = (groupTitle: string) => {
    const next = viewings.map((v) => (v.title.trim() === groupTitle ? { ...v, deleted: true } : v));
    setViewings(next);
    saveViewingItems(next);
  };

  // 視聴グループの編集開始
  const handleStartEditingViewingGroup = (group: {
    title: string;
    totalDurationMin: number;
    notes?: string;
  }) => {
    setEditingViewingGroupTitle(group.title);
    setEditingViewingDuration(String(group.totalDurationMin));
    setEditingViewingNotes(group.notes || '');
  };

  // 視聴グループの編集保存（視聴時間合算値 ＆ 感想）
  const handleSaveViewingGroupEdit = (groupTitle: string) => {
    const targetItems = viewings.filter((v) => !v.deleted && v.title.trim() === groupTitle);
    if (targetItems.length === 0) {
      setEditingViewingGroupTitle(null);
      return;
    }

    const currentTotal = targetItems.reduce((sum, v) => sum + (v.durationMin || 0), 0);
    const parsedDuration = parseInt(editingViewingDuration.replace(/[^\d]/g, ''), 10);
    const newTotal = isNaN(parsedDuration) ? 0 : Math.max(0, parsedDuration);
    const diff = newTotal - currentTotal;
    const sorted = [...targetItems].sort((a, b) => b.date.localeCompare(a.date));
    const latestId = sorted[0].id;

    saveItemOverride(groupTitle, groupTitle, {
      notes: editingViewingNotes.trim() || undefined,
      durationMin: newTotal,
    });

    const next = viewings.map((v) => {
      if (v.title.trim() !== groupTitle || v.deleted) return v;

      if (sorted.length === 1) {
        return {
          ...v,
          durationMin: newTotal,
          notes: editingViewingNotes.trim() || undefined,
        };
      }

      // 複数エピソードがある場合：最新回に差分を反映、感想も最新回に保存
      if (v.id === latestId) {
        return {
          ...v,
          durationMin: Math.max(0, (v.durationMin || 0) + diff),
          notes: editingViewingNotes.trim() || undefined,
        };
      }

      return v;
    });

    setViewings(next);
    saveViewingItems(next);
    setEditingViewingGroupTitle(null);
  };

  // 画像URL保存（絶対に消えないオーバーライド保存連動）
  const handleSaveImageUrl = (idOrTitle: string | null, isViewing: boolean) => {
    if (!idOrTitle) return;
    const trimmed = editingImageUrl.trim();

    if (isViewing) {
      saveItemOverride(idOrTitle, idOrTitle, { imageUrl: trimmed || undefined });
      const next = viewings.map((v) =>
        v.id === idOrTitle || v.title.trim() === idOrTitle
          ? { ...v, imageUrl: trimmed || undefined }
          : v
      );
      setViewings(next);
      saveViewingItems(next);
    } else {
      const item = receipts.find((r) => r.id === idOrTitle || r.name === idOrTitle);
      if (item) {
        saveItemOverride(item.id, item.name, { imageUrl: trimmed || undefined });
      } else {
        saveItemOverride(idOrTitle, idOrTitle, { imageUrl: trimmed || undefined });
      }
      const next = receipts.map((r) =>
        r.id === idOrTitle || r.name === idOrTitle
          ? { ...r, imageUrl: trimmed || undefined }
          : r
      );
      setReceipts(next);
      saveReceiptItems(next);
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
      {/* ── ☁️ クラウド同期コントロールバー（MacBook ⇆ iPhone リアルタイム共有） ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center text-base">
            ☁️
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-[var(--text)] flex items-center gap-1.5">
              <span>クラウド同期（MacBook ⇆ iPhone）</span>
              {cloudSyncStatus === 'syncing' && <span className="text-[10px] text-amber-500 font-semibold animate-pulse">● 同期中...</span>}
              {cloudSyncStatus === 'synced' && <span className="text-[10px] text-emerald-500 font-semibold">● 接続完了</span>}
              {cloudSyncStatus === 'error' && <span className="text-[10px] text-rose-500 font-semibold">● エラー</span>}
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">
              {cloudUpdatedAt
                ? `最終クラウド同期: ${new Date(cloudUpdatedAt).toLocaleString('ja-JP')}（同一データを全端末で共有中）`
                : 'MacBookのデータをマスターとしてクラウドに保存し、iPhoneでも閲覧・同期できます'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => autoPushToCloud(receipts, viewings, '手動マスター保存', true)}
            disabled={cloudSyncStatus === 'syncing'}
            className="text-xs px-3.5 py-2 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white shadow transition-all flex items-center gap-1.5"
            title="現在のこのMacのデータをクラウドのマスターデータとして保存します"
          >
            <span>💻</span>
            <span>このMacのデータをマスターとして保存</span>
          </button>
          <button
            type="button"
            onClick={() => handlePullFromCloud(false)}
            disabled={cloudSyncStatus === 'syncing'}
            className="text-xs px-3.5 py-2 rounded-xl font-semibold bg-[var(--bg-card2)] hover:bg-[var(--accent)] text-[var(--text)] hover:text-white border border-[var(--border)] transition-all flex items-center gap-1.5"
            title="クラウドDBから最新データを読み込みます（iPhoneでの読み込み時に使用）"
          >
            <span>🔄</span>
            <span>クラウドから同期</span>
          </button>
          <button
            type="button"
            onClick={() => setShowHistoryModal(true)}
            className="text-xs px-3 py-2 rounded-xl font-medium bg-[var(--bg-card2)] hover:bg-amber-500/20 text-[var(--text)] hover:text-amber-300 border border-[var(--border)] transition-all flex items-center gap-1.5"
            title="過去の保存履歴スナップショット一覧から以前の状態に戻せます"
          >
            <span>🕒</span>
            <span>履歴から戻す</span>
            {cloudHistory.length > 0 && (
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded-full font-bold">
                {cloudHistory.length}
              </span>
            )}
          </button>
        </div>
      </div>

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
          <div className="flex flex-col gap-3 pt-1">
            {/* 🛡️ 自動除外セーフティ説明 */}
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-[var(--text-sub)] flex items-start gap-2">
              <span className="text-base leading-none">🛡️</span>
              <p className="leading-relaxed">
                <strong className="text-emerald-600 dark:text-emerald-400 font-bold">生活費自動スキップ機能が有効です：</strong>
                コンビニ、スーパー、外食、カフェ、ドラッグストア、日用品、Suica、公共料金などは自動で検知して安全に除外されます。洋服や読書に混ざる心配はありません。
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-xs font-bold text-[var(--text)]">📝 テキスト貼り付けで取り込む</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(GEMINI_IMPORT_PROMPT);
                        alert('【家計簿・支出CSV用 Geminiプロンプト】をコピーしました！\nGeminiに貼り付けてカードや家計簿のCSVテキストを渡してください。');
                      }}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-bold hover:bg-indigo-500 hover:text-white transition-colors"
                    >
                      📋 支出用Geminiプロンプト
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const prompt = `# 役割\nあなたはAmazon Prime Videoの視聴履歴データ抽出エキスパートです。\n提示されるAmazonプライムの視聴履歴テキストを解析し、ダッシュボード取り込み専用のCSV形式で出力してください。\n\n# 出力形式\n日付(YYYY/MM/DD),Prime Video,作品タイトル,推定時間(分),価値(Well-being または Ownership または なし)\n\n# ルール\n1. 各行に1エピソードまたは1作品を出力。\n2. 推定時間: アニメ・ドラマ1話は45分、映画は100分、バラエティ1話は50分。\n3. 余計な挨拶やコードブロック等の装飾は一切入れず、CSVテキストのみ出力。\n\n# 出力例\n2025/06/22,Prime Video,バチェラー・ジャパン シーズン６,50,Well-being\n2025/06/01,Prime Video,アプレンティス：ドナルド・トランプの創り方,100,Ownership\n2025/05/26,Prime Video,アンナチュラル,45,Well-being`;
                        navigator.clipboard.writeText(prompt);
                        alert('【Amazon Prime Video用 Geminiプロンプト】をコピーしました！\nGeminiに貼り付けて履歴テキストを渡してください。');
                      }}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-bold hover:bg-amber-500 hover:text-white transition-colors"
                    >
                      📋 Prime用プロンプト
                    </button>
                  </div>
                </div>
                <textarea
                  rows={5}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder="2025/06/22,Prime Video,バチェラー・ジャパン シーズン６,50,Well-being&#10;2026/08/10,Amazon,Insta360 Ace Pro 2,58300"
                  className="text-xs font-mono p-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-card2)] text-[var(--text)] flex-1 resize-none"
                />
                {isClassifying && (
                  <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-xs text-indigo-600 dark:text-indigo-400 flex items-center gap-2.5 animate-pulse">
                    <span className="text-base animate-spin">⏳</span>
                    <span className="leading-relaxed">
                      <strong>Gemini 3.6 Flash が購買CSVを自動解析中...</strong><br />
                      生活費・食費・日用品を安全にスキップし、洋服・本（著者名・発行年月Web補完）・家電ギアを抽出しています。
                    </span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleImportCSV}
                    disabled={!csvText.trim() || isClassifying}
                    className="text-xs px-3 py-2 rounded-xl font-medium bg-[var(--bg-card2)] text-[var(--text-sub)] hover:text-[var(--text)] border border-[var(--border)] disabled:opacity-50 transition-all"
                    title="AIを使わず、カンマ区切りテキストをそのまま即時反映します"
                  >
                    ⚡ 簡易直接取り込み
                  </button>
                  <button
                    type="button"
                    onClick={() => handleClassifyCSV(csvText)}
                    disabled={!csvText.trim() || isClassifying}
                    className="text-xs px-4 py-2 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white disabled:opacity-50 transition-all shadow flex items-center gap-1.5"
                  >
                    {isClassifying ? (
                      <>
                        <span className="animate-spin inline-block">⏳</span>
                        <span>AIが解析中...</span>
                      </>
                    ) : (
                      <>
                        <span>✨</span>
                        <span>Gemini AIで高精度仕分け（推奨）</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      
      
      {/* ── 🕒 スナップショット復元モーダル ── */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 w-full max-w-lg flex flex-col gap-4 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-base">🕒</span>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text)]">保存履歴・復元（スナップショット）</h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    CSV取り込み前や過去の状態へワンクリックでロールバックできます
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] px-2 py-1 rounded"
              >
                ✕ 閉じる
              </button>
            </div>

            {cloudHistory.length === 0 ? (
              <div className="py-8 text-center text-xs text-[var(--text-muted)] flex flex-col items-center gap-2">
                <span>📁 まだ保存履歴スナップショットがありません</span>
                <span className="text-[11px]">（CSVの取り込み時やクラウド更新時に自動的に最大10件まで履歴が作成されます）</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                <div className="text-[11px] text-[var(--text-muted)] bg-[var(--bg-card2)] p-2.5 rounded-xl border border-[var(--border)]">
                  💡 復元したい時点の「この時点に戻す」を押すと、その時の購入アイテムや視聴ログの状態に巻き戻せます。
                </div>

                <div className="space-y-2">
                  {cloudHistory.map((snap) => {
                    const snapDate = new Date(snap.createdAt);
                    const formattedDate = snapDate.toLocaleString('ja-JP', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    });

                    return (
                      <div
                        key={snap.id}
                        className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card2)]/70 hover:border-amber-500/50 transition-colors flex items-center justify-between gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-bold text-[var(--text)]">{formattedDate}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-medium">
                              {snap.label || '自動保存'}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
                            <span>購入: <strong className="text-[var(--text)]">{snap.receiptCount}</strong> 件</span>
                            <span>視聴: <strong className="text-[var(--text)]">{snap.viewingCount}</strong> 件</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRestoreSnapshot(snap.id, snap.label, snap.createdAt)}
                          className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-95 text-black font-bold text-xs shadow transition-all flex items-center gap-1 flex-shrink-0"
                        >
                          <span>↩</span>
                          <span>この時点に戻す</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-[var(--border)] flex justify-end">
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="text-xs px-4 py-2 rounded-xl bg-[var(--bg-card2)] hover:bg-[var(--border)] text-[var(--text)] font-semibold transition-colors"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ✨ AI仕分け結果の確認・プレビュー・編集モーダル ── */}
      {showReviewModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 w-full max-w-2xl flex flex-col gap-4 shadow-2xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">✨</span>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
                    <span>AI仕分け結果の確認・編集</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-bold">
                      {pendingClassifiedItems.filter((it) => it.selected).length} / {pendingClassifiedItems.length} 件選択中
                    </span>
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    生活費・食費 {classifyStats.skipped} 件が安全に除外されました。取り込むアイテムを確認・修正してください。
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] px-2 py-1 rounded"
              >
                ✕ 閉じる
              </button>
            </div>

            {/* 一括操作バー */}
            <div className="flex items-center justify-between gap-2 text-xs bg-[var(--bg-card2)] p-2.5 rounded-xl border border-[var(--border)]">
              <span className="text-[11px] text-[var(--text-sub)]">
                💡 不要な行はチェックを外すか除外できます。カテゴリや著者名の変更も可能です。
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setPendingClassifiedItems((prev) => prev.map((it) => ({ ...it, selected: true })))
                  }
                  className="text-[11px] text-indigo-500 font-bold hover:underline"
                >
                  すべて選択
                </button>
                <span className="text-[var(--border)]">|</span>
                <button
                  type="button"
                  onClick={() =>
                    setPendingClassifiedItems((prev) => prev.map((it) => ({ ...it, selected: false })))
                  }
                  className="text-[11px] text-[var(--text-muted)] hover:underline"
                >
                  すべて解除
                </button>
              </div>
            </div>

            {/* アイテム一覧 */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {pendingClassifiedItems.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className={`p-3.5 rounded-xl border transition-all flex flex-col gap-2.5 ${
                    item.selected
                      ? 'border-indigo-500/40 bg-[var(--bg-card2)]'
                      : 'border-[var(--border)] bg-[var(--bg-card2)]/40 opacity-50'
                  }`}
                >
                  {/* 上段：選択チェック ＆ カテゴリ ＆ 日付 ＆ 店舗 ＆ 金額 */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={item.selected ?? true}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setPendingClassifiedItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, selected: checked } : it))
                          );
                        }}
                        className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                      />
                      <select
                        value={item.category}
                        onChange={(e) => {
                          const cat = e.target.value as InventoryCategory;
                          setPendingClassifiedItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, category: cat } : it))
                          );
                        }}
                        className="text-xs px-2.5 py-1 rounded-lg font-bold border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] cursor-pointer"
                      >
                        <option value="book">📚 読書記録</option>
                        <option value="clothes">👕 洋服</option>
                        <option value="gadget">🔌 家電・ギア</option>
                      </select>
                      <span className="text-[11px] text-[var(--text-muted)]">{item.date}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-black/20 text-[var(--text-sub)]">
                        {item.store}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-[var(--text-muted)]">¥</span>
                        <input
                          type="number"
                          value={item.amount}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10) || 0;
                            setPendingClassifiedItems((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, amount: val } : it))
                            );
                          }}
                          className="text-xs font-bold w-20 p-1 rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] tabular-nums text-right"
                        />
                      </div>
                      <select
                        value={item.valueTag}
                        onChange={(e) => {
                          const tag = e.target.value as ValueTag;
                          setPendingClassifiedItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, valueTag: tag } : it))
                          );
                        }}
                        className="text-[10px] px-2 py-1 rounded-md font-bold border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-sub)] cursor-pointer"
                      >
                        <option value="none">⚪ なし</option>
                        <option value="well-being">🌿 Well-being</option>
                        <option value="ownership">🧭 Ownership</option>
                      </select>
                    </div>
                  </div>

                  {/* 中段：品名入力 */}
                  <div>
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        setPendingClassifiedItems((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, name } : it))
                        );
                      }}
                      className="text-xs font-bold w-full p-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)]"
                      placeholder="品名・タイトル"
                    />
                  </div>

                  {/* 下段：カテゴリ特有の詳細情報（読書なら著者・発行年月、洋服ならシーズン・種別） */}
                  {item.category === 'book' && (
                    <div className="grid grid-cols-2 gap-2 bg-[var(--bg-card)]/70 p-2.5 rounded-lg border border-[var(--border)]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-[var(--text-sub)] whitespace-nowrap">👤 著者:</span>
                        <input
                          type="text"
                          value={item.author || ''}
                          onChange={(e) => {
                            const author = e.target.value;
                            setPendingClassifiedItems((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, author } : it))
                            );
                          }}
                          placeholder="著者名（Web自動取得）"
                          className="text-xs p-1.5 rounded border border-[var(--border)] bg-[var(--bg-card2)] text-[var(--text)] flex-1 font-medium"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-[var(--text-sub)] whitespace-nowrap">📖 発行:</span>
                        <input
                          type="text"
                          value={item.publishedDate || ''}
                          onChange={(e) => {
                            const publishedDate = e.target.value;
                            setPendingClassifiedItems((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, publishedDate } : it))
                            );
                          }}
                          placeholder="例: 2021-12"
                          className="text-xs p-1.5 rounded border border-[var(--border)] bg-[var(--bg-card2)] text-[var(--text)] flex-1"
                        />
                      </div>
                    </div>
                  )}

                  {item.category === 'clothes' && (
                    <div className="grid grid-cols-2 gap-2 bg-[var(--bg-card)]/70 p-2.5 rounded-lg border border-[var(--border)]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-[var(--text-sub)]">季節:</span>
                        <select
                          value={item.season || 'all'}
                          onChange={(e) => {
                            const season = e.target.value as ClothingSeason;
                            setPendingClassifiedItems((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, season } : it))
                            );
                          }}
                          className="text-xs p-1.5 rounded border border-[var(--border)] bg-[var(--bg-card2)] text-[var(--text)] flex-1"
                        >
                          <option value="all">🔄 オールシーズン</option>
                          <option value="summer">☀️ 夏</option>
                          <option value="winter">❄️ 冬</option>
                          <option value="spring_autumn">🍂 春秋</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-[var(--text-sub)]">種別:</span>
                        <select
                          value={item.clothingCategory || 'tops'}
                          onChange={(e) => {
                            const clothingCategory = e.target.value as ClothingCategory;
                            setPendingClassifiedItems((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, clothingCategory } : it))
                            );
                          }}
                          className="text-xs p-1.5 rounded border border-[var(--border)] bg-[var(--bg-card2)] text-[var(--text)] flex-1"
                        >
                          <option value="tops">👕 トップス</option>
                          <option value="bottoms">👖 ボトムス</option>
                          <option value="outer">🧥 アウター</option>
                          <option value="shoes">👟 シューズ</option>
                          <option value="bag">🎒 バッグ</option>
                          <option value="sports_inner">🏃 スポーツ・インナー</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* フッター */}
            <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                className="text-xs px-4 py-2 rounded-xl bg-[var(--bg-card2)] text-[var(--text-sub)] hover:text-[var(--text)] font-semibold transition-colors"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleConfirmReviewImport}
                disabled={pendingClassifiedItems.filter((it) => it.selected).length === 0}
                className="text-xs px-5 py-2.5 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white shadow-lg transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                <span>✅</span>
                <span>この内容で確定（{pendingClassifiedItems.filter((it) => it.selected).length} 件を取り込む）</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ✏️ アイテム情報のフル編集モーダル ── */}
      {showReceiptEditModal && editingReceiptItem && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 w-full max-w-md flex flex-col gap-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
              <h3 className="text-sm font-bold text-[var(--text)] flex items-center gap-1.5">
                <span>✏️</span>
                <span>アイテム情報の編集</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowReceiptEditModal(false)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                ✕ 閉じる
              </button>
            </div>

            {/* カテゴリ選択（タブ移動可能） */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[var(--text-sub)]">所属カテゴリ（タブ移動）:</label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setEditingReceiptItem({ ...editingReceiptItem, category: 'clothes' })}
                  className={`text-xs py-1.5 rounded-lg font-bold transition-all ${
                    editingReceiptItem.category === 'clothes'
                      ? 'bg-[var(--accent)] text-white shadow'
                      : 'bg-[var(--bg-card2)] text-[var(--text-sub)]'
                  }`}
                >
                  👕 洋服
                </button>
                <button
                  type="button"
                  onClick={() => setEditingReceiptItem({ ...editingReceiptItem, category: 'book' })}
                  className={`text-xs py-1.5 rounded-lg font-bold transition-all ${
                    editingReceiptItem.category === 'book'
                      ? 'bg-[var(--accent)] text-white shadow'
                      : 'bg-[var(--bg-card2)] text-[var(--text-sub)]'
                  }`}
                >
                  📚 読書記録
                </button>
                <button
                  type="button"
                  onClick={() => setEditingReceiptItem({ ...editingReceiptItem, category: 'gadget' })}
                  className={`text-xs py-1.5 rounded-lg font-bold transition-all ${
                    editingReceiptItem.category === 'gadget'
                      ? 'bg-[var(--accent)] text-white shadow'
                      : 'bg-[var(--bg-card2)] text-[var(--text-sub)]'
                  }`}
                >
                  🔌 家電・ギア
                </button>
              </div>
            </div>

            {/* 品名 */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[var(--text-sub)]">品名・タイトル:</label>
              <input
                type="text"
                value={editingReceiptItem.name}
                onChange={(e) => setEditingReceiptItem({ ...editingReceiptItem, name: e.target.value })}
                className="text-xs p-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card2)] text-[var(--text)] font-bold"
              />
            </div>

            {/* 読書記録の場合：著者名 ＆ 発行年月 */}
            {editingReceiptItem.category === 'book' && (
              <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-[var(--bg-card2)] border border-[var(--border)]">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-[var(--text-sub)]">👤 著者・作者名:</label>
                  <input
                    type="text"
                    value={editingReceiptItem.author || ''}
                    onChange={(e) => setEditingReceiptItem({ ...editingReceiptItem, author: e.target.value })}
                    placeholder="例: アンディ・ウィアー"
                    className="text-xs p-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] font-medium"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-[var(--text-sub)]">📖 発行年月:</label>
                  <input
                    type="text"
                    value={editingReceiptItem.publishedDate || ''}
                    onChange={(e) => setEditingReceiptItem({ ...editingReceiptItem, publishedDate: e.target.value })}
                    placeholder="例: 2021-12"
                    className="text-xs p-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)]"
                  />
                </div>
              </div>
            )}

            {/* 洋服の場合：シーズン ＆ 種別 */}
            {editingReceiptItem.category === 'clothes' && (
              <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-[var(--bg-card2)] border border-[var(--border)]">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-[var(--text-sub)]">シーズン:</label>
                  <select
                    value={editingReceiptItem.season || 'all'}
                    onChange={(e) => setEditingReceiptItem({ ...editingReceiptItem, season: e.target.value as ClothingSeason })}
                    className="text-xs p-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)]"
                  >
                    <option value="all">🔄 オールシーズン</option>
                    <option value="summer">☀️ 夏</option>
                    <option value="winter">❄️ 冬</option>
                    <option value="spring_autumn">🍂 春秋</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-[var(--text-sub)]">種別:</label>
                  <select
                    value={editingReceiptItem.clothingCategory || 'tops'}
                    onChange={(e) => setEditingReceiptItem({ ...editingReceiptItem, clothingCategory: e.target.value as ClothingCategory })}
                    className="text-xs p-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)]"
                  >
                    <option value="tops">👕 トップス</option>
                    <option value="bottoms">👖 ボトムス</option>
                    <option value="outer">🧥 アウター</option>
                    <option value="shoes">👟 シューズ</option>
                    <option value="bag">🎒 バッグ</option>
                    <option value="sports_inner">🏃 スポーツ・インナー</option>
                  </select>
                </div>
              </div>
            )}

            {/* 日付 ＆ 店舗 */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[var(--text-sub)]">購入日:</label>
                <input
                  type="date"
                  value={editingReceiptItem.date}
                  onChange={(e) => setEditingReceiptItem({ ...editingReceiptItem, date: e.target.value })}
                  className="text-xs p-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card2)] text-[var(--text)]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[var(--text-sub)]">店舗/購入先:</label>
                <input
                  type="text"
                  value={editingReceiptItem.store}
                  onChange={(e) => setEditingReceiptItem({ ...editingReceiptItem, store: e.target.value })}
                  className="text-xs p-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card2)] text-[var(--text)]"
                />
              </div>
            </div>

            {/* 金額 ＆ 価値タグ */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[var(--text-sub)]">購入金額 (円):</label>
                <input
                  type="number"
                  value={editingReceiptItem.amount}
                  onChange={(e) => setEditingReceiptItem({ ...editingReceiptItem, amount: parseInt(e.target.value, 10) || 0 })}
                  className="text-xs p-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card2)] text-[var(--text)] font-bold tabular-nums"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[var(--text-sub)]">人生価値タグ:</label>
                <select
                  value={editingReceiptItem.valueTag}
                  onChange={(e) => setEditingReceiptItem({ ...editingReceiptItem, valueTag: e.target.value as ValueTag })}
                  className="text-xs p-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card2)] text-[var(--text)] font-semibold"
                >
                  <option value="none">⚪ なし</option>
                  <option value="well-being">🌿 Well-being</option>
                  <option value="ownership">🧭 Ownership</option>
                </select>
              </div>
            </div>

            {/* 感想・メモ */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[var(--text-sub)]">感想・メモ:</label>
              <textarea
                rows={2}
                value={editingReceiptItem.notes || ''}
                onChange={(e) => setEditingReceiptItem({ ...editingReceiptItem, notes: e.target.value })}
                placeholder="買ってよかった点や所感"
                className="text-xs p-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card2)] text-[var(--text)] resize-none"
              />
            </div>

            {/* 画像URL */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[var(--text-muted)]">画像URL:</label>
              <input
                type="url"
                value={editingReceiptItem.imageUrl || ''}
                onChange={(e) => setEditingReceiptItem({ ...editingReceiptItem, imageUrl: e.target.value })}
                placeholder="https://..."
                className="text-xs p-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card2)] text-[var(--text)]"
              />
              {editingReceiptItem.imageUrl && (
                <div className="w-full h-32 rounded-xl overflow-hidden bg-slate-900/40 border border-[var(--border)] flex items-center justify-center relative mt-1">
                  <img
                    src={editingReceiptItem.imageUrl}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 w-full h-full object-cover blur-xl opacity-25 scale-125 pointer-events-none select-none"
                    onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                  />
                  <img
                    src={editingReceiptItem.imageUrl}
                    alt="Preview"
                    className="relative z-[1] max-w-full max-h-full object-contain p-2 drop-shadow-md"
                    onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                  />
                </div>
              )}
            </div>

            {/* フッター操作 */}
            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setShowReceiptEditModal(false)}
                className="text-xs px-3 py-1.5 rounded-lg bg-[var(--bg-card2)] text-[var(--text-sub)]"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleSaveReceiptEdit}
                className="text-xs px-5 py-2 rounded-xl font-bold bg-[var(--accent)] text-white shadow"
              >
                💾 変更を保存
              </button>
            </div>
          </div>
        </div>
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

            {/* 読書記録の場合：著者名 ＆ 発行年月（任意） */}
            {manualCategory === 'book' && (
              <div className="grid grid-cols-2 gap-2.5 p-2.5 rounded-xl bg-[var(--bg-card2)] border border-[var(--border)]">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-[var(--text-sub)]">著者名（任意）:</label>
                  <input
                    type="text"
                    placeholder="例: アンディ・ウィアー"
                    value={manualAuthor}
                    onChange={(e) => setManualAuthor(e.target.value)}
                    className="text-xs p-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-[var(--text-sub)]">発行年月（任意）:</label>
                  <input
                    type="text"
                    placeholder="例: 2021-12"
                    value={manualPublishedDate}
                    onChange={(e) => setManualPublishedDate(e.target.value)}
                    className="text-xs p-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)]"
                  />
                </div>
              </div>
            )}

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
              {manualImageUrl && (
                <div className="w-full h-32 rounded-xl overflow-hidden bg-slate-900/40 border border-[var(--border)] flex items-center justify-center relative mt-1.5">
                  <img
                    src={manualImageUrl}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 w-full h-full object-cover blur-xl opacity-25 scale-125 pointer-events-none select-none"
                    onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                  />
                  <img
                    src={manualImageUrl}
                    alt="Preview"
                    className="relative z-[1] max-w-full max-h-full object-contain p-2 drop-shadow-md"
                    onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                  />
                </div>
              )}
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
              <div className="w-full h-44 rounded-xl overflow-hidden bg-slate-900/40 border border-[var(--border)] flex items-center justify-center relative">
                <img
                  src={editingImageUrl}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 w-full h-full object-cover blur-xl opacity-25 scale-125 pointer-events-none select-none"
                  onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                />
                <img
                  src={editingImageUrl}
                  alt="Preview"
                  className="relative z-[1] max-w-full max-h-full object-contain p-2 drop-shadow-md"
                  onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                />
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
              <div className="relative w-full h-48 bg-slate-900/30 dark:bg-black/30 overflow-hidden group flex items-center justify-center">
                {item.imageUrl ? (
                  <>
                    <img
                      src={item.imageUrl}
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 w-full h-full object-cover blur-xl opacity-25 scale-125 pointer-events-none select-none"
                      onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                    />
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="relative z-[1] max-w-full max-h-full object-contain p-2 transition-transform duration-300 group-hover:scale-105 drop-shadow-md"
                      loading="lazy"
                      onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                    />
                  </>
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

                {/* 編集ボタン */}
                <button
                  type="button"
                  onClick={() => {
                    setEditingReceiptItem({ ...item });
                    setShowReceiptEditModal(true);
                  }}
                  className="absolute bottom-2.5 left-2.5 text-[11px] px-2.5 py-1 rounded-lg bg-black/70 hover:bg-black text-white opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-all backdrop-blur shadow flex items-center gap-1 z-10 font-bold"
                  title="アイテム情報を編集（品名・カテゴリ・著者・金額など）"
                >
                  ✏️ 編集
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

                  {/* 読書記録の場合：著者名 ＆ 発行年月 */}
                  {item.category === 'book' && (item.author || item.publishedDate) && (
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[var(--text-sub)] bg-[var(--bg-card2)]/80 px-2.5 py-1.5 rounded-lg border border-[var(--border)]">
                      {item.author && (
                        <span className="flex items-center gap-1 font-bold text-[var(--text)]">
                          <span className="text-[11px]">👤</span>
                          <span>{item.author}</span>
                        </span>
                      )}
                      {item.publishedDate && (
                        <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] font-medium">
                          <span>📖</span>
                          <span>発行: {item.publishedDate}</span>
                        </span>
                      )}
                    </div>
                  )}

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
        /* ── 🎬 視聴ロググリッド（同じタイトルは合算・編集対応） ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groupedViewings.map((group) => {
            const isEditing = editingViewingGroupTitle === group.title;
            const isExpanded = !!expandedViewingGroups[group.title];
            const hasMultiple = group.items.length > 1;

            return (
              <div
                key={group.title}
                className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden flex flex-col transition-all hover:border-[var(--accent)] shadow-sm"
              >
                {/* 画像エリア */}
                <div className="relative w-full h-48 bg-slate-900/30 dark:bg-black/30 overflow-hidden group flex items-center justify-center">
                  {group.imageUrl ? (
                    <>
                      <img
                        src={group.imageUrl}
                        alt=""
                        aria-hidden="true"
                        className="absolute inset-0 w-full h-full object-cover blur-xl opacity-25 scale-125 pointer-events-none select-none"
                        onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                      />
                      <img
                        src={group.imageUrl}
                        alt={group.title}
                        className="relative z-[1] max-w-full max-h-full object-contain p-2 transition-transform duration-300 group-hover:scale-105 drop-shadow-md"
                        loading="lazy"
                        onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                      />
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-[var(--text-muted)] bg-gradient-to-br from-indigo-950 to-slate-900">
                      <span className="text-3xl">🎬</span>
                      <span className="text-xs font-semibold">{group.platform}</span>
                    </div>
                  )}

                  {/* 価値バッジ ＆ 媒体バッジ */}
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10">
                    <select
                      value={group.valueTag || 'none'}
                      onChange={(e) => handleChangeValueTagViewingGroup(group.title, e.target.value as ValueTag)}
                      className="text-[10px] px-2 py-0.5 rounded-md font-bold text-white shadow backdrop-blur cursor-pointer border-0 outline-none"
                      style={{ backgroundColor: VALUE_TAGS[group.valueTag]?.color || '#94a3b8' }}
                      title="価値タグを変更（Well-being / Ownership / なし）"
                    >
                      <option value="well-being">🌿 Well-being</option>
                      <option value="ownership">🧭 Ownership</option>
                      <option value="none">⚪ なし</option>
                    </select>
                    <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-black/60 text-white shadow">
                      {group.platform}
                    </span>
                    {hasMultiple && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-indigo-500/90 text-white shadow">
                        全{group.items.length}話
                      </span>
                    )}
                  </div>

                  {/* 右上：削除ボタン */}
                  <button
                    onClick={() => handleDeleteViewingGroup(group.title)}
                    title="この作品/シリーズを削除（ゴミ箱へ移動）"
                    className="absolute top-2.5 right-2.5 w-7 h-7 rounded-lg bg-black/60 hover:bg-rose-600 backdrop-blur text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-all shadow"
                  >
                    🗑
                  </button>

                  {/* 画像編集ボタン */}
                  <button
                    onClick={() => {
                      setEditingItemId(group.title);
                      setEditingImageUrl(group.imageUrl || '');
                    }}
                    className="absolute bottom-2.5 right-2.5 text-[11px] px-2 py-1 rounded-lg bg-black/60 backdrop-blur text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    📷 画像リンク編集
                  </button>
                </div>

                {/* カード本文 */}
                <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                  {isEditing ? (
                    /* ── ✏️ 視聴時間・感想の編集フォーム ── */
                    <div className="flex flex-col gap-3 py-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[var(--accent)] flex items-center gap-1">
                          ✏️ 視聴時間・感想を編集
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)] truncate max-w-[130px]">
                          {group.title}
                        </span>
                      </div>

                      {/* 視聴時間入力 */}
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-[var(--text-sub)] flex items-center justify-between">
                          <span>合計視聴時間 (分):</span>
                          {parseInt(editingViewingDuration || '0', 10) >= 60 && (
                            <span className="text-[10px] text-[var(--text-muted)] font-normal">
                              約 {(parseInt(editingViewingDuration || '0', 10) / 60).toFixed(1)} 時間
                            </span>
                          )}
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={editingViewingDuration}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^\d]/g, '');
                            setEditingViewingDuration(val);
                          }}
                          placeholder="例: 90"
                          className="text-xs p-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card2)] text-[var(--text)] font-bold focus:outline-none focus:border-[var(--accent)]"
                        />
                      </div>

                      {/* 感想メモ入力 */}
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-[var(--text-sub)]">感想・メモ:</label>
                        <textarea
                          rows={3}
                          value={editingViewingNotes}
                          onChange={(e) => setEditingViewingNotes(e.target.value)}
                          placeholder="ストーリーの感想、学んだこと、気付きなど"
                          className="text-xs p-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card2)] text-[var(--text)] resize-none"
                        />
                      </div>

                      {/* ボタン */}
                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-[var(--border)]">
                        <button
                          type="button"
                          onClick={() => setEditingViewingGroupTitle(null)}
                          className="text-xs px-3 py-1.5 rounded-lg bg-[var(--bg-card2)] text-[var(--text-sub)] hover:text-[var(--text)]"
                        >
                          キャンセル
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveViewingGroupEdit(group.title)}
                          className="text-xs px-4 py-1.5 rounded-xl font-bold bg-[var(--accent)] text-white shadow"
                        >
                          保存する
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── 通常表示 ── */
                    <div className="flex flex-col gap-2">
                      {/* 日時 ＆ 視聴時間合算値 */}
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1">
                          📅 {hasMultiple ? `${group.earliestDate} 〜 ${group.latestDate}` : group.latestDate}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-[var(--text)] bg-[var(--bg-card2)] px-2 py-0.5 rounded-md border border-[var(--border)]">
                            合計 {group.totalDurationMin}分
                            {group.totalDurationMin >= 60 && (
                              <span className="text-[10px] text-[var(--text-muted)] ml-1 font-normal">
                                ({(group.totalDurationMin / 60).toFixed(1)}h)
                              </span>
                            )}
                          </span>
                          <button
                            onClick={() => handleStartEditingViewingGroup(group)}
                            title="視聴時間や感想を編集"
                            className="text-[11px] p-1 rounded hover:bg-[var(--bg-card2)] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                          >
                            ✏️
                          </button>
                        </div>
                      </div>

                      {/* タイトル */}
                      <h3 className="text-sm font-bold text-[var(--text)] leading-snug">
                        {group.title}
                      </h3>

                      {/* 感想メモ */}
                      {group.notes ? (
                        <div
                          onClick={() => handleStartEditingViewingGroup(group)}
                          title="クリックして感想・時間を編集"
                          className="group/notes cursor-pointer text-xs text-[var(--text-sub)] bg-[var(--bg-card2)] p-2.5 rounded-xl leading-relaxed relative hover:border-[var(--accent)] border border-transparent transition-all"
                        >
                          <p className="line-clamp-3">💡 {group.notes}</p>
                          <span className="absolute bottom-1 right-1 text-[10px] text-[var(--accent)] opacity-0 group-hover/notes:opacity-100 transition-opacity">
                            ✏️ 編集
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleStartEditingViewingGroup(group)}
                          className="text-left text-xs text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-card2)] p-2 rounded-xl border border-dashed border-[var(--border)] transition-colors"
                        >
                          + 感想・メモを追加
                        </button>
                      )}

                      {/* 複数回ある場合：内訳アコーディオン */}
                      {hasMultiple && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedViewingGroups((prev) => ({
                                ...prev,
                                [group.title]: !prev[group.title],
                              }))
                            }
                            className="text-[11px] text-[var(--accent)] font-medium hover:underline flex items-center gap-1"
                          >
                            <span>{isExpanded ? '▲' : '▼'}</span>
                            <span>全 {group.items.length} 回の視聴履歴</span>
                          </button>

                          {isExpanded && (
                            <div className="mt-2 flex flex-col gap-1 max-h-36 overflow-y-auto pr-1 border-t border-[var(--border)] pt-2">
                              {group.items.map((ep) => (
                                <div
                                  key={ep.id}
                                  className="flex items-center justify-between text-[11px] p-1.5 rounded-lg bg-[var(--bg-card2)]/70 text-[var(--text-sub)]"
                                >
                                  <span className="font-mono text-[var(--text-muted)]">{ep.date}</span>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const val = prompt('この回の視聴時間（分）を入力してください:', String(ep.durationMin));
                                        if (val !== null) {
                                          const num = parseInt(val.replace(/[^\d]/g, ''), 10);
                                          if (!isNaN(num)) {
                                            handleUpdateViewing(ep.id, { durationMin: Math.max(0, num) });
                                          }
                                        }
                                      }}
                                      title="この回の視聴時間を個別に変更"
                                      className="font-semibold text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-0.5"
                                    >
                                      <span>{ep.durationMin}分</span>
                                      <span className="text-[10px] opacity-60">✏️</span>
                                    </button>
                                    <button
                                      onClick={() => handleDeleteViewing(ep.id)}
                                      title="この回のみ削除"
                                      className="text-[10px] text-rose-500 hover:text-rose-400 p-0.5"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 下部操作バー（評価 ＆ 編集ボタン） */}
                  {!isEditing && (
                    <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-[var(--text-muted)] mr-0.5">評価:</span>
                        {[1, 2, 3, 4].map((star) => (
                          <button
                            key={star}
                            onClick={() => handleUpdateViewingGroupRating(group.title, star)}
                            title={`評価: ${star}/4`}
                            className={`text-sm px-0.5 transition-transform hover:scale-125 ${
                              star <= (group.rating ?? 0) ? 'text-amber-500' : 'text-slate-300 dark:text-slate-700'
                            }`}
                          >
                            ★
                          </button>
                        ))}
                        <span className="text-[10px] text-[var(--text-muted)] ml-1">
                          {group.rating ? `${group.rating}/4` : '未評価'}
                        </span>
                      </div>

                      <button
                        onClick={() => handleStartEditingViewingGroup(group)}
                        className="text-[11px] px-2.5 py-1 rounded-lg bg-[var(--bg-card2)] text-[var(--text-sub)] hover:text-[var(--text)] hover:border-[var(--accent)] border border-transparent font-medium transition-colors flex items-center gap-1"
                      >
                        ✏️ 編集
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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
