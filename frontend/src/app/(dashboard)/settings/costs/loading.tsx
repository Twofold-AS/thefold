export default function Loading() {
  return (
    <div>
      {/* Header with right cell */}
      <div
        className="flex items-stretch flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border)", minHeight: "80px" }}
      >
        {/* Title cell */}
        <div
          className="flex items-center px-5 shrink-0"
          style={{ borderRight: "1px solid var(--border)", minWidth: "180px" }}
        >
          <div className="skeleton" style={{ width: "110px", height: "24px" }} />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right cell: Back to settings */}
        <div
          className="flex items-center px-4 shrink-0"
          style={{ borderLeft: "1px solid var(--border)" }}
        >
          <div className="skeleton" style={{ width: "130px", height: "14px" }} />
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* 3 cost cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {["I dag", "Denne uken", "Denne maneden"].map((_, i) => (
            <div
              key={i}
              style={{ border: "1px solid var(--border)", padding: "16px" }}
            >
              <div className="skeleton" style={{ width: "70px", height: "11px", marginBottom: "8px" }} />
              <div className="skeleton" style={{ width: "100px", height: "28px", marginBottom: "8px" }} />
              <div className="flex gap-3">
                <div className="skeleton" style={{ width: "80px", height: "10px" }} />
                <div className="skeleton" style={{ width: "50px", height: "10px" }} />
              </div>
            </div>
          ))}
        </div>

        {/* Per-model table */}
        <div style={{ border: "1px solid var(--border)" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="skeleton" style={{ width: "180px", height: "14px" }} />
          </div>
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "8px 16px" }}>
                  <div className="skeleton" style={{ width: "50px", height: "12px" }} />
                </th>
                <th style={{ textAlign: "right", padding: "8px 16px" }}>
                  <div className="skeleton" style={{ width: "30px", height: "12px", marginLeft: "auto" }} />
                </th>
                <th style={{ textAlign: "right", padding: "8px 16px" }}>
                  <div className="skeleton" style={{ width: "50px", height: "12px", marginLeft: "auto" }} />
                </th>
                <th style={{ textAlign: "right", padding: "8px 16px" }}>
                  <div className="skeleton" style={{ width: "55px", height: "12px", marginLeft: "auto" }} />
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 16px" }}>
                    <div className="skeleton" style={{ width: `${100 + i * 20}px`, height: "12px" }} />
                  </td>
                  <td style={{ padding: "8px 16px" }}>
                    <div className="skeleton" style={{ width: "30px", height: "12px", marginLeft: "auto" }} />
                  </td>
                  <td style={{ padding: "8px 16px" }}>
                    <div className="skeleton" style={{ width: "60px", height: "12px", marginLeft: "auto" }} />
                  </td>
                  <td style={{ padding: "8px 16px" }}>
                    <div className="skeleton" style={{ width: "50px", height: "12px", marginLeft: "auto" }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Daily trend chart area */}
        <div style={{ border: "1px solid var(--border)" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="skeleton" style={{ width: "120px", height: "14px" }} />
          </div>
          <div className="px-4 py-4">
            <div className="flex items-end gap-1" style={{ height: "120px" }}>
              {Array.from({ length: 14 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ flex: 1, height: `${20 + Math.random() * 80}%` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
