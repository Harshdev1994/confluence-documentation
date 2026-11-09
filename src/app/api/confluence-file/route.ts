import type { NextRequest } from "next/server";
import { apiContext } from "@/server/auth/session";
import { isAllowedPath } from "@/server/confluence/html";
import { client } from "@/server/confluence/service";

/**
 * Streams images and attachments from Confluence using the viewer's token.
 * The browser has no Confluence session of its own, so every embedded image
 * and attachment link in a page is routed through here.
 *
 * GET /api/confluence-file?path=/download/attachments/123/diagram.png?version=2
 */

const PASS_THROUGH = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
  "content-disposition",
];

/** Types that could run script if opened directly from our origin. */
const ACTIVE_TYPES = /^(text\/html|application\/xhtml\+xml|text\/xml|application\/xml|application\/javascript|text\/javascript)/i;


export async function GET(req: NextRequest) {
  const ctx = await apiContext();
  if (ctx instanceof Response) return ctx;

  let path = req.nextUrl.searchParams.get("path") ?? "";
  if (!isAllowedPath(path)) return new Response("Bad request", { status: 400 });

  const forward: Record<string, string> = { Accept: "*/*" };
  for (const h of ["range", "if-none-match", "if-modified-since"]) {
    const v = req.headers.get(h);
    if (v) forward[h] = v;
  }

  let upstream: Response;
  try {
    // Follow up to two redirects, but only to other allowed Confluence paths.
    for (let hop = 0; ; hop++) {
      const [p, q] = path.split("?", 2);
      upstream = await client().raw(ctx.token, p, {
        query: Object.fromEntries(new URLSearchParams(q ?? "")),
        headers: forward,
        signal: req.signal,
      });
      const location = upstream.headers.get("location");
      if (upstream.status >= 300 && upstream.status < 400 && upstream.status !== 304 && location && hop < 2) {
        const next = new URL(location, client().baseUrl);
        const base = new URL(client().baseUrl);
        const nextPath = next.pathname + next.search;
        if (next.origin === base.origin && isAllowedPath(nextPath)) {
          await upstream.body?.cancel();
          path = nextPath;
          continue;
        }
      }
      break;
    }
  } catch {
    return new Response("Confluence unavailable", { status: 502 });
  }

  if (upstream.status === 401 || (upstream.status >= 300 && upstream.status < 400 && upstream.status !== 304)) {
    await upstream.body?.cancel();
    return new Response("Unauthorized", { status: 401 });
  }
  if (upstream.status === 403 || upstream.status === 404) {
    await upstream.body?.cancel();
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  for (const h of PASS_THROUGH) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("Cache-Control", "private, max-age=300");
  headers.set("X-Content-Type-Options", "nosniff");
  // Even if a file is opened directly, it can't run script or reach our origin.
  headers.set("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; media-src 'self'");
  if (ACTIVE_TYPES.test(headers.get("content-type") ?? "")) {
    headers.set("Content-Disposition", "attachment");
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
