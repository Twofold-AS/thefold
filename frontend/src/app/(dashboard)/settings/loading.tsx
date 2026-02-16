export default function Loading() {
  return (
    <div>
      {/* Header with right cells */}
      <div
        className="flex items-stretch flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border)", minHeight: "80px" }}
      >
        {/* Title cell */}
        <div
          className="flex items-center px-5 shrink-0"
          style={{ borderRight: "1px solid var(--border)", minWidth: "180px" }}
        >
          <div className="skeleton" style={{ width: "90px", height: "24px" }} />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right cell: Kostnader */}
        <div
          className="flex items-center px-4 shrink-0"
          style={{ borderLeft: "1px solid var(--border)" }}
        >
          <div className="skeleton" style={{ width: "100px", height: "14px" }} />
        </div>

        {/* Right cell: Security */}
        <div
          className="flex items-center px-4 shrink-0"
          style={{ borderLeft: "1px solid var(--border)" }}
        >
          <div className="skeleton" style={{ width: "120px", height: "14px" }} />
        </div>
      </div>

      <div className="p-6">
        {/* Tabs */}
        <div className="flex gap-1.5 mb-6">
          {["Profil", "Preferanser", "Debug"].map((_, i) => (
            <div key={i} className="skeleton" style={{ width: `${70 + i * 10}px`, height: "32px" }} />
          ))}
        </div>

        {/* Profile section */}
        <div style={{ border: "1px solid var(--border)", padding: "20px" }}>
          <div className="skeleton" style={{ width: "150px", height: "14px", marginBottom: "16px" }} />
          <div className="flex items-start gap-6">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-2">
              <div className="skeleton" style={{ width: "64px", height: "64px" }} />
              <div className="flex gap-1.5 flex-wrap justify-center" style={{ maxWidth: "120px" }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ width: "20px", height: "20px" }} />
                ))}
              </div>
            </div>

            {/* Fields */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <div className="skeleton" style={{ width: "100px", height: "11px", marginBottom: "8px" }} />
                <div className="skeleton" style={{ width: "300px", height: "40px" }} />
              </div>
              <div>
                <div className="skeleton" style={{ width: "50px", height: "11px", marginBottom: "8px" }} />
                <div className="skeleton" style={{ width: "200px", height: "14px" }} />
              </div>
              <div>
                <div className="skeleton" style={{ width: "40px", height: "11px", marginBottom: "8px" }} />
                <div className="skeleton" style={{ width: "60px", height: "20px" }} />
              </div>
            </div>
          </div>
        </div>

        {/* Account section */}
        <div style={{ border: "1px solid var(--border)", padding: "20px", marginTop: "32px" }}>
          <div className="skeleton" style={{ width: "60px", height: "14px", marginBottom: "12px" }} />
          <div className="skeleton" style={{ width: "90px", height: "36px" }} />
        </div>
      </div>
    </div>
  );
}
