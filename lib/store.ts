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

const KEY = 'health:widget';
const INVENTORY_KEY = 'life:inventory:data';

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

export async function saveCloudInventoryData(data: CloudInventoryData): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error('KV store not configured');
  await redis.set(INVENTORY_KEY, data);
}

export async function loadCloudInventoryData(): Promise<CloudInventoryData | null> {
  const redis = getRedis();
  if (!redis) return null;
  return (await redis.get<CloudInventoryData>(INVENTORY_KEY)) ?? null;
}
