"use client";

import { useState, useCallback, useRef } from "react";
import { authFetch } from "@/lib/api/authFetch";
import { normalizeTaskStatus, checkEmployeeWipLimit } from "@/lib/projectUtils";

/**
 * Custom Hook: useTaskMutations
 * Encapsulates all task mutation APIs with optimistic UI, concurrency control (HTTP 409),
 * Agile governance checks (HTTP 403), WIP limits, and graceful error handling.
 */
export function useTaskMutations({
  project,
  tasks = [],
  setTasks,
  setTaskLock,
  clearTaskLock,
  onTasksUpdated,
  showNotificationToast,
  employeeProfile,
  userRoleCategory = "EMPLOYEE",
}) {
  const [updatingTaskId, setUpdatingTaskId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inFlightLocksRef = useRef(new Map());

  // Helper: Centralized error handling
  const handleMutationError = useCallback(
    (err, responseData, statusCode, fallbackMsg) => {
      if (statusCode === 409 || responseData?.code === "CONCURRENCY_CONFLICT") {
        showNotificationToast?.(
          responseData?.message || "Conflict detected: This task was modified by another team member. Board state refreshed.",
          "warning"
        );
        if (onTasksUpdated) onTasksUpdated();
        return;
      }

      if (statusCode === 403) {
        showNotificationToast?.(
          responseData?.message || "Action Blocked: You do not have permission for this task operation.",
          "error"
        );
        return;
      }

      if (statusCode === 400) {
        showNotificationToast?.(
          responseData?.message || "Request Error: Please review input fields.",
          "warning"
        );
        return;
      }

      const isNetworkErr = err?.name === "TypeError" || String(err?.message || "").includes("Failed to fetch");
      if (isNetworkErr) {
        showNotificationToast?.("Network connection lost. Please check your network and try again.", "error");
        return;
      }

      showNotificationToast?.(responseData?.message || err?.message || fallbackMsg || "Operation failed.", "error");
    },
    [onTasksUpdated, showNotificationToast]
  );

  // 1. Direct Status Update (Board Drag & Drop or Status Dropdown)
  const updateTaskStatus = useCallback(
    async (taskId, newStatus, extraData = {}) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return false;

      const normStatus = normalizeTaskStatus(newStatus || "TODO");
      let nextProgress = extraData.progress !== undefined ? Number(extraData.progress) : Number(task.progress) || 0;
      if (normStatus === "COMPLETED") {
        nextProgress = 100;
      } else if (normStatus === "TODO") {
        nextProgress = 0;
      } else if (normStatus === "REVIEW") {
        nextProgress = Math.max(85, nextProgress);
      } else if (normStatus === "IN_PROGRESS") {
        nextProgress = nextProgress > 0 && nextProgress < 100 ? nextProgress : 50;
      }

      // Agile Governance Rule: Employee WIP Limit (Max 2 in-progress tasks)
      if (normStatus === "IN_PROGRESS" && normalizeTaskStatus(task.status) !== "IN_PROGRESS") {
        const assignee =
          task.assignee ||
          task.assigned_to ||
          task.assignee_id ||
          task.planned_assignee_id ||
          employeeProfile;
        const wipCheck = checkEmployeeWipLimit(assignee, tasks, taskId, 2);
        if (!wipCheck.allowed) {
          showNotificationToast?.(
            wipCheck.message ||
              "Already 2 tasks in progress! You can have at most 2 tasks in 'In Progress' at the same time. Please finish or submit your remaining in-progress tasks for review first.",
            "warning"
          );
          return false;
        }
      }

      // Record lock
      inFlightLocksRef.current.set(taskId, {
        status: normStatus,
        progress: nextProgress,
        timestamp: Date.now(),
      });
      setTaskLock?.(taskId, { status: normStatus, progress: nextProgress });

      // Local optimistic update
      const previousTasks = [...tasks];
      if (setTasks) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  status: normStatus,
                  progress: nextProgress,
                  ...extraData,
                }
              : t
          )
        );
      }

      setUpdatingTaskId(taskId);

      try {
        const payload = {
          status: normStatus,
          progress: nextProgress,
          expected_updated_at: task.updated_at || undefined,
          ...extraData,
        };

        const res = await authFetch(`/api/projects/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok && data.success) {
          if (setTasks && data.task) {
            setTasks((prev) =>
              prev.map((t) => (t.id === taskId ? { ...t, ...data.task, status: normStatus, progress: nextProgress } : t))
            );
          }
          showNotificationToast?.("Task status updated.", "success");
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("project-task-updated", {
                detail: { new: data.task, project_id: project?.id },
              })
            );
          }
          if (onTasksUpdated) onTasksUpdated();

          setTimeout(() => {
            inFlightLocksRef.current.delete(taskId);
            clearTaskLock?.(taskId);
          }, 4000);
          return true;
        } else {
          inFlightLocksRef.current.delete(taskId);
          clearTaskLock?.(taskId);
          if (setTasks) setTasks(previousTasks);
          handleMutationError(null, data, res.status, "Failed to update task status.");
          return false;
        }
      } catch (err) {
        inFlightLocksRef.current.delete(taskId);
        clearTaskLock?.(taskId);
        if (setTasks) setTasks(previousTasks);
        handleMutationError(err, null, null, "Failed to update task status.");
        return false;
      } finally {
        setUpdatingTaskId(null);
      }
    },
    [tasks, setTasks, setTaskLock, clearTaskLock, onTasksUpdated, project?.id, showNotificationToast, handleMutationError, userRoleCategory, employeeProfile]
  );

  // 2. Submit Deliverable for Review
  const submitDeliverableForReview = useCallback(
    async ({ taskId, comments, review_attachments, progress = 85 }) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return false;

      setIsSubmitting(true);
      const previousTasks = [...tasks];
      const nowIso = new Date().toISOString();

      if (setTasks) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  status: "REVIEW",
                  progress,
                  review_comments: comments,
                  review_attachments,
                  submitted_at: nowIso,
                }
              : t
          )
        );
      }

      try {
        const payload = {
          status: "REVIEW",
          progress,
          comments,
          review_comments: comments,
          review_attachments,
          review_submitted_at: nowIso,
          expected_updated_at: task.updated_at || undefined,
        };

        const res = await authFetch(`/api/projects/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok && data.success) {
          if (setTasks && data.task) {
            setTasks((prev) =>
              prev.map((t) => (t.id === taskId ? { ...t, ...data.task, status: "REVIEW" } : t))
            );
          }
          showNotificationToast?.("Deliverable submitted for review successfully.", "success");
          if (onTasksUpdated) onTasksUpdated();
          return true;
        } else {
          if (setTasks) setTasks(previousTasks);
          handleMutationError(null, data, res.status, "Failed to submit deliverable.");
          return false;
        }
      } catch (err) {
        if (setTasks) setTasks(previousTasks);
        handleMutationError(err, null, null, "Failed to submit deliverable.");
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [tasks, setTasks, onTasksUpdated, showNotificationToast, handleMutationError]
  );

  // 3. Approve Deliverable and Mark Completed
  const approveDeliverable = useCallback(
    async (task, reviewerProfile) => {
      if (!task?.id) return false;

      setIsSubmitting(true);
      const previousTasks = [...tasks];
      const nowIso = new Date().toISOString();
      const reviewerName = reviewerProfile?.full_name || "Team Lead";
      const reviewerId = reviewerProfile?.id || null;

      if (setTasks) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id
              ? {
                  ...t,
                  status: "COMPLETED",
                  progress: 100,
                  approved_at: nowIso,
                  approved_by: reviewerId,
                  approved_by_name: reviewerName,
                  completed_at: nowIso,
                }
              : t
          )
        );
      }

      try {
        const payload = {
          status: "COMPLETED",
          progress: 100,
          approved_by: reviewerId,
          approved_by_name: reviewerName,
          reviewed_by: reviewerId,
          reviewed_by_name: reviewerName,
          expected_updated_at: task.updated_at || undefined,
        };

        const res = await authFetch(`/api/projects/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok && data.success) {
          if (setTasks && data.task) {
            setTasks((prev) =>
              prev.map((t) => (t.id === task.id ? { ...t, ...data.task, status: "COMPLETED" } : t))
            );
          }
          showNotificationToast?.("Deliverable approved and marked as Completed!", "success");
          if (onTasksUpdated) onTasksUpdated();
          return true;
        } else {
          if (setTasks) setTasks(previousTasks);
          handleMutationError(null, data, res.status, "Failed to approve deliverable.");
          return false;
        }
      } catch (err) {
        if (setTasks) setTasks(previousTasks);
        handleMutationError(err, null, null, "Failed to approve deliverable.");
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [tasks, setTasks, onTasksUpdated, showNotificationToast, handleMutationError]
  );

  // 4. Request Revisions / Give Suggestions (Move to TODO)
  const requestRevisions = useCallback(
    async (task, suggestionsNote, reviewerProfile) => {
      if (!task?.id || !suggestionsNote?.trim()) return false;

      setIsSubmitting(true);
      const previousTasks = [...tasks];
      const nowIso = new Date().toISOString();
      const reviewerId = reviewerProfile?.id || null;

      if (setTasks) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id
              ? {
                  ...t,
                  status: "TODO",
                  progress: 0,
                  review_feedback: suggestionsNote.trim(),
                  review_feedback_by: reviewerId,
                  review_feedback_at: nowIso,
                }
              : t
          )
        );
      }

      try {
        const payload = {
          status: "TODO",
          progress: 0,
          review_feedback: suggestionsNote.trim(),
          review_feedback_by: reviewerId,
          review_feedback_at: nowIso,
          comments: `[Team Lead Suggestions]: ${suggestionsNote.trim()}`,
          expected_updated_at: task.updated_at || undefined,
        };

        const res = await authFetch(`/api/projects/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok && data.success) {
          if (setTasks && data.task) {
            setTasks((prev) =>
              prev.map((t) => (t.id === task.id ? { ...t, ...data.task, status: "TODO" } : t))
            );
          }
          showNotificationToast?.("Revision suggestions sent. Task moved to To Do for developer rework.", "info");
          if (onTasksUpdated) onTasksUpdated();
          return true;
        } else {
          if (setTasks) setTasks(previousTasks);
          handleMutationError(null, data, res.status, "Failed to submit suggestions.");
          return false;
        }
      } catch (err) {
        if (setTasks) setTasks(previousTasks);
        handleMutationError(err, null, null, "Failed to submit suggestions.");
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [tasks, setTasks, onTasksUpdated, showNotificationToast, handleMutationError]
  );

  // 5. Update Task Full Details (from TaskDetailModal)
  const updateTaskDetails = useCallback(
    async (taskId, patchPayload) => {
      const task = tasks.find((t) => t.id === taskId);
      setIsSubmitting(true);
      const previousTasks = [...tasks];

      try {
        const payload = {
          ...patchPayload,
          expected_updated_at: task?.updated_at || patchPayload.expected_updated_at || undefined,
        };

        const res = await authFetch(`/api/projects/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok && data.success) {
          if (setTasks && data.task) {
            setTasks((prev) =>
              prev.map((t) => (t.id === taskId ? { ...t, ...data.task } : t))
            );
          }
          showNotificationToast?.("Task details saved successfully.", "success");
          if (onTasksUpdated) onTasksUpdated();
          return data.task || true;
        } else {
          handleMutationError(null, data, res.status, "Failed to save task details.");
          return false;
        }
      } catch (err) {
        handleMutationError(err, null, null, "Failed to save task details.");
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [tasks, setTasks, onTasksUpdated, showNotificationToast, handleMutationError]
  );

  return {
    updatingTaskId,
    isSubmitting,
    updateTaskStatus,
    submitDeliverableForReview,
    approveDeliverable,
    requestRevisions,
    updateTaskDetails,
  };
}
