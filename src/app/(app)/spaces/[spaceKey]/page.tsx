import Link from "next/link";
import { redirect } from "next/navigation";
import { PageTree } from "@/components/page-tree";
import { handlePageError, requireConfluence } from "@/server/auth/session";
import { getSpace } from "@/server/confluence/service";

/** Opens a space at its home page, or shows its page tree if it has none. */
export default async function SpacePage({ params }: { params: Promise<{ spaceKey: string }> }) {
  const { spaceKey } = await params;
  const key = decodeURIComponent(spaceKey);
  const { confluence } = await requireConfluence();

  let space: Awaited<ReturnType<typeof getSpace>>;
  try {
    space = await getSpace(confluence.ctx, key);
  } catch (err) {
    handlePageError(err);
  }
  if (space.homepageId) redirect(`/pages/${space.homepageId}`);

  return (
    <div className="doc-layout">
      <aside className="doc-sidebar">
        <Link className="sidebar-space" href={`/spaces/${encodeURIComponent(space.key)}`}>
          {space.name}
        </Link>
        <PageTree spaceKey={space.key} />
      </aside>
      <main className="doc-main">
        <div className="doc-inner">
          <h1 className="doc-title">{space.name}</h1>
          <p className="page-subtitle">This space has no home page. Pick a page from the tree.</p>
        </div>
      </main>
    </div>
  );
}
