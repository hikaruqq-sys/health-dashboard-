import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken } from '@/lib/healthplanet';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(new URL('/?error=no_code', req.url));
  }

  try {
    const tokens = await exchangeCodeForToken(code);
    const res = NextResponse.redirect(new URL('/', req.url));

    // Store tokens in cookies (7 day expiry)
    res.cookies.set('hp_access_token', tokens.access_token, {
      httpOnly: true,
      maxAge: tokens.expires_in,
      sameSite: 'lax',
    });
    res.cookies.set('hp_refresh_token', tokens.refresh_token, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 7,
      sameSite: 'lax',
    });
    return res;
  } catch {
    return NextResponse.redirect(new URL('/?error=auth_failed', req.url));
  }
}
