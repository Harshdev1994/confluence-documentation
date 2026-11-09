import Link from "next/link";

export default function NotFound() {
  return (
    <div className="center-card">
      <h1>Page not available</h1>
      <p>
        This page doesn&apos;t exist, or your Confluence account doesn&apos;t have permission to view it.
      </p>
      <Link className="btn" href="/spaces">
        Back to spaces
      </Link>
    </div>
  );
}
