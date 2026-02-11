"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getRepoTree, getTasksByLabel, type LinearTask } from "@/lib/api";
import { useRepoContext } from "@/lib/repo-context";

export default function RepoOverviewPage() {
  const params = useParams<{ name: string }>();
  const { selectedRepo } = useRepoContext();
  const [fileCount, setFileCount] = useState(0);
  const [tasks, setTasks] = useState<LinearTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const owner = selectedRepo?.owner || "Twofold-AS";

    Promise.all([
      getRepoTree(owner, params.name).catch(() => ({ tree: [], treeString: "" })),
      getTasksByLabel(params.name).catch(() => ({ tasks: [] })),
    ]).then(([treeRes, tasksRes]) => {
      setFileCount(treeRes.tree.length);
      setTasks(tasksRes.tasks);
    }).finally(() => setLoading(false));
  }, [params.name, selectedRepo]);

  const activeTasks = tasks.filter((t) => t.state !== "Done" && t.state !== "Canceled");

  return (
    <div>
      <h1 className="font-heading text-[32px] font-medium leading-tight" style={{ color: "var(--text-primary)" }}>
        Overview
      </h1>
      <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
        {selectedRepo?.fullName || params.name}
      </p>

      <div className="flex gap-6 mt-8 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>{fileCount}</span>
            <span className="text-base" style={{ color: "var(--text-primary)" }}>Files</span>
          </div>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>In repository</p>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>{activeTasks.length}</span>
            <span className="text-base" style={{ color: "var(--text-primary)" }}>Active tasks</span>
          </div>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>From Linear</p>
        </div>
      </div>

      {loading ? (
        <p className="mt-8 text-sm" style={{ color: "var(--text-muted)" }}>Loading...</p>
      ) : activeTasks.length > 0 && (
        <div className="card mt-8">
          <h2 className="font-heading text-lg font-medium mb-4" style={{ color: "var(--text-primary)" }}>
            Recent Tasks
          </h2>
          <div className="space-y-2">
            {activeTasks.slice(0, 5).map((task) => (
              <div key={task.id} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm" style={{ color: "var(--text-secondary)" }}>{task.identifier}</span>
                  <span className="text-sm">{task.title}</span>
                </div>
                <span className="badge-active">{task.state}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
