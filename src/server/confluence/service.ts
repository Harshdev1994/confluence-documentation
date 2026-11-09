import "server-only";
import { cache as perRequest } from "react";
import { env } from "@/server/env";
import { cache } from "@/server/cache/store";
import { keys, ttl } from "@/server/cache/keys";
import { ConfluenceClient } from "./client";
import { sanitizeConfluenceHtml } from "./html";
import { isUserDependent } from "./macros";
import type {
  ConfluenceContent,
  ConfluenceSpace,
  ConfluenceUser,
  PageMeta,
  PageView,
  Paged,
  SpaceSummary,
  TreeNode,
} from "./types";

/** Who is calling: their PAT and a hashed id used in cache keys. */
export interface UserContext {
  token: string;
  user: string;
}

const globalForClient = globalThis as unknown as { __cpClient?: ConfluenceClient };

export function client(): ConfluenceClient {
  if (!globalForClient.__cpClient) {
    const { CONFLUENCE_BASE_URL, CONFLUENCE_TIMEOUT_MS } = env();
    globalForClient.__cpClient = new ConfluenceClient({
      baseUrl: CONFLUENCE_BASE_URL,
      timeoutMs: CONFLUENCE_TIMEOUT_MS,
    });
  }
  return globalForClient.__cpClient;
}

/* ---------------------------------------------------------------- users */

export function getCurrentUser(token: string) {
  return client().json<ConfluenceUser>(token, "/rest/api/user/current");
}

/* --------------------------------------------------------------- server */

export interface ConfluenceInfo {
  version: string | null;
  reachable: boolean;
}

export function parseManifestVersion(xml: string): string | null {
  return xml.match(/<version>\s*([^<\s]+)\s*<\/version>/)?.[1] ?? null;
}

/** Reads the Confluence version from the public app-links manifest. Cached 1 hour. */
export async function getConfluenceInfo(): Promise<ConfluenceInfo> {
  const key = "server:info";
  const hit = await cache().get<ConfluenceInfo>(key);
  if (hit) return hit;
  let info: ConfluenceInfo;
  try {
    const res = await client().raw(null, "/rest/applinks/1.0/manifest", {
      headers: { Accept: "application/xml" },
    });
    info = { version: res.ok ? parseManifestVersion(await res.text()) : null, reachable: res.status < 500 };
  } catch {
    info = { version: null, reachable: false };
  }
  await cache().set(key, info, info.reachable ? 3600 : 30);
  return info;
}

/* --------------------------------------------------------------- spaces */

export async function listSpaces(
  ctx: UserContext,
  opts: { type: "global" | "personal"; start: number; limit: number },
): Promise<{ spaces: SpaceSummary[]; hasMore: boolean }> {
  const key = `spaces:${ctx.user}:${opts.type}:${opts.start}:${opts.limit}`;
  const hit = await cache().get<{ spaces: SpaceSummary[]; hasMore: boolean }>(key);
  if (hit) return hit;
  const data = await client().json<Paged<ConfluenceSpace>>(ctx.token, "/rest/api/space", {
    query: { type: opts.type, start: opts.start, limit: opts.limit, expand: "description.plain", status: "current" },
  });
  const result = {
    spaces: data.results.map((s) => ({
      key: s.key,
      name: s.name,
      type: s.type,
      description: s.description?.plain?.value ?? "",
    })),
    hasMore: Boolean(data._links?.next),
  };
  await cache().set(key, result, 300);
  return result;
}

export async function getSpace(ctx: UserContext, spaceKey: string) {
  const s = await client().json<ConfluenceSpace>(ctx.token, `/rest/api/space/${encodeURIComponent(spaceKey)}`, {
    query: { expand: "homepage,description.plain" },
  });
  return { key: s.key, name: s.name, type: s.type, homepageId: s.homepage?.id ?? null };
}

/* ---------------------------------------------------------------- pages */

function toMeta(c: ConfluenceContent): PageMeta {
  return {
    id: c.id,
    title: c.title,
    spaceKey: c.space?.key ?? "",
    spaceName: c.space?.name ?? "",
    version: c.version?.number ?? 1,
    updatedAt: c.version?.when ?? "",
    updatedBy: c.version?.by?.displayName ?? "",
    ancestors: (c.ancestors ?? []).map((a) => ({ id: a.id, title: a.title })),
  };
}

/**
 * Permission check plus current version, made with the user's own token.
 * Confluence returns 404 when the user can't see the page.
 * Cached per user for a short time; webhooks clear it on change.
 */
export function getPageMeta(ctx: UserContext, pageId: string): Promise<PageMeta> {
  return loadPageMeta(ctx.token, ctx.user, pageId);
}

// Deduplicated within one request (page + metadata both ask), then cached per user.
const loadPageMeta = perRequest(async (token: string, user: string, pageId: string): Promise<PageMeta> => {
  const key = keys.pageMeta(user, pageId);
  const hit = await cache().get<PageMeta>(key);
  if (hit) return hit;
  const content = await client().json<ConfluenceContent>(token, `/rest/api/content/${pageId}`, {
    query: { expand: "version,space,ancestors" },
  });
  const meta = toMeta(content);
  await cache().set(key, meta, ttl.pageMeta);
  return meta;
});

interface CachedView {
  userDependent: boolean;
  /** Present for shared entries; absent on the marker that says "render per user". */
  html?: string;
}

/**
 * Rendered page HTML.
 *
 * 1. Access is always checked first with the user's token (getPageMeta).
 * 2. Pages with no user-dependent macros are rendered once per version and
 *    shared across users. A new version is a new cache key, so it's never stale.
 * 3. Pages with user-dependent macros are rendered with the user's token and
 *    cached only for that user, briefly.
 */
export async function getPageView(ctx: UserContext, pageId: string): Promise<PageView> {
  const meta = await getPageMeta(ctx, pageId);
  const shared = keys.sharedView(pageId, meta.version);
  const sharedHit = await cache().get<CachedView>(shared);

  if (sharedHit && !sharedHit.userDependent && sharedHit.html !== undefined) {
    return { meta, html: sharedHit.html, userDependent: false };
  }
  const perUser = keys.userView(pageId, meta.version, ctx.user);
  if (sharedHit?.userDependent) {
    const userHit = await cache().get<string>(perUser);
    if (userHit !== undefined) return { meta, html: userHit, userDependent: true };
  }

  const content = await client().json<ConfluenceContent>(ctx.token, `/rest/api/content/${pageId}`, {
    query: { expand: "body.view,body.storage,version" },
  });
  const html = sanitizeConfluenceHtml(content.body?.view?.value ?? "", client().baseUrl);
  const userDependent = isUserDependent(content.body?.storage?.value ?? "");
  const renderedVersion = content.version?.number ?? meta.version;

  if (userDependent) {
    await cache().set(keys.sharedView(pageId, renderedVersion), { userDependent: true } satisfies CachedView, ttl.sharedView);
    await cache().set(keys.userView(pageId, renderedVersion, ctx.user), html, ttl.userView);
  } else {
    await cache().set(keys.sharedView(pageId, renderedVersion), { userDependent: false, html } satisfies CachedView, ttl.sharedView);
  }
  return { meta: { ...meta, version: renderedVersion }, html, userDependent };
}

/** Finds a page by space and exact title (used to resolve /display/SPACE/Title links). */
export async function findPageByTitle(ctx: UserContext, spaceKey: string, title: string): Promise<string | null> {
  const data = await client().json<Paged<ConfluenceContent>>(ctx.token, "/rest/api/content", {
    query: { spaceKey, title, type: "page", limit: 1 },
  });
  return data.results[0]?.id ?? null;
}

/* ----------------------------------------------------------------- tree */

const TREE_PAGE_SIZE = 200;
const TREE_MAX_CHILDREN = 2000;

function toNode(c: ConfluenceContent): TreeNode {
  return { id: c.id, title: c.title, hasChildren: (c.children?.page?.size ?? 0) > 0 };
}

/**
 * Children of a page (or root pages of a space), loaded lazily per node.
 * Cached per user, because restricted pages are hidden from some users.
 * The space generation number lets webhooks invalidate a whole space at once.
 */
export async function getChildren(ctx: UserContext, spaceKey: string, parentId: string | "root"): Promise<TreeNode[]> {
  const gen = await cache().getNumber(keys.spaceGen(spaceKey));
  const key = keys.tree(spaceKey, gen, ctx.user, parentId);
  const hit = await cache().get<TreeNode[]>(key);
  if (hit) return hit;

  const path =
    parentId === "root"
      ? `/rest/api/space/${encodeURIComponent(spaceKey)}/content/page`
      : `/rest/api/content/${parentId}/child/page`;

  const nodes: TreeNode[] = [];
  for (let start = 0; start < TREE_MAX_CHILDREN; start += TREE_PAGE_SIZE) {
    const data = await client().json<Paged<ConfluenceContent>>(ctx.token, path, {
      query: {
        start,
        limit: TREE_PAGE_SIZE,
        expand: "children.page",
        ...(parentId === "root" ? { depth: "root" } : {}),
      },
    });
    nodes.push(...data.results.map(toNode));
    if (!data._links?.next || data.results.length === 0) break;
  }
  await cache().set(key, nodes, ttl.tree);
  return nodes;
}

export function confluencePageUrl(pageId: string) {
  return `${client().baseUrl}/pages/viewpage.action?pageId=${pageId}`;
}
