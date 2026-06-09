import { NextRequest, NextResponse } from 'next/server';
import { fetchHealthDataRange, refreshAccessToken, getMockData } from '@/lib/healthplanet';

export async function GET(req: NextRequest) {
  const useMock =
    !process.env.HEALTHPLANET_CLIENT_ID ||
    process.env.HEALTHPLANET_CLIENT_ID === 'YOUR_CLIENT_ID';

  if (useMock) {
    const days = parseInt(req.nextUrl.searchParams.get('days') ?? '90');
    return NextResponse.json({ data: getMockData(days), mock: true });
  }

  // Accept token from query param (sent from localStorage by frontend)
  let accessToken =
    req.nextUrl.searchParams.get('access_token') ||
    req.cookies.get('hp_access_token')?.value;
  const refreshToken =
    req.nextUrl.searchParams.get('refresh_token') ||
    req.cookies.get('hp_refresh_token')?.value;

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

  try {
    const data = await fetchHealthDataRange(accessToken, from, to);
    return NextResponse.json({ data, mock: false });
  } catch (e) {
    console.error('Health fetch error:', e);
    return NextResponse.json({ error: 'fetch_failed', detail: String(e) }, { status: 500 });
  }
}
