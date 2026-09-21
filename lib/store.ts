import { Redis } from '@upstash/redis';
import type { ReceiptItem, ViewingItem } from '@/types';
import type { UserOverride } from './inventory';

export interface WidgetWeight {
  date: string;
  weight: number;
}

export interface WidgetPFC {
  date: string;
  protein: number;
  fat: number;
  carbs: number;
  calories: number;
}

export interface WidgetData {
  weight: WidgetWeight[];
  pfc: WidgetPFC[];
  updatedAt: string;
}

export interface CloudInventoryData {
  receipts: ReceiptItem[];
  viewings: ViewingItem[];
  overrides?: Record<string, UserOverride>;
  updatedAt: string;
  updatedBy?: string;
  version: number;
}

export interface InventorySnapshot {
  id: string;
  createdAt: string;
  label: string;
  receiptCount: number;
  viewingCount: number;
  data: CloudInventoryData;
}

const KEY = 'health:widget';
const INVENTORY_KEY = 'life:inventory:data';
const HISTORY_KEY = 'life:inventory:history';

function getRedis(): Redis | null {
  const url =
    process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export async function saveWidgetData(data: WidgetData): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error('KV store not configured');
  await redis.set(KEY, data);
}

export async function loadWidgetData(): Promise<WidgetData | null> {
  const redis = getRedis();
  if (!redis) return null;
  return (await redis.get<WidgetData>(KEY)) ?? null;
}

export async function loadInventorySnapshots(): Promise<InventorySnapshot[]> {
  const redis = getRedis();
  if (!redis) return [];
  return (await redis.get<InventorySnapshot[]>(HISTORY_KEY)) ?? [];
}

export async function saveCloudInventoryData(data: CloudInventoryData, label = 'データ保存'): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error('KV store not configured');

  // 現在のデータをスナップショット履歴に保存（最大10件保持）
  try {
    const current = await redis.get<CloudInventoryData>(INVENTORY_KEY);
    if (current && Array.isArray(current.receipts)) {
      const history = (await redis.get<InventorySnapshot[]>(HISTORY_KEY)) ?? [];
      const newSnapshot: InventorySnapshot = {
        id: `snap-${Date.now()}`,
        createdAt: current.updatedAt || new Date().toISOString(),
        label,
        receiptCount: current.receipts.length,
        viewingCount: current.viewings.length,
        data: current,
      };
      const nextHistory = [newSnapshot, ...history.filter((h) => h.id !== newSnapshot.id)].slice(0, 10);
      await redis.set(HISTORY_KEY, nextHistory);
    }
  } catch (e) {
    console.warn('Failed to archive inventory snapshot', e);
  }

  await redis.set(INVENTORY_KEY, data);
}

export async function loadCloudInventoryData(): Promise<CloudInventoryData | null> {
  const redis = getRedis();
  if (!redis) return null;
  return (await redis.get<CloudInventoryData>(INVENTORY_KEY)) ?? null;
}

export async function restoreCloudInventorySnapshot(snapshotId: string): Promise<CloudInventoryData | null> {
  const redis = getRedis();
  if (!redis) return null;
  const history = (await redis.get<InventorySnapshot[]>(HISTORY_KEY)) ?? [];
  const target = history.find((h) => h.id === snapshotId);
  if (!target) return null;

  // 復元前の状態も保存
  const current = await redis.get<CloudInventoryData>(INVENTORY_KEY);
  if (current) {
    const backupSnapshot: InventorySnapshot = {
      id: `snap-${Date.now()}`,
      createdAt: new Date().toISOString(),
      label: '復元直前の自動バックアップ',
      receiptCount: current.receipts.length,
      viewingCount: current.viewings.length,
      data: current,
    };
    await redis.set(HISTORY_KEY, [backupSnapshot, ...history].slice(0, 10));
  }

  const restoredData: CloudInventoryData = {
    ...target.data,
    updatedAt: new Date().toISOString(),
    updatedBy: `復元 (${target.label})`,
    version: Date.now(),
  };

  await redis.set(INVENTORY_KEY, restoredData);
  return restoredData;
}
