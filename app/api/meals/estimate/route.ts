import { NextRequest, NextResponse } from 'next/server';
import { estimateNutrition } from '@/lib/anthropic';
import { groupByDay } from '@/lib/meals';

export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY') {
    return NextResponse.json({ error: 'api_key_not_set' }, { status: 400 });
  }

  const { foods, date } = await req.json();
  if (!foods?.length || !date) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  try {
    const entries = await estimateNutrition(foods, date);
    const daily = groupByDay(entries);
    return NextResponse.json({ entries, daily });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'estimate_failed' }, { status: 500 });
  }
}
