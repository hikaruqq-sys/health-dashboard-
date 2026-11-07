import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER || "admin";
const BASIC_AUTH_PASS = process.env.BASIC_AUTH_PASS || "health2026";
const WIDGET_SECRET = process.env.WIDGET_SECRET || "0a0b42d75ffabbd9acd1e5fa2fe80df0";

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // 1. TANITA OAuth callback はリダイレクト処理のため除外
  if (pathname === "/api/auth/callback") {
    return NextResponse.next();
  }

  // 2. ウィジェット・食事同期用APIはシークレットキーで認証通過可能
  if (pathname === "/api/widget" || pathname === "/api/meals/sync") {
    const key = req.nextUrl.searchParams.get("key") || req.headers.get("x-api-key");
    const authHeader = req.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (key === WIDGET_SECRET || bearerToken === WIDGET_SECRET) {
      return NextResponse.next();
    }
  }

  // 3. Basic認証チェック
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Basic ")) {
    const authValue = authHeader.split(" ")[1];
    if (authValue) {
      try {
        const decoded = atob(authValue);
        const [user, ...pwdParts] = decoded.split(":");
        const pwd = pwdParts.join(":");
        if (user === BASIC_AUTH_USER && pwd === BASIC_AUTH_PASS) {
          return NextResponse.next();
        }
      } catch {
        // decode error
      }
    }
  }

  return new NextResponse("Unauthorized. Access to this health dashboard is restricted.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Secure Health Dashboard"',
    },
  });
}
