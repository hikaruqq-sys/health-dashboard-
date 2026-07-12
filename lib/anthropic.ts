import Groq from 'groq-sdk';
import { BodyMetric, DailyNutrition, MealEntry } from '@/types';

function getClient() {
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

async function chat(prompt: string): Promise<string> {
  const client = getClient();
  const res = await client.chat.completions.create({
    model: 'openai/gpt-oss-120b',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1024,
  });
  return res.choices[0]?.message?.content ?? '';
}

// Estimate nutrition from food name list using AI
export async function estimateNutrition(
  foods: { mealType: string; name: string }[],
  date: string,
): Promise<MealEntry[]> {
  const list = foods.map((f) => `${f.mealType}: ${f.name}`).join('\n');

  const prompt = `
以下の食事リストについて、各食品の栄養情報を推定してください。

${list}

必ずJSON配列のみで返してください。説明文や他のテキストは一切不要です。
[
  {
    "mealType": "breakfast" または "lunch" または "dinner" または "snack",
    "foodName": "食品名",
    "calories": 数値,
    "protein": 数値,
    "fat": 数値,
    "carbs": 数値
  }
]
`.trim();

  const text = await chat(prompt);
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Invalid JSON response');
  const items = JSON.parse(jsonMatch[0]);
  return items.map((item: Omit<MealEntry, 'date'>) => ({ ...item, date }));
}

export async function generateHealthAdvice(
  metrics: BodyMetric[],
  nutrition: DailyNutrition[],
): Promise<string> {
  const recentMetrics = metrics.slice(-14);
  const nutritionSummary = nutrition.slice(-7).map((d) => ({
    date: d.date,
    calories: Math.round(d.totalCalories),
    protein: d.totalProtein.toFixed(1),
    fat: d.totalFat.toFixed(1),
    carbs: d.totalCarbs.toFixed(1),
    foods: d.meals.map((m) => `${m.mealType}:${m.foodName}`).join(', '),
  }));

  const prompt = `
あなたは健康管理の専門家です。以下のデータを分析して、日本語で具体的なアドバイスをください。

## 体組成データ（直近2週間）
${JSON.stringify(recentMetrics, null, 2)}

## 食事・栄養データ（直近1週間）
${JSON.stringify(nutritionSummary, null, 2)}

以下の観点で分析してください：
1. **体重・体脂肪のトレンド**（改善点・課題点）
2. **栄養バランスの評価**（カロリー・三大栄養素・過不足）
3. **体組成と食事の相関**（食事が体組成に与えている影響）
4. **具体的な改善提案**（今週から実践できる3つのアクション）

回答はMarkdown形式で、見やすく整理してください。
`.trim();

  return chat(prompt);
}
