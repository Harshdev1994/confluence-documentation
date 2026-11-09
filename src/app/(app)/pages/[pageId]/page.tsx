import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContent } from "@/components/page-content";
import { PageTree } from "@/components/page-tree";
import { getAppSession, handlePageError, requireConfluence } from "@/server/auth/session";
import { confluencePageUrl, getPageMeta, getPageView } from "@/server/confluence/service";
import type { PageView } from "@/server/confluence/types";

type Params = { params: Promise<{ pageId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { pageId } = await params;
  const session = await getAppSession();
  if (!session?.confluence || !/^\d+$/.test(pageId)) return {};
  try {
    // Served from the per-user cache that the page itself fills.
    const meta = await getPageMeta(session.confluence.ctx, pageId);
    return { title: meta.title };
  } catch {
    return {};
  }
}

function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { dateStyle: "medium" });
}

export default async function DocPage({ params }: Params) {
  const { pageId } = await params;
  if (!/^\d+$/.test(pageId)) notFound();
  const { confluence } = await requireConfluence();

  let view: PageView;
  try {
    view = await getPageView(confluence.ctx, pageId);
  } catch (err) {
    handlePageError(err);
  }
  const { meta } = view;

  return (
    <div className="doc-layout">
      <aside className="doc-sidebar">
        <Link className="sidebar-space" href={`/spaces/${encodeURIComponent(meta.spaceKey)}`}>
          {meta.spaceName}
        </Link>
        <PageTree spaceKey={meta.spaceKey} activeId={meta.id} expandedIds={meta.ancestors.map((a) => a.id)} />
      </aside>

      <main className="doc-main">
        <article className="doc-inner">
          {meta.ancestors.length > 0 && (
            <nav className="breadcrumbs" aria-label="Breadcrumb">
              {meta.ancestors.map((a, i) => (
                <span key={a.id}>
                  {i > 0 && <span aria-hidden>/ </span>}
                  <Link href={`/pages/${a.id}`}>{a.title}</Link>
                </span>
              ))}
            </nav>
          )}
          <h1 className="doc-title">{meta.title}</h1>
          <div className="doc-meta">
            {meta.updatedBy && <span>Last updated by {meta.updatedBy}</span>}
            {meta.updatedAt && <span>{formatDate(meta.updatedAt)}</span>}
            <span className="badge">v{meta.version}</span>
            <span className="spacer" />
            <a href={confluencePageUrl(meta.id)} target="_blank" rel="noopener noreferrer">
              Open in Confluence ↗
            </a>
          </div>
          <PageContent html={view.html} />
        </article>
      </main>
    </div>
  );
}
