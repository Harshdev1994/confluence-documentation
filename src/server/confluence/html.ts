import sanitizeHtml from "sanitize-html";

/**
 * Turns Confluence's rendered page HTML (body.view) into HTML that is safe to
 * insert into our app:
 *
 * - removes scripts, event handlers, iframes, forms and anything not allowlisted
 * - rewrites links to other Confluence pages so they open inside this app
 * - routes images and attachments through our authenticated file proxy,
 *   because the browser itself has no Confluence session
 * - points anything else at Confluence in a new tab
 */

/** Paths the file proxy is allowed to fetch from Confluence. */
export const PROXYABLE_PREFIXES = [
  "/download/",
  "/images/",
  "/s/",
  "/plugins/servlet/",
  "/rest/documentConversion/",
];

/** True when the file proxy may fetch this Confluence path. */
export function isAllowedPath(path: string) {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return false;
  if (/\.\.|%2e/i.test(path)) return false; // literal or encoded dot segments
  // Check the path as the URL parser will normalise it, not as written.
  const normalised = new URL(path, "http://confluence.local").pathname;
  return PROXYABLE_PREFIXES.some((p) => normalised.startsWith(p) && path.startsWith(p));
}

export function fileProxyUrl(confluencePath: string) {
  return `/api/confluence-file?path=${encodeURIComponent(confluencePath)}`;
}

export interface MappedUrl {
  url: string;
  /** True when the link leaves this app (opens Confluence or an external site). */
  external: boolean;
}

export function mapConfluenceUrl(raw: string, baseUrl: string, kind: "link" | "src"): MappedUrl | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith("#")) return { url: value, external: false };
  if (/^mailto:/i.test(value)) return kind === "link" ? { url: value, external: false } : null;
  if (/^data:image\//i.test(value)) return kind === "src" ? { url: value, external: false } : null;

  let path: string;
  if (value.toLowerCase().startsWith(baseUrl.toLowerCase())) {
    path = value.slice(baseUrl.length) || "/";
  } else if (value.startsWith("/") && !value.startsWith("//")) {
    path = value;
  } else if (/^https?:\/\//i.test(value)) {
    return { url: value, external: true };
  } else {
    return null; // javascript:, protocol-relative, relative-without-slash, etc.
  }

  const parsed = new URL(path, "http://confluence.local");
  const hash = parsed.hash;

  if (parsed.pathname === "/pages/viewpage.action" && parsed.searchParams.get("pageId")) {
    const id = parsed.searchParams.get("pageId")!;
    if (/^\d+$/.test(id)) return { url: `/pages/${id}${hash}`, external: false };
  }

  const display = parsed.pathname.match(/^\/display\/([^/]+)\/?(.*)$/);
  if (display) {
    const spaceKey = decodeURIComponent(display[1]);
    const title = decodeURIComponent(display[2].replace(/\+/g, " "));
    if (!title) return { url: `/spaces/${encodeURIComponent(spaceKey)}`, external: false };
    const q = new URLSearchParams({ space: spaceKey, title });
    return { url: `/resolve?${q}${hash}`, external: false };
  }

  if (parsed.pathname === "/spaces/viewspace.action" && parsed.searchParams.get("key")) {
    return { url: `/spaces/${encodeURIComponent(parsed.searchParams.get("key")!)}`, external: false };
  }

  if (PROXYABLE_PREFIXES.some((p) => parsed.pathname.startsWith(p))) {
    return { url: fileProxyUrl(parsed.pathname + parsed.search), external: false };
  }

  return kind === "link" ? { url: baseUrl + parsed.pathname + parsed.search + hash, external: true } : null;
}

const STYLE_VALUE = [/^[#a-z0-9(),.%\s-]+$/i];

export function sanitizeConfluenceHtml(html: string, baseUrl: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "img", "span", "div", "h1", "h2", "h3", "h4", "h5", "h6",
      "colgroup", "col", "del", "ins", "s", "u", "sub", "sup", "mark", "time",
      "details", "summary", "figure", "figcaption",
    ],
    disallowedTagsMode: "discard",
    allowedAttributes: {
      "*": ["class", "id", "title", "style", "align", "dir", "lang", "data-*"],
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "width", "height", "loading"],
      td: ["colspan", "rowspan", "valign"],
      th: ["colspan", "rowspan", "scope", "valign"],
      col: ["span", "width"],
      table: ["width"],
      ol: ["start", "type"],
      time: ["datetime"],
    },
    allowedStyles: {
      "*": {
        color: STYLE_VALUE,
        "background-color": STYLE_VALUE,
        "text-align": [/^(left|right|center|justify)$/],
        "text-decoration": STYLE_VALUE,
        "font-weight": STYLE_VALUE,
        "font-style": STYLE_VALUE,
        width: STYLE_VALUE,
        "min-width": STYLE_VALUE,
        "max-width": STYLE_VALUE,
        height: STYLE_VALUE,
        "margin-left": STYLE_VALUE,
        "padding-left": STYLE_VALUE,
        "list-style-type": STYLE_VALUE,
      },
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => {
        const out: Record<string, string> = { ...attribs };
        delete out.target;
        delete out.rel;
        if (attribs.href) {
          const mapped = mapConfluenceUrl(attribs.href, baseUrl, "link");
          if (!mapped) delete out.href;
          else {
            out.href = mapped.url;
            if (mapped.external) {
              out.target = "_blank";
              out.rel = "noopener noreferrer";
            }
          }
        }
        return { tagName, attribs: out };
      },
      img: (tagName, attribs) => {
        const out: Record<string, string> = { ...attribs };
        delete out.srcset;
        const mapped = attribs.src ? mapConfluenceUrl(attribs.src, baseUrl, "src") : null;
        if (mapped) out.src = mapped.url;
        else delete out.src;
        out.loading = "lazy";
        return { tagName, attribs: out };
      },
    },
  });
}
