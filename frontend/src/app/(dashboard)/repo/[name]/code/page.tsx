"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getRepoTree } from "@/lib/api";
import { useRepoContext } from "@/lib/repo-context";

export default function CodePage() {
  const params = useParams<{ name: string }>();
  const { selectedRepo } = useRepoContext();
  const [treeString, setTreeString] = useState<string | null>(null);
  const [fileCount, setFileCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const owner = selectedRepo?.owner || "Twofold-AS";
    getRepoTree(owner, params.name)
      .then((res) => {
        setTreeString(res.treeString);
        setFileCount(res.tree.length);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params.name, selectedRepo]);

  return (
    <div>
      <h1 className="font-heading text-[32px] font-medium leading-tight" style={{ color: "var(--text-primary)" }}>
        Code
      </h1>
      <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
        {fileCount} files in {selectedRepo?.fullName || params.name}
      </p>

      {loading ? (
        <p className="mt-8 text-sm" style={{ color: "var(--text-muted)" }}>Loading file tree...</p>
      ) : treeString ? (
        <div className="mt-6">
          <div className="code-block code-block-green" style={{ maxHeight: "600px", overflowY: "auto" }}>
            <pre className="text-sm">{treeString}</pre>
          </div>
        </div>
      ) : (
        <div className="card mt-8 text-center py-12">
          <p style={{ color: "var(--text-muted)" }}>Could not load file tree</p>
        </div>
      )}
    </div>
  );
}
