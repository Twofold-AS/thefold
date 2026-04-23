// URL helpers for query-param-preserving navigation.
// Prevents bugs where router.replace() drops `?project=` or `?conv=` when only one
// is updated — previously caused drill-in state to desync with chat context.

/**
 * Build a URL path that preserves the current query-params except for the ones
 * overridden in `changes`. Pass `null` to remove a key, string to set it.
 *
 * Example:
 *   buildUrl("/cowork", { project: "abc", conv: null })
 *   // current: /cowork?conv=x&skills=y  →  /cowork?project=abc&skills=y
 */
export function buildUrl(path: string, changes: Record<string, string | null>): string {
  if (typeof window === "undefined") {
    // SSR-safe fallback — no preservation possible, apply changes only
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(changes)) {
      if (v !== null && v !== undefined) params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  }
  const params = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === undefined) params.delete(k);
    else params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
