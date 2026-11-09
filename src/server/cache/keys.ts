import { createHash } from "node:crypto";

/**
 * Cache key layout.
 *
 * Shared (safe for all users, because the permission check runs first):
 *   page:{id}:v{version}:view          rendered HTML of a page version with no user-specific macros
 *
 * Per user (content may differ by user's permissions):
 *   meta:{user}:{id}                   permission check result + current version (short TTL)
 *   page:{id}:v{version}:u:{user}      rendered HTML of a page with user-specific macros
 *   tree:{space}:g{gen}:u:{user}:{parent}   page tree children
 *
 * Generations:
 *   gen:space:{space}                  bumped by webhooks when pages in a space change,
 *                                      which instantly orphans that space's tree entries
 */

export const userKey = (userId: string) => createHash("sha256").update(userId).digest("hex").slice(0, 16);

export const keys = {
  pageMeta: (user: string, pageId: string) => `meta:${user}:${pageId}`,
  sharedView: (pageId: string, version: number) => `page:${pageId}:v${version}:view`,
  userView: (pageId: string, version: number, user: string) => `page:${pageId}:v${version}:u:${user}`,
  spaceGen: (spaceKey: string) => `gen:space:${spaceKey}`,
  tree: (spaceKey: string, gen: number, user: string, parentId: string | "root") =>
    `tree:${spaceKey}:g${gen}:u:${user}:${parentId}`,
};

export const ttl = {
  /** How long a user's access check for a page is trusted. Webhooks clear it sooner. */
  pageMeta: 60,
  /** Version-keyed content never goes stale; TTL only bounds memory use. */
  sharedView: 24 * 3600,
  userView: 120,
  tree: 300,
};
