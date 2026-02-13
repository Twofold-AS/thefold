const DEBUG_KEY = "thefold_debug";

export function isDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(DEBUG_KEY) === "true";
}

export function setDebugEnabled(enabled: boolean): void {
  if (enabled) {
    localStorage.setItem(DEBUG_KEY, "true");
  } else {
    localStorage.removeItem(DEBUG_KEY);
  }
}

/** Show a debug toast in the bottom-right corner */
export function debugToast(method: string, path: string, body?: string, response?: string, error?: string): void {
  if (!isDebugEnabled()) return;
  if (typeof document === "undefined") return;

  const el = document.createElement("div");
  el.style.cssText = `
    position: fixed; bottom: 16px; right: 16px; z-index: 9999;
    max-width: 400px; padding: 10px 14px; border-radius: 6px;
    font-family: monospace; font-size: 11px; line-height: 1.4;
    background: #1a1a2e; color: #e0e0e0; border: 1px solid #333;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    opacity: 1; transition: opacity 0.3s;
    pointer-events: none; word-break: break-all;
  `;

  const statusColor = error ? "#ef4444" : "#22c55e";
  const statusText = error ? "FEIL" : "OK";

  el.innerHTML = `
    <div style="color: #818cf8; margin-bottom: 4px; font-weight: bold;">${method} ${path}</div>
    ${body ? `<div style="color: #888; margin-bottom: 2px;">Body: ${body.substring(0, 120)}</div>` : ""}
    <div style="color: ${statusColor};">${statusText}${error ? `: ${error.substring(0, 100)}` : ""}</div>
    ${response ? `<div style="color: #888; margin-top: 2px;">${response.substring(0, 150)}</div>` : ""}
  `;

  document.body.appendChild(el);

  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, 3000);
}
