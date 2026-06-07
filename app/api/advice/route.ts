import { NextRequest, NextResponse } from 'next/server';
import { generateHealthAdvice } from '@/lib/anthropic';
import { BodyMetric, DailyNutrition } from '@/types';

export async function POST(req: NextRequest) {
  if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'YOUR_GROQ_API_KEY') {
    return NextResponse.json({
      advice: `## サンプルアドバイス（APIキー未設定）

### 体重・体脂肪のトレンド
過去2週間のデータを確認すると、体重は緩やかに減少傾向にあります。この調子を維持しましょう。

### 栄養バランスの評価
- **カロリー**: 目標範囲内です
- **タンパク質**: やや不足気味。1日70g以上を目標に
- **脂質**: 適正範囲内
- **炭水化物**: 夜の摂取量を少し減らすと効果的

### 具体的な改善提案
1. **朝食にプロテイン追加**: ギリシャヨーグルトや卵を加えて タンパク質を増やしましょう
2. **夕食の炭水化物を半分に**: 夜はご飯を半膳にして野菜を増やすと体脂肪が落ちやすくなります
3. **水分摂取**: 1日2L以上の水を意識的に飲みましょう`,
    });
  }

  const { metrics, nutrition }: { metrics: BodyMetric[]; nutrition: DailyNutrition[] } =
    await req.json();

  try {
    const advice = await generateHealthAdvice(metrics, nutrition);
    return NextResponse.json({ advice });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'advice_failed' }, { status: 500 });
  }
}
