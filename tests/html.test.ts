import { describe, expect, it } from "vitest";
import { isAllowedPath, mapConfluenceUrl, sanitizeConfluenceHtml } from "@/server/confluence/html";

const BASE = "https://confluence.example.com";

describe("mapConfluenceUrl", () => {
  it("keeps page links inside the app", () => {
    expect(mapConfluenceUrl("/pages/viewpage.action?pageId=123#Install", BASE, "link")).toEqual({ url: "/pages/123#Install", external: false });
    expect(mapConfluenceUrl(`${BASE}/pages/viewpage.action?pageId=55`, BASE, "link")?.url).toBe("/pages/55");
    expect(mapConfluenceUrl("/display/ENG/Release+Notes+2026", BASE, "link")?.url).toBe("/resolve?space=ENG&title=Release+Notes+2026");
    expect(mapConfluenceUrl("/display/~jdoe", BASE, "link")?.url).toBe("/spaces/~jdoe");
  });

  it("routes images and attachments through the file proxy", () => {
    expect(mapConfluenceUrl("/download/attachments/1/a b.png?version=2", BASE, "src")?.url).toBe(
      // the path stays URL-encoded so it is sent to Confluence exactly as written
      "/api/confluence-file?path=%2Fdownload%2Fattachments%2F1%2Fa%2520b.png%3Fversion%3D2",
    );
  });

  it("sends other Confluence URLs and external links to a new tab", () => {
    expect(mapConfluenceUrl("/admin/console.action", BASE, "link")).toEqual({ url: `${BASE}/admin/console.action`, external: true });
    expect(mapConfluenceUrl("https://example.org/x", BASE, "link")).toEqual({ url: "https://example.org/x", external: true });
  });

  it("drops dangerous URLs", () => {
    expect(mapConfluenceUrl("javascript:alert(1)", BASE, "link")).toBeNull();
    expect(mapConfluenceUrl("//evil.com/x.png", BASE, "src")).toBeNull();
    expect(mapConfluenceUrl("/admin/x", BASE, "src")).toBeNull();
  });
});

describe("sanitizeConfluenceHtml", () => {
  it("removes scripts, handlers and iframes", () => {
    const out = sanitizeConfluenceHtml(
      `<p onclick="x()">Hi<script>alert(1)</script></p><iframe src="https://x"></iframe><img src="x" onerror="alert(1)">`,
      BASE,
    );
    expect(out).not.toMatch(/script|onclick|onerror|iframe/);
    expect(out).toContain("<p>Hi</p>");
  });

  it("keeps Confluence macro markup and rewrites links", () => {
    const out = sanitizeConfluenceHtml(
      `<div class="confluence-information-macro confluence-information-macro-warning"><p>Careful</p></div>` +
        `<a href="/pages/viewpage.action?pageId=7">Next</a><img class="confluence-embedded-image" src="/download/thumbnails/7/x.png">`,
      BASE,
    );
    expect(out).toContain('class="confluence-information-macro confluence-information-macro-warning"');
    expect(out).toContain('href="/pages/7"');
    expect(out).toContain('src="/api/confluence-file?path=%2Fdownload%2Fthumbnails%2F7%2Fx.png"');
    expect(out).toContain('loading="lazy"');
  });

  it("only allows harmless inline styles", () => {
    const out = sanitizeConfluenceHtml(`<span style="color: #ff0000; position: fixed; background-image: url(x)">r</span>`, BASE);
    expect(out).toContain("color:#ff0000");
    expect(out).not.toMatch(/position|url\(/);
  });
});

describe("isAllowedPath", () => {
  it("only allows file paths", () => {
    expect(isAllowedPath("/download/attachments/1/a.pdf")).toBe(true);
    expect(isAllowedPath("/rest/api/content/1")).toBe(false);
    expect(isAllowedPath("/download/../rest/api/user/current")).toBe(false);
    expect(isAllowedPath("//evil.com/download/x")).toBe(false);
    expect(isAllowedPath("/download/%2e%2e/rest/api/user/current")).toBe(false);
    expect(isAllowedPath("/download/%2E%2E/rest/api")).toBe(false);
  });
});
