import { z } from "zod";
import { createPatch } from "diff";
import type { Tool } from "../types";

const inputSchema = z.object({
  oldUploadId: z.string().uuid().describe("Older version upload ID"),
  newUploadId: z.string().uuid().describe("Newer version upload ID"),
  maxFilesDiffed: z.number().int().positive().optional()
    .describe("Max individual file diffs to generate (default 20)"),
  maxPatchCharsPerFile: z.number().int().positive().optional()
    .describe("Max characters per unified patch (default 8000)"),
});

interface UploadFile {
  path: string;
  category: string;
  contentType: string;
  sizeBytes: number;
  content?: string;
  base64?: string;
}

export const diffUploadsTool: Tool<z.infer<typeof inputSchema>> = {
  name: "diff_uploads",
  description:
    "Compute a diff between two uploads (typically versions of the same file/zip). For zips, returns file-level adds/removes/modifies + per-file unified patches for text files. For images, reports size change only.",
  category: "uploads",
  inputSchema,

  surfaces: ["chat", "agent"],
  costHint: "medium",
  maxCallsPerSession: 5,

  async handler(input, ctx) {
    const { chat } = await import("~encore/clients");

    const maxFiles = input.maxFilesDiffed ?? 20;
    const maxPatch = input.maxPatchCharsPerFile ?? 8000;

    const client = chat as unknown as {
      getUploadedContent: (r: { uploadId: string; maxFiles?: number; maxCharsPerFile?: number }) => Promise<{
        uploadId: string; filename: string; filesExtracted: number;
        files: UploadFile[];
      }>;
    };

    let oldData, newData;
    try {
      [oldData, newData] = await Promise.all([
        client.getUploadedContent({ uploadId: input.oldUploadId, maxFiles: 200, maxCharsPerFile: 50000 }),
        client.getUploadedContent({ uploadId: input.newUploadId, maxFiles: 200, maxCharsPerFile: 50000 }),
      ]);
    } catch (err) {
      ctx.log.warn("diff_uploads: fetch failed", { error: err instanceof Error ? err.message : String(err) });
      return { success: false, message: "Kunne ikke hente uploads" };
    }

    const oldMap = new Map<string, UploadFile>();
    for (const f of oldData.files) oldMap.set(f.path, f);
    const newMap = new Map<string, UploadFile>();
    for (const f of newData.files) newMap.set(f.path, f);

    const added: string[] = [];
    const removed: string[] = [];
    const modifiedPaths: string[] = [];
    const unchanged: string[] = [];

    // Collect paths from union
    const allPaths = new Set<string>([...oldMap.keys(), ...newMap.keys()]);
    for (const p of allPaths) {
      const o = oldMap.get(p);
      const n = newMap.get(p);
      if (o && !n) { removed.push(p); continue; }
      if (!o && n) { added.push(p); continue; }
      if (o && n) {
        if ((o.content ?? "") === (n.content ?? "") && (o.base64 ?? "") === (n.base64 ?? "") && o.sizeBytes === n.sizeBytes) {
          unchanged.push(p);
        } else {
          modifiedPaths.push(p);
        }
      }
    }

    // Per-file patches for text files (cap count + size)
    const patches: Array<{ path: string; patch: string; truncated: boolean }> = [];
    const sizeChanges: Array<{ path: string; oldSize: number; newSize: number }> = [];

    let patchesGenerated = 0;
    for (const p of modifiedPaths) {
      if (patchesGenerated >= maxFiles) break;
      const o = oldMap.get(p)!;
      const n = newMap.get(p)!;
      const isText = typeof o.content === "string" && typeof n.content === "string";

      if (isText) {
        let patch = createPatch(p, o.content ?? "", n.content ?? "", "v-old", "v-new");
        let truncated = false;
        if (patch.length > maxPatch) {
          patch = patch.slice(0, maxPatch) + "\n... (patch truncated)";
          truncated = true;
        }
        patches.push({ path: p, patch, truncated });
        patchesGenerated++;
      } else {
        // Binary file — just report size delta
        sizeChanges.push({ path: p, oldSize: o.sizeBytes, newSize: n.sizeBytes });
      }
    }

    return {
      success: true,
      message: `Diff: +${added.length} added, -${removed.length} removed, ~${modifiedPaths.length} modified, =${unchanged.length} unchanged`,
      data: {
        oldUpload: { uploadId: oldData.uploadId, filename: oldData.filename, fileCount: oldData.filesExtracted },
        newUpload: { uploadId: newData.uploadId, filename: newData.filename, fileCount: newData.filesExtracted },
        summary: {
          added, removed, modified: modifiedPaths, unchanged,
        },
        textPatches: patches,
        binarySizeChanges: sizeChanges,
        truncated: modifiedPaths.length > patchesGenerated,
      },
    };
  },
};
