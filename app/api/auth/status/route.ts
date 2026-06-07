import { NextRequest, NextResponse } from 'next/server';
import { fetchHealthData } from '@/lib/healthplanet';

export async function GET(req: NextRequest) {
  const accessToken = req.cookies.get('hp_access_token')?.value;
  const refreshToken = req.cookies.get('hp_refresh_token')?.value;

  if (!accessToken) {
    return NextResponse.json({
      authenticated: false,
      hasRefreshToken: !!refreshToken,
      message: 'No access token in cookies'
    });
  }

  // Try to fetch actual data
  try {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 90);
    const fmt = (d: Date) => d.toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
    const data = await fetchHealthData(accessToken, fmt(from), fmt(to));
    return NextResponse.json({
      authenticated: true,
      dataCount: data.length,
      latest: data[data.length - 1] ?? null,
      message: data.length > 0 ? 'Data found' : 'Authenticated but no data returned'
    });
  } catch (e) {
    return NextResponse.json({
      authenticated: true,
      error: String(e),
      message: 'Token exists but API call failed'
    });
  }
}
