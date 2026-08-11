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
