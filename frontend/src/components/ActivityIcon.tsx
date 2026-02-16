"use client";

export function ActivityIcon({ type }: { type: string }) {
  const t = type.toLowerCase();

  if (t.includes("created") || t.includes("create")) {
    return (
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M10 4v12M4 10h12" strokeLinecap="round">
          <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite" />
        </path>
      </svg>
    );
  }
  if (t.includes("completed") || t.includes("done") || t.includes("approved")) {
    return (
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="#22c55e" strokeWidth="2">
        <path d="M5 10l4 4 6-8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (t.includes("failed") || t.includes("error") || t.includes("rejected")) {
    return (
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="#ef4444" strokeWidth="2">
        <path d="M6 6l8 8M14 6l-8 8" strokeLinecap="round">
          <animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite" />
        </path>
      </svg>
    );
  }
  if (t.includes("pr") || t.includes("pull")) {
    return (
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="6" cy="6" r="2" /><circle cx="14" cy="14" r="2" />
        <path d="M6 8v4c0 1.1.9 2 2 2h4" strokeLinecap="round" />
      </svg>
    );
  }
  if (t.includes("working") || t.includes("progress") || t.includes("running")) {
    return (
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="10" cy="10" r="7" strokeDasharray="4 3">
          <animateTransform attributeName="transform" type="rotate" values="0 10 10;360 10 10" dur="3s" repeatCount="indefinite" />
        </circle>
      </svg>
    );
  }
  if (t.includes("chat") || t.includes("message")) {
    return (
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 5h12a1 1 0 011 1v7a1 1 0 01-1 1H8l-3 3v-3H4a1 1 0 01-1-1V6a1 1 0 011-1z" strokeLinecap="round" />
      </svg>
    );
  }
  if (t.includes("login") || t.includes("auth")) {
    return (
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="10" cy="7" r="3" />
        <path d="M4 17c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeLinecap="round" />
      </svg>
    );
  }
  if (t.includes("build") || t.includes("sandbox") || t.includes("file")) {
    return (
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round" />
      </svg>
    );
  }
  if (t.includes("task") || t.includes("plan")) {
    return (
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" fill="currentColor" />
        <path d="M4 5a2 2 0 012-2h8a2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5z" />
        <path d="M7 9h6M7 13h4" strokeLinecap="round" />
      </svg>
    );
  }
  if (t.includes("sync") || t.includes("linear")) {
    return (
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 10a6 6 0 0110.6-3.9M16 10a6 6 0 01-10.6 3.9" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate" values="0 10 10;360 10 10" dur="4s" repeatCount="indefinite" />
        </path>
      </svg>
    );
  }
  if (t.includes("heal") || t.includes("fix")) {
    return (
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="#a855f7" strokeWidth="1.5">
        <path d="M10 4v12M4 10h12" strokeLinecap="round" />
        <circle cx="10" cy="10" r="7" strokeDasharray="3 3">
          <animateTransform attributeName="transform" type="rotate" values="0 10 10;360 10 10" dur="5s" repeatCount="indefinite" />
        </circle>
      </svg>
    );
  }
  if (t.includes("cost") || t.includes("token")) {
    return (
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="#f97316" strokeWidth="1.5">
        <circle cx="10" cy="10" r="7" />
        <path d="M10 6v8M8 8h4M8 12h4" strokeLinecap="round" />
      </svg>
    );
  }
  // Default: simple dot
  return (
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" opacity="0.4">
      <circle cx="10" cy="10" r="3" />
    </svg>
  );
}
