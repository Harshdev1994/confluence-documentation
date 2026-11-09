import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { isDevMode } from "@/server/dev-mode";

/**
 * Optimistic route protection: anyone without an Okta session is sent to
 * /login. Every page and API route still checks the session itself.
 */
const PUBLIC_PATHS = ["/login", "/api/auth", "/api/health", "/api/webhooks"];

const withOkta = auth((req) => {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  if (!req.auth) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const login = new URL("/login", req.nextUrl.origin);
    login.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
});

export default function proxy(req: NextRequest, ctx: unknown) {
  // Development mode (npm run dev + DEV_CONFLUENCE_PAT): no Okta sign-in.
  if (isDevMode()) return NextResponse.next();
  return (withOkta as unknown as (req: NextRequest, ctx: unknown) => ReturnType<typeof NextResponse.next>)(req, ctx);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
