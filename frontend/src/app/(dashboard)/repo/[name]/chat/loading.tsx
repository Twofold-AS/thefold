export default function Loading() {
  return (
    <div className="flex flex-col" style={{ height: "100vh" }}>
      {/* Chat header with cells */}
      <div
        className="flex items-stretch flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border)", minHeight: "80px" }}
      >
        {/* Title cell — 280px */}
        <div
          className="flex items-center px-5 shrink-0"
          style={{ borderRight: "1px solid var(--border)", width: "280px" }}
        >
          <div className="skeleton" style={{ width: "120px", height: "24px" }} />
        </div>

        {/* Model cell — 200px */}
        <div
          className="flex items-center px-4 shrink-0"
          style={{ borderRight: "1px solid var(--border)", minWidth: "200px" }}
        >
          <div className="skeleton" style={{ width: "140px", height: "16px" }} />
        </div>

        {/* Skills cell — 160px */}
        <div
          className="flex items-center px-4 shrink-0"
          style={{ borderRight: "1px solid var(--border)", minWidth: "160px" }}
        >
          <div className="skeleton" style={{ width: "100px", height: "16px" }} />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right cells */}
        <div
          className="flex items-center px-5 shrink-0"
          style={{ borderLeft: "1px solid var(--border)" }}
        >
          <div className="skeleton" style={{ width: "90px", height: "14px" }} />
        </div>
        <div
          className="flex items-center px-5 shrink-0"
          style={{ borderLeft: "1px solid var(--border)" }}
        >
          <div className="skeleton" style={{ width: "40px", height: "14px" }} />
        </div>
      </div>

      {/* Content: conversation panel + chat area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Conversation panel — 280px */}
        <div
          className="hidden lg:flex flex-col shrink-0"
          style={{ width: "280px", borderRight: "1px solid var(--border)" }}
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="px-4 py-3"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <div className="skeleton" style={{ width: `${150 + i * 15}px`, height: "14px", marginBottom: "6px" }} />
              <div className="skeleton" style={{ width: "50px", height: "12px" }} />
            </div>
          ))}
        </div>

        {/* Chat area */}
        <div className="flex flex-col flex-1">
          <div className="flex-1 px-4 pt-4">
            <div className="max-w-4xl mx-auto space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-2.5" style={{ flexDirection: i % 2 === 0 ? "row" : "row-reverse" }}>
                  <div className="skeleton" style={{ width: "28px", height: "28px", flexShrink: 0 }} />
                  <div className="skeleton" style={{ width: `${180 + i * 80}px`, height: `${40 + i * 12}px` }} />
                </div>
              ))}
            </div>
          </div>

          {/* Input area */}
          <div className="flex-shrink-0 px-2 pb-2 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="flex gap-2 items-end max-w-4xl mx-auto">
              <div className="skeleton" style={{ width: "32px", height: "32px", flexShrink: 0 }} />
              <div className="skeleton" style={{ flex: 1, height: "56px" }} />
              <div className="skeleton" style={{ width: "32px", height: "32px", flexShrink: 0 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
