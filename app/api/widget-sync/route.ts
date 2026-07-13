import { NextRequest, NextResponse } from 'next/server';
import { saveWidgetData, WidgetWeight, WidgetPFC } from '@/lib/store';

// Called by the dashboard (browser) whenever fresh real data is loaded,
// so the server always holds the latest snapshot for the widget to read.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const weight: WidgetWeight[] = Array.isArray(body.weight) ? body.weight : [];
    const pfc: WidgetPFC[] = Array.isArray(body.pfc) ? body.pfc : [];

    if (weight.length === 0 && pfc.length === 0) {
      return NextResponse.json({ error: 'no_data' }, { status: 400 });
    }

    await saveWidgetData({
      weight,
      pfc,
      updatedAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'save_failed', detail: String(e) }, { status: 500 });
  }
}
