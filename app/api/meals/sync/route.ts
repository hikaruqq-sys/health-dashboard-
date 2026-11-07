import { NextRequest, NextResponse } from 'next/server';
import { parseCSV, groupByDay } from '@/lib/meals';
import { estimateNutrition } from '@/lib/anthropic';
import { supabase } from '@/lib/supabase';
import { saveWidgetData, WidgetPFC, loadWidgetData } from '@/lib/store';
import { DailyNutrition, MealEntry } from '@/types';

export const maxDuration = 60; // Vercel Serverless Function タイムアウトを最大化

/**
 * GET: Supabase に保存されている食事・栄養データを取得
 */
export async function GET() {
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase client not configured' }, { status: 500 });
  }

  const { data, error } = await supabase
    .from('lifeplan_kv')
    .select('data, updated_at')
    .eq('key', 'health_meal_nutrition')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const daily: DailyNutrition[] = Array.isArray(data?.data) ? data.data : [];
  return NextResponse.json({ daily, updatedAt: data?.updated_at ?? null });
}

/**
 * POST: iPhone 等から食事CSVテキストを受け取り、差分をAI推定して Supabase に自動保存
 */
export async function POST(req: NextRequest) {
  try {
    let csvText = '';
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (file) {
        csvText = await file.text();
      } else {
        csvText = String(formData.get('csv') || formData.get('text') || '');
      }
    } else if (contentType.includes('application/json')) {
      const body = await req.json();
      csvText = body.csv || body.text || '';
    } else {
      csvText = await req.text();
    }

    if (!csvText || !csvText.trim()) {
      return NextResponse.json({ error: 'Empty CSV or text received' }, { status: 400 });
    }

    const entries = parseCSV(csvText);
    if (entries.length === 0) {
      return NextResponse.json({ error: 'No valid meal records found in CSV' }, { status: 400 });
    }

    // 1. Supabase から既存の栄養推定済みデータを取得
    let existingDaily: DailyNutrition[] = [];
    if (supabase) {
      const { data } = await supabase
        .from('lifeplan_kv')
        .select('data')
        .eq('key', 'health_meal_nutrition')
        .maybeSingle();
      if (data && Array.isArray(data.data)) {
        existingDaily = data.data as DailyNutrition[];
      }
    }

    const existingMap = new Map<string, DailyNutrition>(existingDaily.map((d) => [d.date, d]));

    // 2. 受信したCSVを日付ごとにグループ化
    const dateGroups = new Map<string, MealEntry[]>();
    for (const e of entries) {
      if (!dateGroups.has(e.date)) dateGroups.set(e.date, []);
      dateGroups.get(e.date)!.push(e);
    }

    // 今日の日付 (JST)
    const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // 3. 差分判定: どの日の栄養推定が必要か？
    // - 既存データがない日
    // - 既存データのカロリーが 0 の日
    // - 直近3日（追記があり得る）で、登録された食事件数が変わっている日
    const datesToEstimate: string[] = [];

    const sortedDates = Array.from(dateGroups.keys()).sort();
    for (const d of sortedDates) {
      const exist = existingMap.get(d);
      const incomingFoods = dateGroups.get(d)!;

      if (!exist || exist.totalCalories === 0) {
        datesToEstimate.push(d);
      } else {
        // 直近3日以内の場合、食事件数が異なれば再推定
        const diffDays = (new Date(nowJST).getTime() - new Date(d).getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays <= 3 && exist.meals.length !== incomingFoods.length) {
          datesToEstimate.push(d);
        }
      }
    }

    // 4. 未推定分を AI（Groq）で並列推定（最大30日ずつ、同時並列数6）
    const targetDates = datesToEstimate.slice(-30);
    const CONCURRENCY = 6;
    const newEstimatedEntries: MealEntry[] = [];

    for (let i = 0; i < targetDates.length; i += CONCURRENCY) {
      const chunk = targetDates.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map(async (date) => {
          const dayFoods = dateGroups.get(date)!.map((e) => ({
            mealType: e.mealType,
            name: e.foodName,
          }));
          try {
            return await estimateNutrition(dayFoods, date);
          } catch (err) {
            console.error(`Nutrition estimation failed for ${date}:`, err);
            return dateGroups.get(date)!;
          }
        })
      );
      newEstimatedEntries.push(...chunkResults.flat());
    }

    // 5. 推定結果を DailyNutrition に変換してマージ
    const newDaily = groupByDay(newEstimatedEntries);
    for (const d of newDaily) {
      existingMap.set(d.date, d);
    }

    // AI推定を行わなかった過去の日付で、既存マップにないものはそのまま登録
    for (const [date, rawFoods] of dateGroups.entries()) {
      if (!existingMap.has(date)) {
        const dummyDaily = groupByDay(rawFoods);
        if (dummyDaily[0]) existingMap.set(date, dummyDaily[0]);
      }
    }

    const mergedDaily = Array.from(existingMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // 6. Supabase に永続化
    if (supabase) {
      const { error: upsertErr } = await supabase.from('lifeplan_kv').upsert({
        key: 'health_meal_nutrition',
        data: mergedDaily,
        updated_at: new Date().toISOString(),
      });
      if (upsertErr) {
        console.error('Failed to save to Supabase lifeplan_kv:', upsertErr);
      }
    }

    // 7. iPhone ウィジェット用の PFC データも同期更新（可能であれば）
    try {
      const recentPfc: WidgetPFC[] = mergedDaily.slice(-14).map((d) => ({
        date: d.date,
        protein: Math.round(d.totalProtein),
        fat: Math.round(d.totalFat),
        carbs: Math.round(d.totalCarbs),
        calories: Math.round(d.totalCalories),
      }));

      const currentWidget = await loadWidgetData().catch(() => null);
      await saveWidgetData({
        weight: currentWidget?.weight ?? [],
        pfc: recentPfc,
        updatedAt: new Date().toISOString(),
      });
    } catch {
      // Redis 未設定等の場合はスキップ
    }

    return NextResponse.json({
      ok: true,
      message: 'Meal data synced and saved successfully',
      estimatedDaysCount: targetDates.length,
      estimatedDates: targetDates,
      totalDays: mergedDaily.length,
      latestDate: mergedDaily[mergedDaily.length - 1]?.date ?? null,
    });
  } catch (e) {
    console.error('Error in /api/meals/sync:', e);
    return NextResponse.json(
      { error: 'Sync failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
