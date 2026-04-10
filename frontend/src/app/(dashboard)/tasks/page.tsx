"use client";

import { useState } from "react";
import { GR } from "@/components/GridRow";
import { useApiData } from "@/lib/hooks";
import {
  listTheFoldTasks,
  listReviews,
  syncLinearTasks,
  approveReview,
  requestReviewChanges,
  rejectReview,
  createTask,
  softDeleteTask,
  listRepos,
  listSkills,
  type TheFoldTask,
  type ReviewSummary,
} from "@/lib/api";
import { T } from "@/lib/tokens";
import TaskFilters from "@/components/tasks/TaskFilters";
import TaskList from "@/components/tasks/TaskList";
import TaskDetailPanel from "@/components/tasks/TaskDetailPanel";

export default function TasksPage() {
  const [sel, setSel] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { data: taskData, loading: tasksLoading, refresh: refreshTasks } = useApiData(
    () => listTheFoldTasks(),
    [],
  );
  const { data: reviewData } = useApiData(() => listReviews({}), []);
  const { data: repoData } = useApiData(() => listRepos(), []);
  const { data: skillsData } = useApiData(() => listSkills(), []);

  const tasks: TheFoldTask[] = taskData?.tasks ?? [];
  const reviews: ReviewSummary[] = reviewData?.reviews ?? [];
  const dynamicRepos = repoData?.repos?.map((r: { name: string }) => r.name) ?? [];
  const availableSkills = (skillsData?.skills ?? []).filter((s: { enabled: boolean }) => s.enabled);

  const t = sel !== null ? tasks.find((x) => x.id === sel) : null;
  const tReview = t ? reviews.find((r) => r.taskId === t.id) : undefined;

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncLinearTasks();
      alert(`Linear sync: ${result.created} opprettet, ${result.updated} oppdatert (${result.total} totalt)`);
      refreshTasks();
    } catch (e) {
      alert(`Sync feilet: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleApprove = async () => {
    const reviewId = t?.reviewId || tReview?.id;
    if (!reviewId) { alert("Ingen review tilgjengelig for denne oppgaven."); return; }
    setActionLoading("approve");
    try {
      const result = await approveReview(reviewId);
      alert(`Godkjent! PR: ${result.prUrl}`);
      refreshTasks();
    } catch (e) {
      alert(`Feil: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRequestChanges = async () => {
    const reviewId = t?.reviewId || tReview?.id;
    if (!reviewId) { alert("Ingen review tilgjengelig for denne oppgaven."); return; }
    const feedback = prompt("Hva skal endres?");
    if (!feedback) return;
    setActionLoading("changes");
    try {
      await requestReviewChanges(reviewId, feedback);
      alert("Endringer forespurt.");
      refreshTasks();
    } catch (e) {
      alert(`Feil: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    const reviewId = t?.reviewId || tReview?.id;
    if (!reviewId) { alert("Ingen review tilgjengelig for denne oppgaven."); return; }
    const reason = prompt("Grunn for avvisning (valgfritt):");
    setActionLoading("reject");
    try {
      await rejectReview(reviewId, reason || undefined);
      alert("Avvist.");
      refreshTasks();
    } catch (e) {
      alert(`Feil: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateTask = async (title: string, description: string, repo: string, skillIds: string[]) => {
    try {
      await createTask({
        title,
        description,
        repo: repo || dynamicRepos[0] || undefined,
        labels: skillIds.length > 0 ? skillIds.map(id => {
          const sk = availableSkills.find((s: { id: string; name: string }) => s.id === id);
          return sk ? `skill:${sk.name}` : "";
        }).filter(Boolean) : undefined,
      });
      refreshTasks();
    } catch (e) {
      alert(`Feil ved opprettelse: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await softDeleteTask(id);
      if (sel === id) setSel(null);
      refreshTasks();
    } catch { /* silent — user sees task didn't disappear */ }
  };

  return (
    <>
      <TaskFilters
        syncing={syncing}
        onSync={handleSync}
        onCreateTask={handleCreateTask}
        repos={dynamicRepos}
        skills={availableSkills}
      />

      <GR>
        <div style={{
          display: "grid",
          gridTemplateColumns: t ? "1fr 1fr" : "1fr",
          borderRadius: 12,
          border: `1px solid ${T.border}`,
          minHeight: 400,
          position: "relative",
          overflow: "hidden",
        }}>
          <TaskList
            tasks={tasks}
            reviews={reviews}
            selectedId={sel}
            loading={tasksLoading}
            hasDetail={!!t}
            onSelect={(id) => setSel(id === sel ? null : id)}
            onDelete={handleDelete}
          />

          {t && (
            <TaskDetailPanel
              task={t}
              review={tReview}
              actionLoading={actionLoading}
              onApprove={handleApprove}
              onRequestChanges={handleRequestChanges}
              onReject={handleReject}
            />
          )}
        </div>
      </GR>
      <GR mb={40}>
        <div style={{ height: 1 }} />
      </GR>
    </>
  );
}
