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
    // Pass tokens via URL params so frontend can store in localStorage
    // (Safari ITP blocks cookies set during cross-site redirects)
    const redirectUrl = new URL('/', req.url);
    redirectUrl.searchParams.set('hp_token', tokens.access_token);
    redirectUrl.searchParams.set('hp_refresh', tokens.refresh_token);
    redirectUrl.searchParams.set('hp_expires', String(tokens.expires_in));
    return NextResponse.redirect(redirectUrl);
  } catch (e) {
    console.error('Auth callback error:', e);
    return NextResponse.redirect(new URL('/?error=auth_failed', req.url));
  }
}
