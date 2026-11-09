export default function Loading() {
  return (
    <div className="doc-layout">
      <aside className="doc-sidebar">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="skeleton" style={{ height: 18, margin: "10px 10px", width: `${60 + ((i * 17) % 35)}%` }} />
        ))}
      </aside>
      <main className="doc-main">
        <div className="doc-inner">
          <div className="skeleton" style={{ height: 14, width: 220, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 34, width: "60%", marginBottom: 24 }} />
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton" style={{ height: 14, width: `${70 + ((i * 13) % 30)}%`, marginBottom: 12 }} />
          ))}
        </div>
      </main>
    </div>
  );
}
