/**
 * Macros whose rendered output depends on who is viewing (their permissions,
 * their Jira access, their profile) or on content outside the page itself.
 *
 * A page containing any of these is rendered and cached per user, so one
 * user's view can never leak restricted titles or data to another user.
 * Everything else is rendered once per page version and shared.
 */
export const USER_DEPENDENT_MACROS = new Set([
  // page trees and listings filtered by the viewer's permissions
  "children",
  "pagetree",
  "pagetreesearch",
  "page-index",
  "contentbylabel",
  "content-by-user",
  "content-report-table",
  "detailssummary",
  "recently-updated",
  "recently-updated-dashboard",
  "blog-posts",
  "popular-labels",
  "listlabels",
  "related-labels",
  "favpages",
  "spaces",
  "space-details",
  "tasks-report-macro",
  "excerpt-include",
  "include",
  "create-space-button",
  // external systems queried with the viewer's identity
  "jira",
  "jiraissues",
  "jirachart",
  "jira-chart",
  // people / social
  "profile",
  "userlister",
  "network",
  "status-list",
  "contributors",
  "contributors-summary",
]);

const MACRO_NAME = /<ac:(?:structured-)?macro\b[^>]*?\bac:name="([^"]+)"/g;

/** Returns the distinct macro names used in a storage-format body. */
export function listMacros(storage: string): string[] {
  const names = new Set<string>();
  for (const match of storage.matchAll(MACRO_NAME)) names.add(match[1].toLowerCase());
  return [...names];
}

/** True when the page must be rendered per user rather than shared. */
export function isUserDependent(storage: string): boolean {
  return listMacros(storage).some((m) => USER_DEPENDENT_MACROS.has(m));
}
