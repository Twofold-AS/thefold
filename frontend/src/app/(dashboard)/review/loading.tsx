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
          <div className="skeleton" style={{ width: "90px", height: "24px" }} />
        </div>
        <div className="flex-1" />
      </div>

      <div className="p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Total count */}
          <div className="skeleton" style={{ width: "120px", height: "14px" }} />

          {/* Filter tabs */}
          <div className="flex gap-1 p-1" style={{ background: "var(--bg-hover)" }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ width: `${50 + i * 10}px`, height: "28px" }} />
            ))}
          </div>

          {/* Review table */}
          <div style={{ border: "1px solid var(--border)" }}>
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ textAlign: "left", padding: "12px 16px" }}>
                    <div className="skeleton" style={{ width: "40px", height: "12px" }} />
                  </th>
                  <th style={{ textAlign: "center", padding: "12px 16px" }}>
                    <div className="skeleton" style={{ width: "30px", height: "12px", margin: "0 auto" }} />
                  </th>
                  <th style={{ textAlign: "center", padding: "12px 16px" }}>
                    <div className="skeleton" style={{ width: "50px", height: "12px", margin: "0 auto" }} />
                  </th>
                  <th style={{ textAlign: "center", padding: "12px 16px" }}>
                    <div className="skeleton" style={{ width: "50px", height: "12px", margin: "0 auto" }} />
                  </th>
                  <th style={{ textAlign: "right", padding: "12px 16px" }}>
                    <div className="skeleton" style={{ width: "60px", height: "12px", marginLeft: "auto" }} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div className="skeleton" style={{ width: `${140 + i * 10}px`, height: "12px" }} />
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "center" }}>
                      <div className="skeleton" style={{ width: "20px", height: "12px", margin: "0 auto" }} />
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "center" }}>
                      <div className="skeleton" style={{ width: "30px", height: "12px", margin: "0 auto" }} />
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "center" }}>
                      <div className="skeleton" style={{ width: "55px", height: "18px", margin: "0 auto" }} />
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <div className="skeleton" style={{ width: "70px", height: "12px", marginLeft: "auto" }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
