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
