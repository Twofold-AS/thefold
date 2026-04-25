import { api, APIError } from "encore.dev/api";
import { CronJob } from "encore.dev/cron";
import { getAuthData } from "~encore/auth";
import log from "encore.dev/log";
import { createHash } from "crypto";
import JSZip from "jszip";
import { db } from "./chat";

// .zip- og .md-upload handler for chat files.
// Per-prosjekt-scoped (via conversations.project_id), SHA-256 content-dedup,
// og versjonerings-kjeder når samme filnavn lastes opp på nytt innen samme prosjekt.
//
// Safety:
//   - Raw:              50 MB (zip) / 2 MB (md)
//   - Total extracted:  100 MB
//   - File count:       500
//   - Per-file size:    20 MB
//   - Path traversal:   reject ".." eller absolute
//   - Dangerous types:  reject binær-kjørbare (.exe/.dll/...)

const MAX_ZIP_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_EXTRACTED = 100 * 1024 * 1024;
const MAX_FILE_COUNT = 500;
const MAX_PER_FILE_BYTES = 20 * 1024 * 1024;

const BLOCKED_EXTENSIONS = new Set([
  "exe", "dll", "so", "dylib", "bat", "cmd", "sh", "ps1", "app",
  "jar", "class", "pyc", "pyo",
]);

const TEXT_CATEGORIES: Record<string, "html" | "css" | "js" | "jsx" | "tsx" | "md" | "json" | "text"> = {
  html: "html", htm: "html",
  css: "css", scss: "css", sass: "css", less: "css",
  js: "js", mjs: "js", cjs: "js",
  jsx: "jsx",
  ts: "js",
  tsx: "tsx",
  md: "md", mdx: "md",
  json: "json",
  txt: "text", log: "text", yml: "text", yaml: "text", toml: "text", csv: "text",
};

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "avif"]);

function extOf(path: string): string {
  const i = path.lastIndexOf(".");
  return i >= 0 ? path.slice(i + 1).toLowerCase() : "";
}

function categorize(path: string): "html" | "css" | "js" | "jsx" | "tsx" | "md" | "json" | "image" | "text" | "other" {
  const e = extOf(path);
  if (TEXT_CATEGORIES[e]) return TEXT_CATEGORIES[e];
  if (IMAGE_EXTENSIONS.has(e)) return "image";
  return "other";
}

function contentTypeFor(path: string): string {
  const e = extOf(path);
  if (e === "html" || e === "htm") return "text/html";
  if (e === "css") return "text/css";
  if (e === "js" || e === "mjs" || e === "cjs") return "application/javascript";
  if (e === "jsx" || e === "tsx" || e === "ts") return "text/plain";
  if (e === "md" || e === "mdx") return "text/markdown";
  if (e === "json") return "application/json";
  if (e === "svg") return "image/svg+xml";
  if (e === "png") return "image/png";
  if (e === "jpg" || e === "jpeg") return "image/jpeg";
  if (e === "gif") return "image/gif";
  if (e === "webp") return "image/webp";
  if (e === "avif") return "image/avif";
  if (e === "ico") return "image/x-icon";
  return "application/octet-stream";
}

function isTextCategory(cat: string): boolean {
  return cat === "html" || cat === "css" || cat === "js" || cat === "jsx" || cat === "tsx" ||
         cat === "md" || cat === "json" || cat === "text";
}

function isPathSafe(path: string): boolean {
  if (path.startsWith("/") || path.startsWith("\\")) return false;
  if (path.includes("..")) return false;
  if (path.includes("\0")) return false;
  return true;
}

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Resolve project_id for a conversation. Null if conversation has no project. */
async function resolveProjectId(conversationId: string): Promise<string | null> {
  const row = await db.queryRow<{ project_id: string | null }>`
    SELECT project_id FROM conversations WHERE id = ${conversationId}
  `;
  return row?.project_id ?? null;
}

export interface UploadedFileSummary {
  path: string;
  category: string;
  sizeBytes: number;
  contentType: string;
}

export interface ZipUploadResponse {
  uploadId: string;
  filename: string;
  filesExtracted: number;
  totalBytes: number;
  byCategory: Record<string, number>;
  files: UploadedFileSummary[];
  /** Existing rad hvis content_hash matchet en tidligere upload (dedup). */
  dedup: boolean;
  /** Versjon i filnavn-kjeden (1 for første upload, N for N-te versjon). */
  version: number;
  /** Hvis versjon > 1, ID-en til den forrige versjonen som nå er superseded. */
  supersedesId?: string;
}

export const uploadZip = api(
  { method: "POST", path: "/chat/upload-zip", expose: true, auth: true },
  async (req: {
    conversationId: string;
    filename: string;
    contentBase64: string;
  }): Promise<ZipUploadResponse> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authed");
    if (!req.contentBase64) throw APIError.invalidArgument("contentBase64 required");

    const zipBuf = Buffer.from(req.contentBase64, "base64");
    if (zipBuf.length > MAX_ZIP_BYTES) {
      throw APIError.invalidArgument(
        `Zip too large: ${(zipBuf.length / 1024 / 1024).toFixed(1)} MB (max ${MAX_ZIP_BYTES / 1024 / 1024} MB)`,
      );
    }

    const contentHash = sha256Hex(zipBuf);
    const projectId = await resolveProjectId(req.conversationId);

    // C — dedup: same user + project + content_hash? Return existing row.
    const dup = projectId
      ? await db.queryRow<{ id: string; version: number; extracted: unknown; filename: string }>`
          SELECT id, version, extracted, filename
          FROM chat_files
          WHERE user_email = ${auth.email}
            AND content_hash = ${contentHash}
            AND project_id = ${projectId}::uuid
          ORDER BY version DESC LIMIT 1
        `.catch(() => null)
      : await db.queryRow<{ id: string; version: number; extracted: unknown; filename: string }>`
          SELECT id, version, extracted, filename
          FROM chat_files
          WHERE user_email = ${auth.email}
            AND content_hash = ${contentHash}
            AND project_id IS NULL
          ORDER BY version DESC LIMIT 1
        `.catch(() => null);

    if (dup) {
      const extracted = typeof dup.extracted === "string" ? JSON.parse(dup.extracted) : dup.extracted;
      const byCategory = (extracted as { byCategory?: Record<string, number> })?.byCategory ?? {};
      const totalBytes = (extracted as { totalBytes?: number })?.totalBytes ?? 0;
      const fileCount = (extracted as { fileCount?: number })?.fileCount ?? 0;

      // Hent fil-summary fra den eksisterende upload
      const files: UploadedFileSummary[] = [];
      const rows = await db.query<{ path: string; category: string; size_bytes: string | number; content_type: string }>`
        SELECT path, category, size_bytes, content_type
        FROM chat_upload_files
        WHERE upload_id = ${dup.id}::uuid
        ORDER BY path
      `;
      for await (const r of rows) {
        files.push({
          path: r.path,
          category: r.category,
          sizeBytes: typeof r.size_bytes === "string" ? parseInt(r.size_bytes, 10) : r.size_bytes,
          contentType: r.content_type,
        });
      }

      log.info("zip upload dedup hit", { uploadId: dup.id, filename: req.filename, hash: contentHash });
      return {
        uploadId: dup.id,
        filename: dup.filename,
        filesExtracted: fileCount || files.length,
        totalBytes,
        byCategory,
        files,
        dedup: true,
        version: dup.version,
      };
    }

    // F — versjon-tracking: finn eksisterende siste versjon av filename
    const latest = projectId
      ? await db.queryRow<{ id: string; version: number }>`
          SELECT id, version
          FROM chat_files
          WHERE user_email = ${auth.email}
            AND filename = ${req.filename}
            AND project_id = ${projectId}::uuid
            AND superseded_by IS NULL
          ORDER BY version DESC LIMIT 1
        `.catch(() => null)
      : await db.queryRow<{ id: string; version: number }>`
          SELECT id, version
          FROM chat_files
          WHERE user_email = ${auth.email}
            AND filename = ${req.filename}
            AND project_id IS NULL
            AND superseded_by IS NULL
          ORDER BY version DESC LIMIT 1
        `.catch(() => null);

    const version = (latest?.version ?? 0) + 1;
    const supersedesId = latest?.id;

    // Parse + valider zip
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(zipBuf);
    } catch (err) {
      throw APIError.invalidArgument(`Invalid zip file: ${err instanceof Error ? err.message : String(err)}`);
    }
    const entries = Object.values(zip.files).filter((f) => !f.dir);
    if (entries.length > MAX_FILE_COUNT) {
      throw APIError.invalidArgument(`Too many files: ${entries.length} (max ${MAX_FILE_COUNT})`);
    }

    // Opprett master-rad
    let uploadRow;
    if (projectId) {
      uploadRow = await db.queryRow<{ id: string }>`
        INSERT INTO chat_files (
          conversation_id, filename, content_type, content, size_bytes,
          upload_type, user_email, project_id, content_hash, version
        )
        VALUES (
          ${req.conversationId}, ${req.filename}, 'application/zip', '', ${zipBuf.length},
          'zip', ${auth.email}, ${projectId}::uuid, ${contentHash}, ${version}
        )
        RETURNING id
      `;
    } else {
      uploadRow = await db.queryRow<{ id: string }>`
        INSERT INTO chat_files (
          conversation_id, filename, content_type, content, size_bytes,
          upload_type, user_email, content_hash, version
        )
        VALUES (
          ${req.conversationId}, ${req.filename}, 'application/zip', '', ${zipBuf.length},
          'zip', ${auth.email}, ${contentHash}, ${version}
        )
        RETURNING id
      `;
    }
    if (!uploadRow) throw APIError.internal("failed to create upload row");

    // Oppdater forrige versjon med superseded_by
    if (supersedesId) {
      await db.exec`
        UPDATE chat_files SET superseded_by = ${uploadRow.id}::uuid WHERE id = ${supersedesId}::uuid
      `;
    }

    const files: UploadedFileSummary[] = [];
    const byCategory: Record<string, number> = {};
    let totalBytes = 0;

    for (const entry of entries) {
      if (!isPathSafe(entry.name)) { log.warn("skipping unsafe path", { path: entry.name }); continue; }
      if (entry.name.startsWith("__MACOSX/")) continue;
      const ext = extOf(entry.name);
      if (BLOCKED_EXTENSIONS.has(ext)) { log.warn("blocked extension", { path: entry.name }); continue; }

      const buf = await entry.async("nodebuffer");
      if (buf.length > MAX_PER_FILE_BYTES) { log.warn("oversized file", { path: entry.name, size: buf.length }); continue; }
      totalBytes += buf.length;
      if (totalBytes > MAX_TOTAL_EXTRACTED) { log.warn("extraction cap reached"); break; }

      const category = categorize(entry.name);
      const contentType = contentTypeFor(entry.name);

      let contentText: string | null = null;
      let contentBase64: string | null = null;
      // Rot-årsak (2026-04-24): Buffer.toString("utf8") replaces invalid
      // sequences with U+FFFD silently — the previous try/catch never
      // triggered, so null bytes (0x00) ended up in `contentText` and
      // Postgres rejected the INSERT with "invalid byte sequence for
      // encoding UTF8: 0x00". Fix: pre-scan for null bytes and also check
      // for the U+FFFD replacement ratio after decode. Either signal →
      // fall back to base64. This handles both real binaries misdetected
      // as text AND text files with embedded null bytes.
      if (isTextCategory(category) || (category === "other" && buf.length <= 200_000)) {
        const hasNullByte = buf.includes(0x00);
        if (hasNullByte) {
          contentBase64 = buf.toString("base64");
        } else {
          const decoded = buf.toString("utf8");
          // If decode produced a lot of U+FFFD (>5% of chars), treat as
          // binary too — encoding is lying to us.
          const replacementCount = (decoded.match(/\uFFFD/g) || []).length;
          const replacementRatio = decoded.length > 0 ? replacementCount / decoded.length : 0;
          if (replacementRatio > 0.05) {
            contentBase64 = buf.toString("base64");
          } else {
            contentText = decoded;
          }
        }
      } else {
        contentBase64 = buf.toString("base64");
      }

      await db.exec`
        INSERT INTO chat_upload_files (upload_id, path, content_type, category, size_bytes, content_text, content_base64)
        VALUES (
          ${uploadRow.id}::uuid, ${entry.name}, ${contentType}, ${category},
          ${buf.length}, ${contentText}, ${contentBase64}
        )
      `;

      files.push({ path: entry.name, category, sizeBytes: buf.length, contentType });
      byCategory[category] = (byCategory[category] ?? 0) + 1;
    }

    await db.exec`
      UPDATE chat_files
      SET extracted = ${JSON.stringify({ byCategory, totalBytes, fileCount: files.length })}::jsonb
      WHERE id = ${uploadRow.id}::uuid
    `;

    log.info("zip upload extracted", {
      uploadId: uploadRow.id, filename: req.filename, fileCount: files.length,
      totalBytes, byCategory, version, projectId,
    });

    return {
      uploadId: uploadRow.id,
      filename: req.filename,
      filesExtracted: files.length,
      totalBytes, byCategory, files,
      dedup: false, version,
      supersedesId,
    };
  },
);

// --- Internal: read back uploaded content ---

export interface UploadedContentResponse {
  uploadId: string;
  filename: string;
  filesExtracted: number;
  byCategory: Record<string, number>;
  version: number;
  files: Array<{
    path: string;
    category: string;
    contentType: string;
    sizeBytes: number;
    content?: string;
    base64?: string;
    truncated?: boolean;
  }>;
}

export const getUploadedContent = api(
  { method: "POST", path: "/chat/upload/get", expose: false },
  async (req: {
    uploadId: string;
    categoryFilter?: string;
    maxCharsPerFile?: number;
    maxFiles?: number;
  }): Promise<UploadedContentResponse> => {
    const maxChars = req.maxCharsPerFile ?? 20_000;
    const maxFiles = Math.min(req.maxFiles ?? 50, 200);

    const master = await db.queryRow<{
      id: string; filename: string; extracted: unknown; version: number;
    }>`
      SELECT id, filename, extracted, version
      FROM chat_files
      WHERE id = ${req.uploadId}::uuid AND upload_type = 'zip'
    `;
    if (!master) throw APIError.notFound("upload not found");

    const extracted = typeof master.extracted === "string" ? JSON.parse(master.extracted) : master.extracted;
    const byCategory = (extracted as { byCategory?: Record<string, number> })?.byCategory ?? {};

    interface FileRow {
      path: string; content_type: string; category: string;
      size_bytes: number | string; content_text: string | null; content_base64: string | null;
    }

    let rows;
    if (req.categoryFilter) {
      rows = await db.query<FileRow>`
        SELECT path, content_type, category, size_bytes, content_text, content_base64
        FROM chat_upload_files
        WHERE upload_id = ${req.uploadId}::uuid AND category = ${req.categoryFilter}
        ORDER BY path LIMIT ${maxFiles}
      `;
    } else {
      rows = await db.query<FileRow>`
        SELECT path, content_type, category, size_bytes, content_text, content_base64
        FROM chat_upload_files
        WHERE upload_id = ${req.uploadId}::uuid
        ORDER BY path LIMIT ${maxFiles}
      `;
    }

    const files: UploadedContentResponse["files"] = [];
    for await (const r of rows) {
      const sizeBytes = typeof r.size_bytes === "string" ? parseInt(r.size_bytes, 10) : r.size_bytes;
      let content: string | undefined;
      let base64: string | undefined;
      let truncated = false;
      if (r.content_text) {
        if (r.content_text.length > maxChars) { content = r.content_text.slice(0, maxChars); truncated = true; }
        else content = r.content_text;
      } else if (r.content_base64) {
        if (r.content_base64.length > maxChars * 2) { base64 = r.content_base64.slice(0, maxChars * 2); truncated = true; }
        else base64 = r.content_base64;
      }
      files.push({ path: r.path, category: r.category, contentType: r.content_type, sizeBytes, content, base64, truncated });
    }

    return {
      uploadId: master.id, filename: master.filename,
      filesExtracted: files.length, byCategory, version: master.version, files,
    };
  },
);

// --- Internal: list uploads (conversation OR project scope) ---

export interface UploadListItem {
  uploadId: string;
  filename: string;
  uploadType: string;
  fileCount: number;
  totalBytes: number;
  version: number;
  isLatest: boolean;
  conversationId: string;
  projectId: string | null;
  createdAt: string;
}

export const listUploadsByConversation = api(
  { method: "POST", path: "/chat/upload/list", expose: false },
  async (req: {
    conversationId?: string;
    projectId?: string;
    includeSuperseded?: boolean;
    limit?: number;
  }): Promise<{ uploads: UploadListItem[] }> => {
    const limit = Math.min(req.limit ?? 20, 100);
    const includeSuperseded = !!req.includeSuperseded;

    interface Row {
      id: string; filename: string; upload_type: string; extracted: unknown;
      version: number; superseded_by: string | null;
      conversation_id: string; project_id: string | null; created_at: Date;
    }

    let rows;
    if (req.projectId) {
      // Project-scope (cross-conversation)
      if (includeSuperseded) {
        rows = await db.query<Row>`
          SELECT id, filename, upload_type, extracted, version, superseded_by,
                 conversation_id, project_id, created_at
          FROM chat_files
          WHERE project_id = ${req.projectId}::uuid
          ORDER BY created_at DESC LIMIT ${limit}
        `;
      } else {
        rows = await db.query<Row>`
          SELECT id, filename, upload_type, extracted, version, superseded_by,
                 conversation_id, project_id, created_at
          FROM chat_files
          WHERE project_id = ${req.projectId}::uuid AND superseded_by IS NULL
          ORDER BY created_at DESC LIMIT ${limit}
        `;
      }
    } else if (req.conversationId) {
      if (includeSuperseded) {
        rows = await db.query<Row>`
          SELECT id, filename, upload_type, extracted, version, superseded_by,
                 conversation_id, project_id, created_at
          FROM chat_files
          WHERE conversation_id = ${req.conversationId}
          ORDER BY created_at DESC LIMIT ${limit}
        `;
      } else {
        rows = await db.query<Row>`
          SELECT id, filename, upload_type, extracted, version, superseded_by,
                 conversation_id, project_id, created_at
          FROM chat_files
          WHERE conversation_id = ${req.conversationId} AND superseded_by IS NULL
          ORDER BY created_at DESC LIMIT ${limit}
        `;
      }
    } else {
      throw APIError.invalidArgument("conversationId or projectId required");
    }

    const out: UploadListItem[] = [];
    for await (const r of rows) {
      const extracted = typeof r.extracted === "string" ? JSON.parse(r.extracted) : r.extracted;
      const fileCount = (extracted as { fileCount?: number })?.fileCount ?? 0;
      const totalBytes = (extracted as { totalBytes?: number })?.totalBytes ?? 0;
      out.push({
        uploadId: r.id, filename: r.filename, uploadType: r.upload_type,
        fileCount, totalBytes, version: r.version, isLatest: r.superseded_by === null,
        conversationId: r.conversation_id, projectId: r.project_id,
        createdAt: r.created_at.toISOString(),
      });
    }
    return { uploads: out };
  },
);

// --- Exposed: list uploads for a project (UI) ---

export const listProjectUploads = api(
  { method: "POST", path: "/chat/upload/project-list", expose: true, auth: true },
  async (req: { projectId: string; includeSuperseded?: boolean; limit?: number }): Promise<{ uploads: UploadListItem[] }> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authed");
    const limit = Math.min(req.limit ?? 50, 200);
    const includeSuperseded = !!req.includeSuperseded;

    interface Row {
      id: string; filename: string; upload_type: string; extracted: unknown;
      version: number; superseded_by: string | null;
      conversation_id: string; project_id: string | null; created_at: Date;
    }

    let rows;
    if (includeSuperseded) {
      rows = await db.query<Row>`
        SELECT id, filename, upload_type, extracted, version, superseded_by,
               conversation_id, project_id, created_at
        FROM chat_files
        WHERE user_email = ${auth.email} AND project_id = ${req.projectId}::uuid
        ORDER BY created_at DESC LIMIT ${limit}
      `;
    } else {
      rows = await db.query<Row>`
        SELECT id, filename, upload_type, extracted, version, superseded_by,
               conversation_id, project_id, created_at
        FROM chat_files
        WHERE user_email = ${auth.email} AND project_id = ${req.projectId}::uuid
          AND superseded_by IS NULL
        ORDER BY created_at DESC LIMIT ${limit}
      `;
    }

    const out: UploadListItem[] = [];
    for await (const r of rows) {
      const extracted = typeof r.extracted === "string" ? JSON.parse(r.extracted) : r.extracted;
      const fileCount = (extracted as { fileCount?: number })?.fileCount ?? 0;
      const totalBytes = (extracted as { totalBytes?: number })?.totalBytes ?? 0;
      out.push({
        uploadId: r.id, filename: r.filename, uploadType: r.upload_type,
        fileCount, totalBytes, version: r.version, isLatest: r.superseded_by === null,
        conversationId: r.conversation_id, projectId: r.project_id,
        createdAt: r.created_at.toISOString(),
      });
    }
    return { uploads: out };
  },
);

// --- Delete an upload (and its extracted files via CASCADE) ---

export const deleteUpload = api(
  { method: "POST", path: "/chat/upload/delete", expose: true, auth: true },
  async (req: { uploadId: string }): Promise<{ success: boolean }> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authed");

    // Verify ownership
    const row = await db.queryRow<{ user_email: string | null; superseded_by: string | null }>`
      SELECT user_email, superseded_by FROM chat_files WHERE id = ${req.uploadId}::uuid
    `;
    if (!row) throw APIError.notFound("upload not found");
    if (row.user_email !== auth.email) throw APIError.permissionDenied("not owner");

    // Reset superseded_by pointers that referenced this row (to preserve chain integrity)
    await db.exec`
      UPDATE chat_files SET superseded_by = NULL WHERE superseded_by = ${req.uploadId}::uuid
    `;

    await db.exec`DELETE FROM chat_files WHERE id = ${req.uploadId}::uuid`;

    return { success: true };
  },
);

// --- Retention cron: orphaned uploads ---

export const cleanupOrphanedUploads = api(
  { method: "POST", path: "/chat/upload/cleanup-orphaned", expose: false },
  async (): Promise<{ deleted: number }> => {
    // Slett uploads i arkiverte prosjekter eldre enn 30 dager.
    const row = await db.queryRow<{ count: number }>`
      WITH deleted AS (
        DELETE FROM chat_files
        WHERE project_id IN (
          SELECT id FROM projects WHERE archived_at IS NOT NULL
        )
        AND created_at < NOW() - INTERVAL '30 days'
        RETURNING id
      )
      SELECT COUNT(*)::int AS count FROM deleted
    `.catch(() => ({ count: 0 }));
    return { deleted: row?.count ?? 0 };
  },
);

const _cleanupUploadsCron = new CronJob("cleanup-orphaned-uploads", {
  title: "Delete uploads in archived projects older than 30 days",
  schedule: "0 3 * * *",
  endpoint: cleanupOrphanedUploads,
});

// Second pass: user-flow orphans. When a user stages an upload via the
// file-badge, then navigates away without sending a message, the upload
// row sits in chat_files with no downstream reference. We delete uploads
// older than 24h when the parent conversation has had ZERO messages since
// the upload was created (i.e. the user never followed through with a
// send). Zip extractions CASCADE via FK.
export const cleanupUnsentUploads = api(
  { method: "POST", path: "/chat/upload/cleanup-unsent", expose: false },
  async (): Promise<{ deleted: number }> => {
    const row = await db.queryRow<{ count: number }>`
      WITH stale AS (
        SELECT cf.id
        FROM chat_files cf
        WHERE cf.created_at < NOW() - INTERVAL '24 hours'
          AND NOT EXISTS (
            SELECT 1 FROM messages m
            WHERE m.conversation_id = cf.conversation_id
              AND m.created_at >= cf.created_at
          )
      ),
      deleted AS (
        DELETE FROM chat_files WHERE id IN (SELECT id FROM stale)
        RETURNING id
      )
      SELECT COUNT(*)::int AS count FROM deleted
    `.catch(() => ({ count: 0 }));
    log.info("cleanup-unsent-uploads complete", { deleted: row?.count ?? 0 });
    return { deleted: row?.count ?? 0 };
  },
);

const _cleanupUnsentUploadsCron = new CronJob("cleanup-unsent-uploads", {
  title: "Delete uploads staged but never sent (>24h orphans)",
  schedule: "15 * * * *",
  endpoint: cleanupUnsentUploads,
});
