export default function Loading() {
  return (
    <div className="p-6 space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-14 animate-pulse" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }} />
      ))}
    </div>
  );
}
