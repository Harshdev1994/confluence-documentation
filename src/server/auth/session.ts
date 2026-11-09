import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { sessionMaxAgeSeconds, tokenEncryptionKey } from "@/server/env";
import { DEV_USER_ID, devConfluencePat } from "@/server/dev-mode";
import { userKey } from "@/server/cache/keys";
import { ConfluenceError } from "@/server/confluence/client";
import type { UserContext } from "@/server/confluence/service";
import { decryptToken, encryptToken, type StoredToken } from "./token-crypto";

export const TOKEN_COOKIE = "cp_confluence_token";

export interface AppSession {
  oktaUser: { id: string; name?: string | null; email?: string | null };
  /** Null when the user hasn't saved a Confluence token yet (or it expired). */
  confluence: { token: StoredToken; ctx: UserContext } | null;
}

/** Okta session plus the user's decrypted Confluence token, if any. */
export async function getAppSession(): Promise<AppSession | null> {
  const devPat = devConfluencePat();
  if (devPat) {
    return {
      oktaUser: { id: DEV_USER_ID, name: "Development mode" },
      confluence: {
        token: { pat: devPat, sub: DEV_USER_ID, username: "", displayName: "token from .env.local", exp: Number.MAX_SAFE_INTEGER },
        ctx: { token: devPat, user: userKey(DEV_USER_ID) },
      },
    };
  }
  const session = await auth();
  if (!session?.user?.id) return null;
  const jar = await cookies();
  const token = decryptToken(jar.get(TOKEN_COOKIE)?.value, tokenEncryptionKey(), session.user.id);
  return {
    oktaUser: session.user,
    confluence: token ? { token, ctx: { token: token.pat, user: userKey(session.user.id) } } : null,
  };
}

/** For pages: ensures login and a Confluence token, redirecting otherwise. */
export async function requireConfluence(): Promise<AppSession & { confluence: NonNullable<AppSession["confluence"]> }> {
  const session = await getAppSession();
  if (!session) redirect("/login");
  if (!session.confluence) redirect("/settings/token");
  return session as AppSession & { confluence: NonNullable<AppSession["confluence"]> };
}

/** For pages: maps Confluence errors to the right screen. */
export function handlePageError(err: unknown): never {
  if (err instanceof ConfluenceError) {
    if (err.isAuthError) redirect(devConfluencePat() ? "/settings/token?reason=dev-rejected" : "/settings/token?reason=expired");
    if (err.isNotFoundOrForbidden) notFound();
  }
  throw err;
}

/** For route handlers: maps Confluence errors to JSON responses. */
export function apiError(err: unknown): Response {
  if (err instanceof ConfluenceError) {
    if (err.isAuthError) return Response.json({ error: "confluence_token_invalid" }, { status: 401 });
    if (err.isNotFoundOrForbidden) return Response.json({ error: "not_found" }, { status: 404 });
    if (err.status === 429) return Response.json({ error: "rate_limited" }, { status: 429 });
    console.error("[confluence]", err.status, err.path, err.message);
    return Response.json({ error: "confluence_error" }, { status: 502 });
  }
  console.error(err);
  return Response.json({ error: "internal_error" }, { status: 500 });
}

/** For route handlers: returns the user's context or a 401 response. */
export async function apiContext(): Promise<UserContext | Response> {
  const session = await getAppSession();
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  if (!session.confluence) return Response.json({ error: "confluence_token_missing" }, { status: 401 });
  return session.confluence.ctx;
}

/** Stores the token in an encrypted httpOnly cookie. Call only from server actions / route handlers. */
export async function saveTokenCookie(token: Omit<StoredToken, "exp">) {
  const maxAge = sessionMaxAgeSeconds();
  const value = encryptToken({ ...token, exp: Math.floor(Date.now() / 1000) + maxAge }, tokenEncryptionKey());
  const jar = await cookies();
  jar.set(TOKEN_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

export async function clearTokenCookie() {
  const jar = await cookies();
  jar.delete(TOKEN_COOKIE);
}
