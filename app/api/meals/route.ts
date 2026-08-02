import { NextRequest, NextResponse } from 'next/server';
import { parseCSV, groupByDay, getMockMeals } from '@/lib/meals';
import { estimateNutrition } from '@/lib/anthropic';

export async function GET(req: NextRequest) {
  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '14');
  const entries = getMockMeals(days);
  const daily = groupByDay(entries);
  return NextResponse.json({ entries, daily, mock: true });
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const text = await file.text();
  let entries = parseCSV(text);
  if (entries.length === 0) {
    return NextResponse.json({ error: 'No valid rows found' }, { status: 400 });
  }

  // If nutrition data is all zeros (Streaks-style CSV), estimate with AI
  const needsEstimation = entries.every((e) => e.calories === 0);
  if (needsEstimation && process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'YOUR_GROQ_API_KEY') {
    // Group by date and batch estimate (up to 30 days to keep API calls manageable)
    const dateGroups = new Map<string, typeof entries>();
    for (const e of entries) {
      if (!dateGroups.has(e.date)) dateGroups.set(e.date, []);
      dateGroups.get(e.date)!.push(e);
    }

    const dates = Array.from(dateGroups.keys()).sort().slice(-30); // last 30 days

    // 1日ずつ直列に待つと遅いので、同時実行数を絞って並列に推定する。
    // （全同時だとGroqのレート制限に当たりやすいため CONCURRENCY で制限）
    const CONCURRENCY = 6;
    const estimateForDate = async (date: string) => {
      const dayFoods = dateGroups.get(date)!.map((e) => ({
        mealType: e.mealType,
        name: e.foodName,
      }));
      try {
        return await estimateNutrition(dayFoods, date);
      } catch {
        // fallback: keep original (zeros) rows for that day
        return dateGroups.get(date)!;
      }
    };

    const results: (typeof entries)[] = [];
    for (let i = 0; i < dates.length; i += CONCURRENCY) {
      const chunk = dates.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.all(chunk.map(estimateForDate));
      results.push(...chunkResults);
    }
    entries = results.flat();
  }

  const daily = groupByDay(entries);
  return NextResponse.json({ entries, daily, mock: false });
}
