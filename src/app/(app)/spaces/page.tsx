import Link from "next/link";
import { handlePageError, requireConfluence } from "@/server/auth/session";
import { listSpaces } from "@/server/confluence/service";

export const metadata = { title: "Spaces" };

const PAGE_SIZE = 48;

export default async function SpacesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; start?: string }>;
}) {
  const params = await searchParams;
  const type = params.type === "personal" ? "personal" : "global";
  const start = Math.max(0, Number.parseInt(params.start ?? "0", 10) || 0);
  const { confluence } = await requireConfluence();

  let result: Awaited<ReturnType<typeof listSpaces>>;
  try {
    result = await listSpaces(confluence.ctx, { type, start, limit: PAGE_SIZE });
  } catch (err) {
    handlePageError(err);
  }

  const link = (s: number) => `/spaces?type=${type}${s ? `&start=${s}` : ""}`;

  return (
    <div className="page-container">
      <h1 className="page-title">Spaces</h1>
      <p className="page-subtitle">Spaces you have access to in Confluence.</p>

      <nav className="tabs">
        <Link href="/spaces" aria-current={type === "global" ? "page" : undefined}>
          Team spaces
        </Link>
        <Link href="/spaces?type=personal" aria-current={type === "personal" ? "page" : undefined}>
          Personal spaces
        </Link>
      </nav>

      {result.spaces.length === 0 ? (
        <p className="empty">No spaces to show.</p>
      ) : (
        <div className="space-grid">
          {result.spaces.map((s) => (
            <Link key={s.key} href={`/spaces/${encodeURIComponent(s.key)}`} className="space-card">
              <div className="key">{s.key}</div>
              <div className="name">{s.name}</div>
              {s.description && <div className="desc">{s.description}</div>}
            </Link>
          ))}
        </div>
      )}

      {(start > 0 || result.hasMore) && (
        <div className="pager">
          {start > 0 ? (
            <Link className="btn btn-small" href={link(Math.max(0, start - PAGE_SIZE))}>
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          {result.hasMore && (
            <Link className="btn btn-small" href={link(start + PAGE_SIZE)}>
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
