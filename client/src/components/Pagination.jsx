export default function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const list = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  return (
    <nav className="pagination" aria-label="Pagination">
      <button className="btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>← Prev</button>
      {list.map((p, i) => (
        <span key={p}>{i > 0 && p - list[i - 1] > 1 && <span className="gap">…</span>}<button className={`btn ${p === page ? 'active' : ''}`} aria-current={p === page ? 'page' : undefined} onClick={() => onChange(p)}>{p}</button></span>
      ))}
      <button className="btn" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next →</button>
    </nav>
  );
}
