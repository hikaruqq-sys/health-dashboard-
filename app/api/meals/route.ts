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

    const estimatedEntries: typeof entries = [];
    const dates = Array.from(dateGroups.keys()).sort().slice(-30); // last 30 days
    for (const date of dates) {
      const dayFoods = dateGroups.get(date)!.map((e) => ({
        mealType: e.mealType,
        name: e.foodName,
      }));
      try {
        const estimated = await estimateNutrition(dayFoods, date);
        estimatedEntries.push(...estimated);
      } catch {
        // fallback: keep zeros
        estimatedEntries.push(...dateGroups.get(date)!);
      }
    }
    entries = estimatedEntries;
  }

  const daily = groupByDay(entries);
  return NextResponse.json({ entries, daily, mock: false });
}
