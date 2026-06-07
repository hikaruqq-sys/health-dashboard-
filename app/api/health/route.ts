import { NextRequest, NextResponse } from 'next/server';
import { fetchHealthData, refreshAccessToken, getMockData } from '@/lib/healthplanet';

export async function GET(req: NextRequest) {
  const useMock =
    !process.env.HEALTHPLANET_CLIENT_ID ||
    process.env.HEALTHPLANET_CLIENT_ID === 'YOUR_CLIENT_ID';

  if (useMock) {
    const days = parseInt(req.nextUrl.searchParams.get('days') ?? '90');
    return NextResponse.json({ data: getMockData(days), mock: true });
  }

  let accessToken = req.cookies.get('hp_access_token')?.value;
  const refreshToken = req.cookies.get('hp_refresh_token')?.value;

  if (!accessToken && refreshToken) {
    try {
      const tokens = await refreshAccessToken(refreshToken);
      accessToken = tokens.access_token;
    } catch {
      return NextResponse.json({ error: 'auth_required' }, { status: 401 });
    }
  }

  if (!accessToken) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }

  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '90');
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);

  const fmt = (d: Date) =>
    d.toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);

  try {
    const data = await fetchHealthData(accessToken, fmt(from), fmt(to));
    const res = NextResponse.json({ data, mock: false });
    if (accessToken !== req.cookies.get('hp_access_token')?.value) {
      res.cookies.set('hp_access_token', accessToken, {
        httpOnly: true,
        maxAge: 3600,
        sameSite: 'lax',
      });
    }
    return res;
  } catch {
    return NextResponse.json({ error: 'fetch_failed' }, { status: 500 });
  }
}
