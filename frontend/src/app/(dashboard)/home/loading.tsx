export default function Loading() {
  return (
    <div>
      {/* Header */}
      <div
        className="flex items-stretch"
        style={{ borderBottom: "1px solid var(--border)", minHeight: "80px" }}
      >
        <div className="flex flex-col justify-center px-5 py-3">
          <div className="skeleton" style={{ width: "200px", height: "24px", marginBottom: "8px" }} />
          <div className="skeleton" style={{ width: "260px", height: "14px" }} />
        </div>
      </div>

      <div className="p-8">
        {/* Stats row — 4 stat boxes */}
        <div className="flex items-start gap-8 lg:gap-12 mb-8">
          {[120, 100, 110, 80].map((w, i) => (
            <div key={i} className="text-left">
              <div className="skeleton" style={{ width: "80px", height: "10px", marginBottom: "8px" }} />
              <div className="skeleton" style={{ width: `${w}px`, height: "48px" }} />
            </div>
          ))}
        </div>

        {/* Dashboard grid — 2 cols */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Active Tasks card */}
          <div style={{ border: "1px solid var(--border)", padding: "20px" }}>
            <div className="skeleton" style={{ width: "140px", height: "20px", marginBottom: "16px" }} />
            <table className="w-full">
              <thead>
                <tr>
                  <th style={{ padding: "8px 16px", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                    <div className="skeleton" style={{ width: "30px", height: "11px" }} />
                  </th>
                  <th style={{ padding: "8px 16px", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                    <div className="skeleton" style={{ width: "40px", height: "11px" }} />
                  </th>
                  <th style={{ padding: "8px 16px", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                    <div className="skeleton" style={{ width: "50px", height: "11px" }} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                      <div className="skeleton" style={{ width: "60px", height: "14px" }} />
                    </td>
                    <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                      <div className="skeleton" style={{ width: `${140 + i * 20}px`, height: "14px" }} />
                    </td>
                    <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                      <div className="skeleton" style={{ width: "60px", height: "20px" }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Recent Activity card */}
          <div style={{ border: "1px solid var(--border)", padding: "20px" }}>
            <div className="skeleton" style={{ width: "150px", height: "20px", marginBottom: "16px" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="skeleton" style={{ width: "8px", height: "8px", marginTop: "6px", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ width: `${180 + i * 15}px`, height: "14px", marginBottom: "4px" }} />
                    <div className="skeleton" style={{ width: "80px", height: "12px" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions card */}
          <div style={{ border: "1px solid var(--border)", padding: "20px" }}>
            <div className="skeleton" style={{ width: "130px", height: "20px", marginBottom: "16px" }} />
            <div className="flex flex-wrap gap-3">
              <div className="skeleton" style={{ width: "100px", height: "36px" }} />
              <div className="skeleton" style={{ width: "110px", height: "36px" }} />
              <div className="skeleton" style={{ width: "100px", height: "36px" }} />
            </div>
          </div>

          {/* Agent Status card */}
          <div style={{ border: "1px solid var(--border)", padding: "20px" }}>
            <div className="skeleton" style={{ width: "120px", height: "20px", marginBottom: "16px" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="skeleton" style={{ width: "140px", height: "14px" }} />
                  <div className="skeleton" style={{ width: "50px", height: "14px" }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
