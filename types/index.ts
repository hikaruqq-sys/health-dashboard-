export interface BodyMetric {
  date: string;
  weight?: number;
  bodyFat?: number;
  muscleMass?: number;
  bmr?: number;
  bodyAge?: number;
}

export interface MealEntry {
  date: string;       // YYYY-MM-DD
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  foodName: string;
  calories: number;
  protein: number;    // g
  fat: number;        // g
  carbs: number;      // g
  fiber?: number;     // g
  sodium?: number;    // mg
}

export interface DailyNutrition {
  date: string;
  totalCalories: number;
  totalProtein: number;
  totalFat: number;
  totalCarbs: number;
  totalFiber: number;
  totalSodium: number;
  meals: MealEntry[];
}

export interface NutritionGoals {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

/* ── 習慣（Streaks から取り込む） ────────────────────────────── */

export interface HabitLog {
  habit: string;
  date: string;   // YYYY-MM-DD
  count: number;  // 同じ日に複数回記録した場合の回数
}

export interface HabitMeta {
  habit: string;
  icon?: string;
  monthlyGoal?: number;
  color?: string;
  sortOrder?: number;
  archived?: boolean;
}

/* ── 年間目標（Notion の Target 表） ─────────────────────────── */

export type Quarter = 'q1' | 'q2' | 'q3' | 'q4';
export type TargetStatus = 'done' | 'miss';

export interface TargetRow {
  id: string;
  category: string;
  item: string;
  q1: string;
  q2: string;
  q3: string;
  q4: string;
  status: Partial<Record<Quarter, TargetStatus>>;
  sortOrder: number;
}

/* ── 本・映画 ──────────────────────────────────────────────── */

export type LibraryType = 'book' | 'movie' | 'drama' | 'anime' | 'other';
export type LibraryStatus = 'want' | 'doing' | 'done';

export interface LibraryItem {
  id: string;
  title: string;
  url?: string;
  type: LibraryType;
  status: LibraryStatus;
  startedOn?: string;   // YYYY-MM-DD
  finishedOn?: string;  // YYYY-MM-DD
  recommender?: string;
  note?: string;
  coverUrl?: string;
}

/* ── 価値・持ち物（インベントリ・支出・視聴ログ） ─────────────── */

export type InventoryCategory = 'book' | 'clothes' | 'gadget';
export type ValueTag = 'well-being' | 'ownership' | 'neutral';

export type ClothingSeason = 'all' | 'summer' | 'winter' | 'spring_autumn';
export type ClothingCategory = 'tops' | 'bottoms' | 'outer' | 'shoes' | 'bag' | 'sports_inner';

export interface ReceiptItem {
  id: string;
  date: string;          // YYYY-MM-DD (購入日)
  store: string;
  name: string;
  amount: number;
  category: InventoryCategory;
  valueTag: ValueTag;
  subCategory?: string;
  season?: ClothingSeason;            // 夏 / 冬 / オールシーズン / 春秋
  clothingCategory?: ClothingCategory; // トップス / ボトムス / アウター / 靴 / バッグ
  notes?: string;
  imageUrl?: string;      // 画像リンク
  rating?: number;        // 1-4 段階評価
  isFinished?: boolean;   // 読了・使い切り
  isRecommended?: boolean;// 人に薦めたいか
  deleted?: boolean;      // 削除フラグ
}

export interface ViewingItem {
  id: string;
  date: string;          // YYYY-MM-DD (視聴日)
  title: string;
  platform: 'Netflix' | 'Prime Video' | 'U-NEXT' | 'TVer' | 'NHK' | 'Other';
  durationMin: number;
  category: 'anime' | 'movie' | 'drama' | 'soccer' | 'variety' | 'documentary';
  valueTag: ValueTag;
  notes?: string;
  imageUrl?: string;      // 画像リンク
  rating?: number;        // 1-4 段階評価
  deleted?: boolean;      // 削除フラグ
}

export interface ValueSummary {
  month: string;         // YYYY-MM
  wbAmount: number;
  osAmount: number;
  neutralAmount: number;
  totalAmount: number;
  wbMinutes: number;
  osMinutes: number;
  totalMinutes: number;
}
