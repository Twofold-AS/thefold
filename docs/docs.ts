import { api } from "encore.dev/api";

// --- Types ---

interface DocResult {
  content: string;
  source: string;
  version: string;
}

interface LookupForTaskRequest {
  taskDescription: string;
  existingDependencies: Record<string, string>;
}

interface LookupForTaskResponse {
  docs: DocResult[];
}

interface LookupRequest {
  library: string;
  topic: string;
}

interface LookupResponse {
  docs: DocResult[];
}

// --- Context7 MCP Integration ---
// Context7 provides up-to-date documentation for any library.
// The MCP server runs alongside TheFold and is queried for relevant docs.
// See: https://github.com/upstash/context7

// In production, this connects to the Context7 MCP server.
// For now, it uses the HTTP API as a fallback.

async function queryContext7(library: string, topic: string): Promise<DocResult[]> {
  try {
    // Context7 MCP endpoint (when running as MCP server)
    // Falls back to direct API call
    const res = await fetch(
      `https://context7.com/api/v1/search?q=${encodeURIComponent(library + " " + topic)}&limit=3`,
      { signal: AbortSignal.timeout(10_000) }
    );

    if (!res.ok) return [];

    const data = await res.json();
    return (data.results || []).map((r: any) => ({
      content: r.snippet || r.content,
      source: r.url || r.source,
      version: r.version || "latest",
    }));
  } catch {
    // Context7 unavailable — graceful fallback
    return [];
  }
}

// --- Endpoints ---

// Look up docs for a specific library/topic
export const lookup = api(
  { method: "POST", path: "/docs/lookup", expose: false },
  async (req: LookupRequest): Promise<LookupResponse> => {
    const docs = await queryContext7(req.library, req.topic);
    return { docs };
  }
);

// Smart lookup: extract relevant libraries from a task description
export const lookupForTask = api(
  { method: "POST", path: "/docs/lookup-for-task", expose: false },
  async (req: LookupForTaskRequest): Promise<LookupForTaskResponse> => {
    const allDocs: DocResult[] = [];

    // Always include Encore.ts docs
    const encoreDocs = await queryContext7("encore.ts", req.taskDescription);
    allDocs.push(...encoreDocs);

    // Look up docs for mentioned dependencies
    const depNames = Object.keys(req.existingDependencies);
    const mentionedDeps = depNames.filter((dep) =>
      req.taskDescription.toLowerCase().includes(dep.toLowerCase())
    );

    for (const dep of mentionedDeps.slice(0, 3)) {
      const docs = await queryContext7(dep, req.taskDescription);
      allDocs.push(...docs);
    }

    return { docs: allDocs.slice(0, 10) };
  }
);
