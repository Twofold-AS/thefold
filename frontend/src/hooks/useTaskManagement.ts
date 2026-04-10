import { useState, useCallback } from "react";
import { useApiData } from "@/lib/hooks";
import {
  listTheFoldTasks,
  listReviews,
  createTask,
  softDeleteTask,
  syncLinearTasks,
  approveReview,
  requestReviewChanges,
  rejectReview,
  type TheFoldTask,
  type ReviewSummary,
} from "@/lib/api";

export interface CreateTaskInput {
  title: string;
  description: string;
  repo?: string;
  priority?: number;
  labels?: string[];
}

export type TaskStatusFilter = "all" | "backlog" | "planned" | "in_progress" | "in_review" | "done" | "blocked";

export interface UseTaskManagementOptions {
  repo?: string;
  initialStatusFilter?: TaskStatusFilter;
}

export function useTaskManagement(options: UseTaskManagementOptions = {}) {
  const { repo, initialStatusFilter = "all" } = options;

  // Fetch state
  const {
    data: taskData,
    loading: tasksLoading,
    refresh: refreshTasks,
    setData: setTaskData,
  } = useApiData(
    () => listTheFoldTasks(repo ? { repo } : undefined),
    [repo],
  );

  const { data: reviewData, refresh: refreshReviews } = useApiData(
    () => listReviews({}),
    [],
  );

  // Filter state
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>(initialStatusFilter);
  const [searchQuery, setSearchQuery] = useState("");

  // Action loading state — tracks which action is in flight per task/entity
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [creating, setCreating] = useState(false);

  const tasks: TheFoldTask[] = taskData?.tasks ?? [];
  const reviews: ReviewSummary[] = reviewData?.reviews ?? [];

  // Derived: filtered tasks
  const filteredTasks = tasks.filter((t) => {
    const matchesStatus = statusFilter === "all" || t.status === statusFilter;
    const matchesSearch =
      !searchQuery ||
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // Helpers
  const getReviewForTask = useCallback(
    (taskId: string) => reviews.find((r) => r.taskId === taskId) ?? null,
    [reviews],
  );

  // --- Handlers ---

  const handleCreateTask = useCallback(async (input: CreateTaskInput): Promise<TheFoldTask | null> => {
    if (!input.title.trim()) return null;
    setCreating(true);
    // Optimistic: add placeholder
    const tempId = `optimistic-${Date.now()}`;
    const optimistic: TheFoldTask = {
      id: tempId,
      title: input.title,
      description: input.description,
      repo: input.repo ?? "",
      status: "backlog",
      priority: input.priority ?? 0,
      labels: input.labels ?? [],
      source: "manual",
      assignedTo: "",
      buildJobId: null,
      prUrl: null,
      reviewId: null,
      errorMessage: null,
      createdBy: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
    };
    setTaskData((prev) => ({
      tasks: [optimistic, ...(prev?.tasks ?? [])],
      total: (prev?.total ?? 0) + 1,
    }));

    try {
      const result = await createTask(input);
      // Replace optimistic entry with real task
      setTaskData((prev) => ({
        tasks: (prev?.tasks ?? []).map((t) => (t.id === tempId ? result.task : t)),
        total: prev?.total ?? 1,
      }));
      return result.task;
    } catch (e) {
      // Rollback optimistic entry on error
      setTaskData((prev) => ({
        tasks: (prev?.tasks ?? []).filter((t) => t.id !== tempId),
        total: Math.max(0, (prev?.total ?? 1) - 1),
      }));
      throw e;
    } finally {
      setCreating(false);
    }
  }, [setTaskData]);

  const handleDeleteTask = useCallback(async (taskId: string): Promise<void> => {
    // Optimistic: remove immediately
    const snapshot = taskData?.tasks ?? [];
    setTaskData((prev) => ({
      tasks: (prev?.tasks ?? []).filter((t) => t.id !== taskId),
      total: Math.max(0, (prev?.total ?? 1) - 1),
    }));

    try {
      await softDeleteTask(taskId);
    } catch (e) {
      // Rollback on error
      setTaskData(() => ({
        tasks: snapshot,
        total: snapshot.length,
      }));
      throw e;
    }
  }, [taskData, setTaskData]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await syncLinearTasks();
      await refreshTasks();
      return result;
    } finally {
      setSyncing(false);
    }
  }, [refreshTasks]);

  const handleApproveReview = useCallback(async (reviewId: string): Promise<string> => {
    setActionLoading(`approve-${reviewId}`);
    try {
      const result = await approveReview(reviewId);
      await Promise.all([refreshTasks(), refreshReviews()]);
      return result.prUrl;
    } finally {
      setActionLoading(null);
    }
  }, [refreshTasks, refreshReviews]);

  const handleRequestChanges = useCallback(async (reviewId: string, feedback: string): Promise<void> => {
    if (!feedback.trim()) return;
    setActionLoading(`changes-${reviewId}`);
    try {
      await requestReviewChanges(reviewId, feedback);
      await Promise.all([refreshTasks(), refreshReviews()]);
    } finally {
      setActionLoading(null);
    }
  }, [refreshTasks, refreshReviews]);

  const handleRejectReview = useCallback(async (reviewId: string, reason?: string): Promise<void> => {
    setActionLoading(`reject-${reviewId}`);
    try {
      await rejectReview(reviewId, reason);
      await Promise.all([refreshTasks(), refreshReviews()]);
    } finally {
      setActionLoading(null);
    }
  }, [refreshTasks, refreshReviews]);

  return {
    // Data
    tasks: filteredTasks,
    allTasks: tasks,
    reviews,
    // Loading
    tasksLoading,
    creating,
    syncing,
    actionLoading,
    // Filters
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    // Helpers
    getReviewForTask,
    // Handlers
    handleCreateTask,
    handleDeleteTask,
    handleSync,
    handleApproveReview,
    handleRequestChanges,
    handleRejectReview,
    // Refresh
    refreshTasks,
  };
}
