"use client";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="center-card">
      <h1>Something went wrong</h1>
      <p>We couldn&apos;t load this from Confluence. It may be busy or briefly unavailable.</p>
      <button className="btn btn-primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
