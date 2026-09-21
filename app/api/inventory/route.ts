import { NextRequest, NextResponse } from 'next/server';
import { loadCloudInventoryData, saveCloudInventoryData, CloudInventoryData } from '@/lib/store';

export async function GET() {
  try {
    const data = await loadCloudInventoryData();
    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    console.error('Failed to load cloud inventory data:', err);
    return NextResponse.json({ ok: false, error: err.message || 'Failed to load cloud data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { receipts, viewings, overrides, updatedBy } = body;

    if (!Array.isArray(receipts) || !Array.isArray(viewings)) {
      return NextResponse.json({ ok: false, error: 'Invalid data format' }, { status: 400 });
    }

    const payload: CloudInventoryData = {
      receipts,
      viewings,
      overrides: overrides || {},
      updatedAt: new Date().toISOString(),
      updatedBy: updatedBy || 'web-client',
      version: Date.now(),
    };

    await saveCloudInventoryData(payload);
    return NextResponse.json({ ok: true, data: payload });
  } catch (err: any) {
    console.error('Failed to save cloud inventory data:', err);
    return NextResponse.json({ ok: false, error: err.message || 'Failed to save cloud data' }, { status: 500 });
  }
}
