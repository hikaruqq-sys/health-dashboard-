import { MealEntry, DailyNutrition } from '@/types';

const MEAL_TYPE_MAP: Record<string, MealEntry['mealType']> = {
  朝: 'breakfast', 朝食: 'breakfast', 朝ご飯: 'breakfast', breakfast: 'breakfast',
  昼: 'lunch', 昼食: 'lunch', 昼ご飯: 'lunch', lunch: 'lunch',
  夜: 'dinner', 夕食: 'dinner', 夜ご飯: 'dinner', dinner: 'dinner',
  間食: 'snack', おやつ: 'snack', 完食: 'snack', snack: 'snack',
};

// Detect Streaks-style CSV: "2026/02/01 18:33, 夜ご飯, ハンバーグ定食, コーヒー、みかん"
// Columns: datetime | meal_type | main_food | [extra_foods...]
function isStreaksFormat(headers: string[]): boolean {
  return (
    headers.length >= 3 &&
    /^\d{4}[\/\-]\d{2}[\/\-]\d{2}/.test(headers[0]) && // first col looks like a date
    MEAL_TYPE_MAP[headers[1]] !== undefined              // second col is a meal type
  );
}

export function parseCSV(csvText: string): MealEntry[] {
  const lines = csvText.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];

  // Split a line respecting quoted fields
  const splitLine = (line: string) =>
    line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));

  const firstCols = splitLine(lines[0]);

  // --- Streaks / headerless format ---
  if (isStreaksFormat(firstCols)) {
    return parseStreaksLines(lines);
  }

  // --- Standard CSV with header row ---
  const COLUMN_ALIASES: Record<string, string> = {
    日付: 'date', date: 'date', 日時: 'date', datetime: 'date',
    食事: 'mealType', meal_type: 'mealType', 食事タイプ: 'mealType',
    食品名: 'foodName', food_name: 'foodName', 食品: 'foodName',
    カロリー: 'calories', calories: 'calories', kcal: 'calories', エネルギー: 'calories',
    タンパク質: 'protein', protein: 'protein',
    脂質: 'fat', fat: 'fat',
    炭水化物: 'carbs', carbs: 'carbs',
    食物繊維: 'fiber', fiber: 'fiber',
    食塩相当量: 'sodium', sodium: 'sodium', 塩分: 'sodium',
  };

  const headers = splitLine(lines[0]);
  const colMap: Record<number, string> = {};
  headers.forEach((h, i) => {
    const mapped = COLUMN_ALIASES[h];
    if (mapped) colMap[i] = mapped;
  });

  const entries: MealEntry[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitLine(line);
    const row: Record<string, string> = {};
    cols.forEach((v, i) => { if (colMap[i]) row[colMap[i]] = v; });
    if (!row.date || !row.foodName) continue;

    entries.push({
      date: normalizeDate(row.date),
      mealType: MEAL_TYPE_MAP[row.mealType] ?? 'snack',
      foodName: row.foodName,
      calories: parseFloat(row.calories) || 0,
      protein: parseFloat(row.protein) || 0,
      fat: parseFloat(row.fat) || 0,
      carbs: parseFloat(row.carbs) || 0,
      fiber: parseFloat(row.fiber) || undefined,
      sodium: parseFloat(row.sodium) || undefined,
    });
  }
  return entries;
}

// Parse Streaks-style lines (no header, nutrition unknown → 0, will be estimated by AI)
function parseStreaksLines(lines: string[]): MealEntry[] {
  const entries: MealEntry[] = [];

  for (const line of lines) {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 3) continue;

    const date = normalizeDate(cols[0]); // "2026/02/01 18:33" → "2026-02-01"
    const mealType = MEAL_TYPE_MAP[cols[1]] ?? 'snack';

    // Collect all food names: col[2] is main, col[3] may contain "食品A、食品B" or be empty
    const allFoods: string[] = [];
    if (cols[2]) allFoods.push(...cols[2].split(/[、・\n]/).map((s) => s.trim()).filter(Boolean));
    if (cols[3]) allFoods.push(...cols[3].split(/[、・\n]/).map((s) => s.trim()).filter(Boolean));

    for (const food of allFoods) {
      if (!food) continue;
      entries.push({
        date,
        mealType,
        foodName: food,
        calories: 0,
        protein: 0,
        fat: 0,
        carbs: 0,
      });
    }
  }
  return entries;
}

function normalizeDate(raw: string): string {
  // "2026/02/01 18:33" or "2026-02-01" or "20260201"
  const clean = raw.replace(/\//g, '-').slice(0, 10);
  if (/^\d{8}$/.test(clean)) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
  }
  return clean;
}

export function groupByDay(entries: MealEntry[]): DailyNutrition[] {
  const map = new Map<string, DailyNutrition>();
  for (const e of entries) {
    if (!map.has(e.date)) {
      map.set(e.date, {
        date: e.date,
        totalCalories: 0,
        totalProtein: 0,
        totalFat: 0,
        totalCarbs: 0,
        totalFiber: 0,
        totalSodium: 0,
        meals: [],
      });
    }
    const day = map.get(e.date)!;
    day.totalCalories += e.calories;
    day.totalProtein += e.protein;
    day.totalFat += e.fat;
    day.totalCarbs += e.carbs;
    day.totalFiber += e.fiber ?? 0;
    day.totalSodium += e.sodium ?? 0;
    day.meals.push(e);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function getMockMeals(days = 14): MealEntry[] {
  const entries: MealEntry[] = [];
  const now = new Date();
  const mealTypes: MealEntry['mealType'][] = ['breakfast', 'lunch', 'dinner'];
  const foods: Record<MealEntry['mealType'], { name: string; cal: number; p: number; f: number; c: number }[]> = {
    breakfast: [
      { name: 'オートミール150g', cal: 167, p: 6, f: 3.3, c: 28 },
      { name: '小岩井生乳ヨーグルト', cal: 62, p: 3.6, f: 3, c: 5 },
      { name: 'コーヒー', cal: 7, p: 0.3, f: 0, c: 1 },
    ],
    lunch: [
      { name: '鶏胸肉炒め', cal: 240, p: 28, f: 9, c: 8 },
      { name: '白米', cal: 252, p: 3.8, f: 0.5, c: 55.7 },
    ],
    dinner: [
      { name: 'サラダチキン', cal: 110, p: 24, f: 1.5, c: 0 },
      { name: '野菜スープ', cal: 65, p: 3, f: 1, c: 10 },
    ],
    snack: [],
  };

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    for (const type of mealTypes) {
      for (const food of foods[type]) {
        entries.push({ date, mealType: type, foodName: food.name, calories: food.cal, protein: food.p, fat: food.f, carbs: food.c });
      }
    }
  }
  return entries;
}
