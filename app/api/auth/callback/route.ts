import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken } from '@/lib/healthplanet';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL(`/?error=${error}`, req.url));
  }
  if (!code) {
    return NextResponse.redirect(new URL('/?error=no_code', req.url));
  }

  try {
    const tokens = await exchangeCodeForToken(code);
    const isProd = process.env.NODE_ENV === 'production';
    const res = NextResponse.redirect(new URL('/', req.url));

    res.cookies.set('hp_access_token', tokens.access_token, {
      httpOnly: true,
      secure: isProd,
      maxAge: tokens.expires_in,
      sameSite: 'lax',
      path: '/',
    });
    res.cookies.set('hp_refresh_token', tokens.refresh_token, {
      httpOnly: true,
      secure: isProd,
      maxAge: 60 * 60 * 24 * 7,
      sameSite: 'lax',
      path: '/',
    });
    return res;
  } catch (e) {
    console.error('Auth callback error:', e);
    return NextResponse.redirect(new URL('/?error=auth_failed', req.url));
  }
}
