import { NextRequest, NextResponse } from 'next/server';
import {
  loadCloudInventoryData,
  saveCloudInventoryData,
  loadInventorySnapshots,
  restoreCloudInventorySnapshot,
  CloudInventoryData,
} from '@/lib/store';

export async function GET() {
  try {
    const data = await loadCloudInventoryData();
    const snapshots = await loadInventorySnapshots();
    const history = snapshots.map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      label: s.label,
      receiptCount: s.receiptCount,
      viewingCount: s.viewingCount,
    }));
    return NextResponse.json({ ok: true, data, history });
  } catch (err: any) {
    console.error('Failed to load cloud inventory data:', err);
    return NextResponse.json({ ok: false, error: err.message || 'Failed to load cloud data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 復元アクション
    if (body.action === 'restore') {
      const { snapshotId } = body;
      if (!snapshotId) {
        return NextResponse.json({ ok: false, error: 'Snapshot ID required' }, { status: 400 });
      }
      const restored = await restoreCloudInventorySnapshot(snapshotId);
      if (!restored) {
        return NextResponse.json({ ok: false, error: 'Snapshot not found' }, { status: 404 });
      }
      const snapshots = await loadInventorySnapshots();
      const history = snapshots.map((s) => ({
        id: s.id,
        createdAt: s.createdAt,
        label: s.label,
        receiptCount: s.receiptCount,
        viewingCount: s.viewingCount,
      }));
      return NextResponse.json({ ok: true, data: restored, history });
    }

    const { receipts, viewings, overrides, updatedBy, label } = body;

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

    await saveCloudInventoryData(payload, label || 'データ更新');
    const snapshots = await loadInventorySnapshots();
    const history = snapshots.map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      label: s.label,
      receiptCount: s.receiptCount,
      viewingCount: s.viewingCount,
    }));

    return NextResponse.json({ ok: true, data: payload, history });
  } catch (err: any) {
    console.error('Failed to save cloud inventory data:', err);
    return NextResponse.json({ ok: false, error: err.message || 'Failed to save cloud data' }, { status: 500 });
  }
}
