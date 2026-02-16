export default function Loading() {
  return (
    <div>
      {/* Header */}
      <div
        className="flex items-stretch"
        style={{ borderBottom: "1px solid var(--border)", minHeight: "80px" }}
      >
        <div
          className="flex items-center px-5 shrink-0"
          style={{ borderRight: "1px solid var(--border)", minWidth: "180px" }}
        >
          <div className="skeleton" style={{ width: "130px", height: "24px" }} />
        </div>
        <div className="flex-1" />
      </div>

      <div className="p-6">
        <div className="mt-8 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between"
              style={{ border: "1px solid var(--border)", padding: "16px 24px" }}
            >
              <div className="flex items-center gap-4">
                <div className="skeleton" style={{ width: "20px", height: "20px", flexShrink: 0 }} />
                <div>
                  <div className="flex items-center gap-3">
                    <div className="skeleton" style={{ width: `${180 + i * 30}px`, height: "16px" }} />
                    <div className="skeleton" style={{ width: "60px", height: "18px" }} />
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="skeleton" style={{ width: `${220 + i * 20}px`, height: "12px" }} />
                    <div className="skeleton" style={{ width: "80px", height: "12px" }} />
                  </div>
                </div>
              </div>
              <div className="skeleton" style={{ width: "60px", height: "32px" }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
