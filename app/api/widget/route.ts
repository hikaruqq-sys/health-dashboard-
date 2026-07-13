import { NextRequest, NextResponse } from 'next/server';
import { loadWidgetData } from '@/lib/store';

// Read-only endpoint consumed by the Scriptable widget.
// Protected by a shared secret so the personal data isn't public.
export async function GET(req: NextRequest) {
  const secret = process.env.WIDGET_SECRET;
  if (secret) {
    const key = req.nextUrl.searchParams.get('key');
    if (key !== secret) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  try {
    const data = await loadWidgetData();
    if (!data) {
      return NextResponse.json({ error: 'no_data', weight: [], pfc: [] }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: 'load_failed', detail: String(e) }, { status: 500 });
  }
}
