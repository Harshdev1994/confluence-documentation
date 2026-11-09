/** Subset of Confluence Data Center REST API v1 shapes used by this app. */

export interface ConfluenceUser {
  type: string;
  username: string;
  userKey: string;
  displayName: string;
  profilePicture?: { path: string };
}

export interface Paged<T> {
  results: T[];
  start: number;
  limit: number;
  size: number;
  _links?: { next?: string; base?: string };
}

export interface ConfluenceContent {
  id: string;
  type: "page" | "blogpost" | "comment" | "attachment";
  status: string;
  title: string;
  space?: { key: string; name: string; type?: string };
  version?: {
    number: number;
    when: string;
    message?: string;
    by?: { displayName: string; username?: string; userKey?: string };
  };
  ancestors?: ConfluenceContent[];
  body?: { view?: { value: string }; storage?: { value: string } };
  children?: { page?: Paged<ConfluenceContent> };
  _links?: { webui?: string; tinyui?: string };
}

export interface ConfluenceSpace {
  id: number;
  key: string;
  name: string;
  type: "global" | "personal";
  description?: { plain?: { value: string } };
  homepage?: ConfluenceContent;
  _links?: { webui?: string };
}

/* App-level shapes returned to the UI */

export interface PageMeta {
  id: string;
  title: string;
  spaceKey: string;
  spaceName: string;
  version: number;
  updatedAt: string;
  updatedBy: string;
  ancestors: Array<{ id: string; title: string }>;
}

export interface PageView {
  meta: PageMeta;
  html: string;
  /** True when the page has macros whose output depends on the viewer. */
  userDependent: boolean;
}

export interface TreeNode {
  id: string;
  title: string;
  hasChildren: boolean;
}

export interface SpaceSummary {
  key: string;
  name: string;
  type: "global" | "personal";
  description: string;
}
