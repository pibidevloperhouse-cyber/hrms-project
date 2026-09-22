/* eslint-disable react-hooks/purity */
"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import TaskDetailModal from "./TaskDetailModal";
import TaskProgressUpdateModal from "./TaskProgressUpdateModal";
import CreateStoryTaskModal from "./CreateStoryTaskModal";
import TaskSuggestionModal from "./TaskSuggestionModal";
import TaskExtensionModal from "./TaskExtensionModal";
import TaskExtensionReviewModal from "./TaskExtensionReviewModal";
import { checkTaskSprintOverdue } from "@/lib/projectUtils";

const isDueToday = (dueDateStr) => {
  if (!dueDateStr) return false;
  try {
    const d = new Date(dueDateStr);
    if (isNaN(d.getTime())) return false;
    const today = new Date();
    return (
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    );
  } catch {
    return false;
  }
};

const isTaskOverdue = (dueDateStr, status) => {
  if (!dueDateStr || status === "COMPLETED") return false;
  try {
    const d = new Date(dueDateStr);
    if (isNaN(d.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(d);
    target.setHours(0, 0, 0, 0);
    return target < today;
  } catch {
    return false;
  }
};

const COLUMNS = [
  { id: "TODO", label: "To Do", bg: "bg-slate-50", border: "border-slate-200", dot: "bg-slate-400" },
  { id: "IN_PROGRESS", label: "In Progress", bg: "bg-sky-50/50", border: "border-sky-200", dot: "bg-sky-500 animate-pulse" },
  { id: "REVIEW", label: "In Review", bg: "bg-purple-50/50", border: "border-purple-200", dot: "bg-purple-500" },
  { id: "COMPLETED", label: "Completed", bg: "bg-emerald-50/50", border: "border-emerald-200", dot: "bg-emerald-500" },
];

export default function ProjectBoardTab({
  project,
  tasks = [],
  setTasks,
  sprints = [],
  epics = [],
  departmentEmployees = [],
  teamLeads = [],
  employeeProfile,
  currentUserId,
  setTaskLock,
  clearTaskLock,
  onTasksUpdated,
}) {
  const allEmployees = useMemo(() => {
    const map = new Map();
    const allPool = [...(departmentEmployees || []), ...(teamLeads || [])];

    // 1. Team Lead
    if (project?.teamLead?.id) {
      map.set(project.teamLead.id, { ...project.teamLead, roleTag: "Team Lead" });
    } else if (project?.team_lead_id) {
      const lead = allPool.find((e) => e.id === project.team_lead_id);
      if (lead) map.set(lead.id, { ...lead, roleTag: "Team Lead" });
    }

    // 2. Creator / Owner
    if (project?.creator?.id) {
      map.set(project.creator.id, { ...project.creator, roleTag: "Owner" });
    } else if (project?.created_by || project?.owner_id) {
      const ownerId = project.owner_id || project.created_by;
      const owner = allPool.find((e) => e.id === ownerId);
      if (owner) map.set(owner.id, { ...owner, roleTag: "Owner" });
    }

    // 3. Team Members (from project.teamMembers objects or project.team_members IDs)
    if (Array.isArray(project?.teamMembers) && project.teamMembers.length > 0) {
      project.teamMembers.forEach((m) => {
        if (m?.id && !map.has(m.id)) {
          map.set(m.id, { ...m, roleTag: m.designation || m.role || "Member" });
        }
      });
    }

    if (Array.isArray(project?.team_members) && project.team_members.length > 0) {
      project.team_members.forEach((memberId) => {
        const cleanId = typeof memberId === "object" ? memberId?.id : memberId;
        if (cleanId && !map.has(cleanId)) {
          const emp = typeof memberId === "object" ? memberId : allPool.find((e) => e.id === cleanId);
          if (emp) {
            map.set(cleanId, { ...emp, roleTag: emp.designation || emp.role || "Member" });
          }
        }
      });
    }

    return Array.from(map.values()).sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
  }, [project, departmentEmployees, teamLeads]);
  const isKanban = (project?.project_type || "").toLowerCase() === "kanban";

  const activeSprint = useMemo(() => {
    if (isKanban) return null;
    return (sprints || []).find((s) => String(s.status).toUpperCase() === "ACTIVE") || null;
  }, [sprints, isKanban]);

  const [sprintFilter, setSprintFilter] = useState("active");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [updatingTaskId, setUpdatingTaskId] = useState(null);
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState(null);
  const [selectedTaskForSuggestion, setSelectedTaskForSuggestion] = useState(null);
  const [selectedTaskForExtension, setSelectedTaskForExtension] = useState(null);
  const [selectedTaskForExtensionReview, setSelectedTaskForExtensionReview] = useState(null);
  const inFlightBoardLocksRef = useRef(new Map());

  const projectKey = useMemo(() => {
    if (project?.key) return project.key;
    if (!project?.name) return "TP";
    const words = project.name.trim().split(/\s+/);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return project.name.slice(0, 3).toUpperCase();
  }, [project?.key, project?.name]);

  const getEmployeeInitials = (name) => {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Helper: Check if task has active Team Lead feedback / suggestions
  const hasActiveTlSuggestions = (task) => {
    if (!task) return false;
    if (task.status !== "TODO" && task.status !== "IN_PROGRESS") return false;
    if (task.review_feedback && typeof task.review_feedback === "string" && task.review_feedback.trim().length > 0) {
      return true;
    }
    const comm = task.comments || task.last_status_comment || "";
    if (typeof comm === "string") {
      return (
        comm.includes("[Team Lead Suggestions]:") ||
        comm.includes("[Team Lead Revision Feedback]:") ||
        comm.includes("[Scope Revision Instructions]:")
      );
    }
    return false;
  };

  // Drag-and-drop & Progress Update Modal state
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dragOverColId, setDragOverColId] = useState(null);
  const [pendingProgressUpdate, setPendingProgressUpdate] = useState(null); // { task, targetStatus }
  const [isSubmittingProgress, setIsSubmittingProgress] = useState(false);

  // Quick new story/task/bug modal state
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [toastMsg, setToastMsg] = useState(null);

  useEffect(() => {
    if (toastMsg) {
      const timer = setTimeout(() => setToastMsg(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [toastMsg]);

  const showNotificationToast = (message, type = "info") => {
    setToastMsg({ message, type });
  };

  // Helper: Verify if task is assigned to the currently logged in employee
  const isTaskAssignedToCurrentUser = (task) => {
    if (!task) return false;
    const effectiveUserId = currentUserId || employeeProfile?.id;
    const authId = employeeProfile?.auth_user_id || employeeProfile?.user_id;
    const userEmail = employeeProfile?.email?.toLowerCase()?.trim();

    // Check direct ID match
    if (effectiveUserId) {
      if (
        task.assigned_to === effectiveUserId ||
        task.assignee_id === effectiveUserId ||
        task.planned_assignee_id === effectiveUserId ||
        task.assignee?.id === effectiveUserId ||
        task.planned_assignee?.id === effectiveUserId
      ) {
        return true;
      }
    }

    if (authId) {
      if (
        task.assigned_to === authId ||
        task.assignee_id === authId ||
        task.planned_assignee_id === authId ||
        task.assignee?.auth_user_id === authId ||
        task.assignee?.id === authId ||
        task.planned_assignee?.auth_user_id === authId ||
        task.planned_assignee?.id === authId
      ) {
        return true;
      }
    }

    if (userEmail) {
      const taskEmail = (task.assignee?.email || task.planned_assignee?.email || "")?.toLowerCase()?.trim();
      if (taskEmail && taskEmail === userEmail) {
        return true;
      }
    }

    return false;
  };

  const cleanRole = (employeeProfile?.role || "").toLowerCase().replace(/[\s_-]+/g, "");
  const isOwnerOrAdmin = cleanRole.includes("admin") || cleanRole.includes("owner") || cleanRole.includes("hr");
  const isProjectOwnerOrCreator = project?.owner_id === employeeProfile?.id || project?.created_by === employeeProfile?.id;
  const isAssignedLead = project?.team_lead_id === employeeProfile?.id;
  const isManagerRole = cleanRole.includes("manager") || cleanRole.includes("lead");
  const isLeadOrManagerOrAdmin = isOwnerOrAdmin || isProjectOwnerOrCreator || isAssignedLead || isManagerRole;

  // Sprint Readiness Helper: Backlog & Planned sprints are locked for regular employees until started
  const getTaskSprintState = (task) => {
    if (isKanban) return { isReady: true, reason: "", sprintName: "" };
    if (!task?.sprint_id) {
      return {
        isReady: false,
        reason: "Cannot update status: Task is in Backlog (no active sprint)",
        sprintName: "Backlog",
      };
    }
    const sprint = sprints.find((s) => s.id === task.sprint_id);
    if (!sprint || String(sprint.status).toUpperCase() !== "ACTIVE") {
      return {
        isReady: false,
        reason: `Cannot update status: Sprint "${sprint?.name || "Planned"}" is planned (not started)`,
        sprintName: sprint?.name || "Planned Sprint",
      };
    }
    return { isReady: true, reason: "", sprintName: sprint.name };
  };

  // Filter tasks: Strictly show only Active Sprint tasks for Scrum projects by default
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (!isKanban) {
        // STRICT RULE FOR EMPLOYEES: Only tasks in the currently ACTIVE sprint are shown on the board!
        // Tasks in upcoming/planned sprints or unscheduled backlog are excluded.
        if (!isLeadOrManagerOrAdmin) {
          if (!activeSprint || task.sprint_id !== activeSprint.id) return false;
        } else {
          if (sprintFilter === "active") {
            if (!activeSprint || task.sprint_id !== activeSprint.id) return false;
          } else if (sprintFilter === "backlog") {
            const isInBacklog = !task.sprint_id || !sprints.some((s) => s.id === task.sprint_id);
            if (!isInBacklog) return false;
          } else if (sprintFilter !== "all") {
            // Specific sprint ID filter
            if (task.sprint_id !== sprintFilter) return false;
          }
        }
      }

      if (assigneeFilter !== "all") {
        const matchesAssignee =
          task.assigned_to === assigneeFilter ||
          task.planned_assignee_id === assigneeFilter ||
          task.assignee_id === assigneeFilter ||
          task.assignee?.id === assigneeFilter ||
          task.assignee?.auth_user_id === assigneeFilter ||
          task.planned_assignee?.id === assigneeFilter ||
          task.planned_assignee?.auth_user_id === assigneeFilter;
        if (!matchesAssignee) return false;
      }

      if (priorityFilter !== "all") {
        const taskPriority = (task.priority || "MEDIUM").toUpperCase();
        if (taskPriority !== priorityFilter) return false;
      }

      return true;
    });
  }, [tasks, sprints, activeSprint, sprintFilter, assigneeFilter, priorityFilter, isKanban, isLeadOrManagerOrAdmin]);

  // Direct status update for drag & drop and quick dropdown with instant optimistic UI (<10ms)
  const executeDirectStatusUpdate = async (taskId, newStatus) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    if (!isTaskAssignedToCurrentUser(task)) {
      showNotificationToast(
        "Only the assigned employee can update the task status. Managers can view progress only.",
        "warning"
      );
      return;
    }

    if (!isLeadOrManagerOrAdmin) {
      const sprintState = getTaskSprintState(task);
      if (!sprintState.isReady) {
        showNotificationToast(sprintState.reason, "warning");
        return;
      }
    }

    const normStatus = (newStatus || "TODO").toUpperCase().replace(/[\s-]+/g, "_");
    if (task.status === normStatus) return;

    // Scrum Review & Completion Rule: Only Project Manager, Team Lead, Owner, or Admin can mark as Completed
    if (normStatus === "COMPLETED" && !isLeadOrManagerOrAdmin) {
      setPendingProgressUpdate({
        task,
        targetStatus: "REVIEW",
      });
      showNotificationToast(
        "Deliverable Approval Required: Only the Project Manager or Team Lead can mark this task as Completed. Please submit for Review.",
        "warning"
      );
      return;
    }

    // Determine intuitive default progress based on target status
    let nextProgress = Number(task.progress) || 0;
    if (normStatus === "COMPLETED") {
      nextProgress = 100;
    } else if (normStatus === "TODO") {
      nextProgress = 0;
    } else if (normStatus === "REVIEW") {
      nextProgress = Math.max(85, nextProgress);
    } else if (normStatus === "IN_PROGRESS") {
      nextProgress = nextProgress > 0 && nextProgress < 100 ? nextProgress : 50;
    }

    // Record In-Flight Mutation Lock on both board and parent workspace
    inFlightBoardLocksRef.current.set(taskId, {
      status: normStatus,
      progress: nextProgress,
      timestamp: Date.now(),
    });
    setTaskLock?.(taskId, { status: normStatus, progress: nextProgress });

    // Instant local optimistic update for immediate feedback (<10ms)
    const previousTasks = [...tasks];
    if (setTasks) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: normStatus,
                progress: nextProgress,
              }
            : t
        )
      );
    }

    setUpdatingTaskId(taskId);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      const res = await fetch(`/api/projects/tasks/${taskId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          status: normStatus,
          progress: nextProgress,
        }),
      });

      if (res.ok) {
        const resData = await res.json();
        if (setTasks && resData.task) {
          setTasks((prev) =>
            prev.map((t) => (t.id === taskId ? { ...t, ...resData.task, status: normStatus, progress: nextProgress } : t))
          );
        }
        showNotificationToast("Item status updated.", "success");
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("project-task-updated", {
              detail: { new: resData.task, project_id: project?.id },
            })
          );
        }
        if (onTasksUpdated) onTasksUpdated();
        setTimeout(() => {
          inFlightBoardLocksRef.current.delete(taskId);
          clearTaskLock?.(taskId);
        }, 4000);
      } else {
        inFlightBoardLocksRef.current.delete(taskId);
        clearTaskLock?.(taskId);
        if (setTasks) setTasks(previousTasks);
        const data = await res.json();
        throw new Error(data.message || "Failed to update task status.");
      }
    } catch (err) {
      inFlightBoardLocksRef.current.delete(taskId);
      clearTaskLock?.(taskId);
      if (setTasks) setTasks(previousTasks);
      console.error("Failed to update status via drag-and-drop:", err);
      showNotificationToast(err.message || "Failed to update task status.", "error");
    } finally {
      setUpdatingTaskId(null);
    }
  };

  // Drag and drop event handlers: ONLY assigned employee can drag
  const handleDragStart = (e, task) => {
    if (!isTaskAssignedToCurrentUser(task)) {
      e.preventDefault();
      showNotificationToast(
        "Only the assigned employee can drag and update the status of this task. Managers can view progress only.",
        "warning"
      );
      return;
    }

    if (!isLeadOrManagerOrAdmin) {
      const sprintState = getTaskSprintState(task);
      if (!sprintState.isReady) {
        e.preventDefault();
        showNotificationToast(sprintState.reason, "warning");
        return;
      }
    }

    e.dataTransfer.setData("text/plain", task.id);
    e.dataTransfer.effectAllowed = "move";
    setDraggedTaskId(task.id);
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverColId(null);
  };

  const handleDragOver = (e, colId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverColId !== colId) {
      setDragOverColId(colId);
    }
  };

  const handleDragLeave = (e, colId) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    if (dragOverColId === colId) {
      setDragOverColId(null);
    }
  };

  const handleDrop = (e, targetColId) => {
    e.preventDefault();
    setDragOverColId(null);
    const taskId = e.dataTransfer.getData("text/plain") || draggedTaskId;
    setDraggedTaskId(null);
    if (!taskId) return;

    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    if (!isTaskAssignedToCurrentUser(task)) {
      showNotificationToast(
        "Only the assigned employee can update the task status. Managers can view progress only.",
        "warning"
      );
      return;
    }

    if (!isLeadOrManagerOrAdmin) {
      const sprintState = getTaskSprintState(task);
      if (!sprintState.isReady) {
        showNotificationToast(sprintState.reason, "warning");
        return;
      }
    }

    const normTarget = (targetColId || "TODO").toUpperCase().replace(/[\s-]+/g, "_");
    if (task.status === normTarget) return;

    // Scrum Review & Completion Rule: If moving to COMPLETED and employee is not lead/manager/admin
    if (normTarget === "COMPLETED" && !isLeadOrManagerOrAdmin) {
      setPendingProgressUpdate({
        task,
        targetStatus: "REVIEW",
      });
      showNotificationToast(
        "Deliverable Approval Required: Only the Project Manager or Team Lead can mark this task as Completed. Please submit for Review.",
        "info"
      );
      return;
    }

    // When moving to REVIEW, open progress/review modal so employee enters summary notes
    if (normTarget === "REVIEW") {
      setPendingProgressUpdate({
        task,
        targetStatus: "REVIEW",
      });
      return;
    }

    executeDirectStatusUpdate(taskId, targetColId);
  };

  // Confirm progress status update from popup modal with instant optimistic UI update
  const handleConfirmProgressUpdate = async ({
    taskId,
    newStatus,
    progress,
    comments,
    review_comments,
    review_attachments,
    review_submitted_at,
  }) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !isTaskAssignedToCurrentUser(task)) {
      showNotificationToast(
        "Only the assigned employee can update the task status. Managers can view progress only.",
        "warning"
      );
      setPendingProgressUpdate(null);
      return;
    }

    if (!isLeadOrManagerOrAdmin) {
      const sprintState = getTaskSprintState(task);
      if (!sprintState.isReady) {
        showNotificationToast(sprintState.reason, "warning");
        setPendingProgressUpdate(null);
        return;
      }
    }

    const normStatus = (newStatus || "TODO").toUpperCase().replace(/[\s-]+/g, "_");
    const nextProgress = progress !== undefined ? Number(progress) : (normStatus === "COMPLETED" ? 100 : normStatus === "REVIEW" ? 85 : 50);

    // Record In-Flight Mutation Lock on both board and parent workspace
    inFlightBoardLocksRef.current.set(taskId, {
      status: normStatus,
      progress: nextProgress,
      timestamp: Date.now(),
    });
    setTaskLock?.(taskId, { status: normStatus, progress: nextProgress });

    // Optimistic local state update for instant UI feedback (<10ms)
    const previousTasks = [...tasks];
    if (setTasks) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: normStatus,
                progress: nextProgress,
              }
            : t
        )
      );
    }

    setIsSubmittingProgress(true);
    setUpdatingTaskId(taskId);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      const payload = {
        status: normStatus,
        progress: nextProgress,
        comments,
      };
      if (review_comments !== undefined) payload.review_comments = review_comments;
      if (review_attachments !== undefined) payload.review_attachments = review_attachments;
      if (review_submitted_at !== undefined) payload.review_submitted_at = review_submitted_at;

      const res = await fetch(`/api/projects/tasks/${taskId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const resData = await res.json();
        if (setTasks && resData.task) {
          setTasks((prev) =>
            prev.map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    ...resData.task,
                    status: normStatus,
                    progress: nextProgress,
                  }
                : t
            )
          );
        }
        showNotificationToast("Item status updated.", "success");
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("project-task-updated", {
              detail: { new: resData.task, project_id: project?.id },
            })
          );
        }
        if (onTasksUpdated) onTasksUpdated();
        setTimeout(() => {
          inFlightBoardLocksRef.current.delete(taskId);
          clearTaskLock?.(taskId);
        }, 4000);
      } else {
        inFlightBoardLocksRef.current.delete(taskId);
        clearTaskLock?.(taskId);
        if (setTasks) setTasks(previousTasks);
        const data = await res.json();
        throw new Error(data.message || "Failed to update task progress.");
      }
    } catch (err) {
      inFlightBoardLocksRef.current.delete(taskId);
      clearTaskLock?.(taskId);
      if (setTasks) setTasks(previousTasks);
      console.error("Failed to update task progress:", err);
      showNotificationToast(err.message || "Failed to update task progress.", "error");
    } finally {
      setIsSubmittingProgress(false);
      setUpdatingTaskId(null);
      setPendingProgressUpdate(null);
    }
  };

  // Create Story / Task / Bug
  const handleCreateTask = async (taskPayload) => {
    setIsCreating(true);
    setFormError("");

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      const res = await fetch(`/api/projects/${project.id}/tasks`, {
        method: "POST",
        headers,
        body: JSON.stringify(taskPayload),
      });

      const data = await res.json();
      if (res.ok) {
        setIsTaskModalOpen(false);
        const targetSprintObj = sprints.find((s) => s.id === taskPayload.sprint_id);
        const overdueWarning = checkTaskSprintOverdue(taskPayload.due_date, targetSprintObj);
        if (overdueWarning) {
          showNotificationToast(
            `⚠️ Created with schedule notice: ${overdueWarning.shortMessage} (Sprint ends ${overdueWarning.sprintEndDate})`,
            "warning"
          );
        } else {
          showNotificationToast(
            taskPayload.task_type === "BUG"
              ? "Bug logged successfully."
              : "Task created successfully.",
            "success"
          );
        }
        if (onTasksUpdated) onTasksUpdated();
      } else {
        setFormError(data.message || "Failed to create task.");
        throw new Error(data.message || "Failed to create task.");
      }
    } catch (err) {
      console.error("Failed to create task:", err);
      throw err;
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-4 text-xs text-slate-800">
      {/* Board Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Sprint Filter (Only in Scrum / Custom Agile) */}
          {!isKanban && (
            isLeadOrManagerOrAdmin ? (
              <select
                value={sprintFilter}
                onChange={(e) => setSprintFilter(e.target.value)}
                className="h-8.5 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold focus:outline-none focus:border-blue-600 cursor-pointer shadow-2xs"
              >
                <option value="active">
                  ⚡ Active Sprint {activeSprint ? `(${activeSprint.name})` : "(None Running)"}
                </option>
                {sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.status})
                  </option>
                ))}
                <option value="backlog">Backlog (Unscheduled)</option>
                <option value="all">All Sprints &amp; Tasks</option>
              </select>
            ) : (
              <div className="h-8.5 px-3 rounded-lg border border-blue-200 bg-blue-50/70 text-blue-900 text-xs font-bold flex items-center gap-1.5 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>⚡ Active Sprint: {activeSprint ? activeSprint.name : "None Running"}</span>
              </div>
            )
          )}

          {/* Assignee Filter */}
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="h-8.5 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-medium focus:outline-none focus:border-blue-600 cursor-pointer shadow-2xs"
          >
            <option value="all">All Assignees</option>
            {allEmployees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.full_name} {emp.designation ? `(${emp.designation})` : ""}
              </option>
            ))}
          </select>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="h-8.5 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-medium focus:outline-none focus:border-blue-600 cursor-pointer shadow-2xs"
          >
            <option value="all">All Priorities</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => setIsTaskModalOpen(true)}
          className="h-8.5 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
        >
          <span>+</span>
          <span>Add Task</span>
        </button>
      </div>

      {/* Active Sprint Notice / Summary Banner for Scrum */}
      {!isKanban && sprintFilter === "active" && (
        activeSprint ? (
          <div className="px-4 py-2.5 rounded-xl bg-blue-50/70 border border-blue-200 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-bold text-slate-900">Active Sprint: {activeSprint.name}</span>
              {activeSprint.goal && (
                <span className="text-slate-500 text-[11px] hidden sm:inline truncate max-w-md">
                  — {activeSprint.goal}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
              <span>📅 {activeSprint.start_date || "Start"} → {activeSprint.end_date || "End"}</span>
              <span className="font-bold text-blue-700">
                {filteredTasks.filter((t) => t.status === "COMPLETED").length} of {filteredTasks.length} tasks completed
              </span>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="text-base">ℹ️</span>
              <div>
                <p className="font-bold">No Active Sprint Running</p>
                <p className="text-[11px] text-amber-700">
                  The Scrum board displays tasks for the active sprint only. Tasks in planned or upcoming sprints are managed in the Sprints &amp; Backlog tabs until started.
                </p>
              </div>
            </div>
          </div>
        )
      )}

      {/* Kanban Board Columns with HTML5 Drag and Drop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {COLUMNS.map((col) => {
          const colTasks = filteredTasks.filter((t) => {
            const normSt = (t.status || "TODO").toUpperCase().replace(/[\s-]+/g, "_");
            return normSt === col.id;
          });
          const isOver = dragOverColId === col.id;

          return (
            <div
              key={col.id}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={(e) => handleDragLeave(e, col.id)}
              onDrop={(e) => handleDrop(e, col.id)}
              className={`rounded-xl border p-3 space-y-3 min-h-[480px] flex flex-col transition-all duration-200 ${isOver
                  ? "bg-blue-50/80 border-blue-400 border-dashed ring-2 ring-blue-500/20 shadow-md scale-[1.01]"
                  : `${col.bg} border-slate-200/80`
                }`}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                  <span className="font-bold text-slate-800 text-xs">{col.label}</span>
                </div>
                <span className="text-[10px] font-mono font-bold text-slate-500 bg-white px-1.5 py-0.2 rounded border border-slate-200">
                  {colTasks.length}
                </span>
              </div>

              {/* Drag Over Visual Target Banner */}
              {draggedTaskId && isOver && (
                <div className="py-2 px-3 rounded-lg border border-dashed border-blue-400 bg-blue-100/80 text-blue-800 text-center text-[11px] font-bold animate-pulse flex items-center justify-center gap-1.5 shadow-2xs">
                  <span>↓</span>
                  <span>Drop to change to {col.label}</span>
                </div>
              )}

              {/* Column Tasks */}
              <div className="space-y-2.5 flex-1 overflow-y-auto">
                {colTasks.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs italic">
                    {isOver ? "Release to drop task here" : "No tasks"}
                  </div>
                ) : (
                  colTasks.map((task, idx) => {
                    const assignee =
                      task.assignee ||
                      task.planned_assignee ||
                      allEmployees.find((e) => e.id === (task.assigned_to || task.planned_assignee_id || task.assignee_id));
                    const linkedEpic = epics.find((e) => e.id === task.epic_id);
                    const isDueTodayTask = isDueToday(task.due_date) && task.status !== "COMPLETED";
                    const isOverdue = isTaskOverdue(task.due_date, task.status);

                    const isBeingDragged = draggedTaskId === task.id;
                    const isAssigned = isTaskAssignedToCurrentUser(task);
                    const sprintState = getTaskSprintState(task);
                    const canMoveTask = isAssigned && (isLeadOrManagerOrAdmin || sprintState.isReady);
                    const isTaskSprintLocked = !isLeadOrManagerOrAdmin && !sprintState.isReady;

                    const taskIndex = tasks.findIndex((t) => t.id === task.id) + 1;
                    const taskCode =
                      task.task_code ||
                      task.task_number ||
                      `${projectKey}-I${task.item_number || (taskIndex > 0 ? taskIndex : idx + 1)}`;
                    const initials = getEmployeeInitials(assignee?.full_name);

                    return (
                      <div
                        key={task.id}
                        draggable={canMoveTask}
                        onDragStart={canMoveTask ? (e) => handleDragStart(e, task) : undefined}
                        onDragEnd={canMoveTask ? handleDragEnd : undefined}
                        onClick={() => {
                          if (hasActiveTlSuggestions(task)) {
                            setSelectedTaskForSuggestion(task);
                          } else {
                            setSelectedTaskForDetail(task);
                          }
                        }}
                        className={`relative p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-2xs hover:shadow-md hover:border-slate-300 transition-all duration-150 group select-none ${
                          canMoveTask ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                        } ${isBeingDragged ? "opacity-30 scale-95 border-dashed border-blue-500" : ""} ${
                          updatingTaskId === task.id ? "opacity-50 pointer-events-none" : ""
                        }`}
                        title={
                          hasActiveTlSuggestions(task)
                            ? "Team Lead provided suggestions. Click to view instructions."
                            : isDueTodayTask
                            ? "Deliverable is due today. Click to inspect details and prioritize work."
                            : canMoveTask
                            ? "Drag to change status, or click to view detailed description"
                            : isAssigned && isTaskSprintLocked
                            ? "Sprint is in planned state. Status updates locked."
                            : "Click to view task details."
                        }
                      >
                        {/* Left vertical accent bar */}
                        <div
                          className={`absolute left-0 top-3 bottom-3 w-1 rounded-r ${
                            task.task_type === "BUG"
                              ? "bg-rose-500"
                              : task.priority === "URGENT"
                              ? "bg-rose-500"
                              : task.priority === "HIGH"
                              ? "bg-orange-500"
                              : "bg-emerald-500"
                          }`}
                        />

                        {/* Top Row: Task Icon + Task Code (Left) & Assignee Avatar (Right) */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {task.task_type === "BUG" ? (
                              <svg
                                className="w-3.5 h-3.5 text-rose-500 shrink-0"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.2"
                              >
                                <circle cx="12" cy="12" r="9" />
                                <path d="M12 8v4m0 4h.01" />
                              </svg>
                            ) : (
                              <svg
                                className="w-3.5 h-3.5 text-emerald-600 shrink-0"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.2"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                />
                              </svg>
                            )}
                            <span className="font-semibold text-slate-800 text-xs tracking-tight truncate">
                              {taskCode}
                            </span>
                          </div>

                          {/* Assignee Avatar Initials Badge */}
                          <div
                            className="w-6 h-6 rounded bg-slate-100/90 border border-slate-200/80 text-slate-700 font-bold text-[10px] flex items-center justify-center shrink-0 shadow-2xs"
                            title={assignee?.full_name ? `Assignee: ${assignee.full_name}` : "Unassigned"}
                          >
                            {initials}
                          </div>
                        </div>

                        {/* Middle: Clean Task Title */}
                        <h5 className="font-medium text-slate-900 text-[13px] leading-snug group-hover:text-blue-600 transition pt-1.5 pb-0.5">
                          {task.title}
                        </h5>

                        {/* Epic / Category Pill */}
                        {linkedEpic && (
                          <div className="pt-1">
                            <span
                              className="inline-flex items-center text-[11px] font-medium text-slate-800 bg-slate-100/80 px-2 py-0.5 rounded border-l-[3px] truncate max-w-full"
                              style={{ borderLeftColor: linkedEpic.color || "#2563eb" }}
                              title={`Epic: ${linkedEpic.name}`}
                            >
                              {linkedEpic.name}
                            </span>
                          </div>
                        )}

                        {/* Due Today Attention Badge */}
                        {isDueTodayTask && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTaskForDetail(task);
                            }}
                            className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-amber-950 bg-gradient-to-r from-amber-100 via-orange-100 to-amber-100 border border-amber-300 hover:border-amber-400 px-2 py-1 rounded-md shadow-2xs w-fit cursor-pointer transition active:scale-95 animate-fadeIn"
                            title="Due Today: Please analyze deliverable status and prioritize work."
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            <span>⏱️ Due Today · Prioritize Work</span>
                          </div>
                        )}

                        {/* Extension Request Pending Badge */}
                        {task.extension_status === "PENDING" && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isLeadOrManagerOrAdmin) {
                                setSelectedTaskForExtensionReview(task);
                              } else {
                                setSelectedTaskForDetail(task);
                              }
                            }}
                            className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-slate-800 bg-slate-100 border border-slate-300 hover:border-blue-400 hover:text-blue-700 px-2 py-1 rounded-md shadow-2xs w-fit cursor-pointer transition active:scale-95 animate-fadeIn"
                            title={`Extension requested to ${task.extension_requested_date ? new Date(task.extension_requested_date).toLocaleDateString() : "new date"}. Click to review.`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                            <span>⏳ Extension Pending Review</span>
                          </div>
                        )}

                        {/* Extension Approved Badge */}
                        {task.extension_status === "APPROVED" && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTaskForDetail(task);
                            }}
                            className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-emerald-900 bg-emerald-50 border border-emerald-300 hover:border-emerald-400 px-2 py-0.5 rounded-md shadow-2xs w-fit cursor-pointer transition active:scale-95 animate-fadeIn"
                            title="Deadline extension was approved by Team Lead."
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span>✓ Extension Approved</span>
                          </div>
                        )}

                        {/* Team Lead Feedback notification banner if suggestions exist */}
                        {hasActiveTlSuggestions(task) && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTaskForSuggestion(task);
                            }}
                            className="mt-2 flex items-center gap-1.5 text-[10px] font-extrabold text-amber-950 bg-gradient-to-r from-amber-100 via-orange-100 to-amber-100 border border-amber-300 hover:border-amber-400 px-2 py-1 rounded-md shadow-2xs w-fit cursor-pointer transition active:scale-95 animate-fadeIn"
                            title="Team Lead requested improvements. Click to view suggestions."
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
                            <span>💬 TL Review Suggestions</span>
                          </div>
                        )}

                        {/* Bottom Toolbar with dashed divider */}
                        <div className="border-t border-dashed border-slate-200 mt-2.5 pt-2 flex items-center justify-between text-slate-400">
                          {/* Left action icons */}
                          <div className="flex items-center gap-2">
                            {/* Timer / Due Date */}
                            <div
                              className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition cursor-pointer text-[11px] font-medium ${
                                isDueTodayTask
                                  ? "text-amber-900 bg-amber-50 border border-amber-300/80 font-bold font-mono"
                                  : isOverdue
                                  ? "text-rose-700 bg-rose-50 border border-rose-300/80 font-bold font-mono"
                                  : "hover:text-slate-700"
                              }`}
                              title={
                                isDueTodayTask
                                  ? "⏰ Due Today: Please analyze task progress and prioritize delivery"
                                  : isOverdue
                                  ? `⚠️ Overdue since ${new Date(task.due_date).toLocaleDateString()}`
                                  : task.due_date
                                  ? `Due Date: ${new Date(task.due_date).toLocaleDateString()}`
                                  : "No due date"
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTaskForDetail(task);
                              }}
                            >
                              <svg
                                className={`w-3.5 h-3.5 ${
                                  isDueTodayTask ? "text-amber-600 animate-pulse" : isOverdue ? "text-rose-500" : ""
                                }`}
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                              </svg>
                              <span>
                                {isDueTodayTask
                                  ? "Due Today"
                                  : isOverdue
                                  ? "Overdue"
                                  : task.due_date
                                  ? new Date(task.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                                  : ""}
                              </span>
                            </div>

                            {/* Story Points / Database icon */}
                            <div
                              className="flex items-center gap-0.5 hover:text-slate-700 transition cursor-pointer"
                              title={`Story Points: ${task.story_points || 1} pts`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTaskForDetail(task);
                              }}
                            >
                              <svg
                                className="w-3.5 h-3.5"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <ellipse cx="12" cy="5" rx="9" ry="3" />
                                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                              </svg>
                              {task.story_points ? (
                                <span className="text-[10px] font-mono font-semibold text-slate-600">
                                  {task.story_points}
                                </span>
                              ) : null}
                            </div>

                            {/* Comments / Feedback icon */}
                            <div
                              className={`relative hover:text-slate-700 transition cursor-pointer ${
                                hasActiveTlSuggestions(task) ? "text-amber-600" : ""
                              }`}
                              title={
                                hasActiveTlSuggestions(task)
                                  ? "Team Lead Feedback Available - Click to view"
                                  : task.comments
                                  ? `Comments: ${task.comments}`
                                  : "Comments & Feedback"
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                if (hasActiveTlSuggestions(task)) {
                                  setSelectedTaskForSuggestion(task);
                                } else {
                                  setSelectedTaskForDetail(task);
                                }
                              }}
                            >
                              <svg
                                className="w-3.5 h-3.5"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                              </svg>
                              {hasActiveTlSuggestions(task) && (
                                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500 animate-pulse ring-1 ring-white" />
                              )}
                            </div>

                            {/* Request Extension Quick Trigger for Assigned Employee */}
                            {isTaskAssignedToCurrentUser(task) && task.status !== "COMPLETED" && (
                              <div
                                className={`hover:text-blue-600 transition cursor-pointer text-[11px] flex items-center gap-0.5 ${
                                  task.extension_status === "PENDING" ? "text-amber-600" : ""
                                }`}
                                title={
                                  task.extension_status === "PENDING"
                                    ? "Extension request pending Team Lead review"
                                    : "Request Deadline Extension from Team Lead"
                                }
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedTaskForExtension(task);
                                }}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </div>
                            )}

                            {/* Ellipsis / Details Trigger */}
                            <div
                              className="hover:text-slate-700 transition cursor-pointer font-bold text-xs tracking-widest leading-none px-0.5"
                              title="View task details"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTaskForDetail(task);
                              }}
                            >
                              •••
                            </div>
                          </div>

                          {/* Right action icon: Tag / Priority */}
                          <div className="flex items-center">
                            <div
                              className="hover:text-slate-700 transition cursor-pointer"
                              title={`Priority: ${task.priority || "Medium"}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTaskForDetail(task);
                              }}
                            >
                              <svg
                                className={`w-3.5 h-3.5 ${
                                  task.priority === "URGENT"
                                    ? "text-rose-500"
                                    : task.priority === "HIGH"
                                    ? "text-orange-500"
                                    : task.priority === "LOW"
                                    ? "text-slate-400"
                                    : "text-amber-500"
                                }`}
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                                <line x1="7" y1="7" x2="7.01" y2="7" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Story / Task / Bug Modal */}
      <CreateStoryTaskModal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setFormError("");
        }}
        project={project}
        tasks={tasks}
        sprints={sprints}
        epics={epics}
        allEmployees={allEmployees}
        defaultSprintId={sprintFilter === "active" ? (activeSprint?.id || "") : (sprintFilter !== "all" && sprintFilter !== "backlog" ? sprintFilter : (activeSprint?.id || ""))}
        initialIssueType="TASK"
        onCreateTask={handleCreateTask}
      />

      {/* Detailed Description & Task Properties Modal */}
      <TaskDetailModal
        task={
          selectedTaskForDetail
            ? tasks.find((t) => t.id === selectedTaskForDetail.id) || selectedTaskForDetail
            : null
        }
        project={project}
        tasks={tasks}
        sprints={sprints}
        epics={epics}
        departmentEmployees={departmentEmployees}
        teamLeads={teamLeads}
        employeeProfile={employeeProfile}
        currentUserId={currentUserId}
        isOpen={Boolean(selectedTaskForDetail)}
        onClose={() => setSelectedTaskForDetail(null)}
        onTaskUpdated={() => {
          if (onTasksUpdated) onTasksUpdated();
        }}
      />

      {/* Dedicated Team Lead Suggestion / Feedback Popup Modal */}
      {selectedTaskForSuggestion && (
        <TaskSuggestionModal
          isOpen={Boolean(selectedTaskForSuggestion)}
          onClose={() => setSelectedTaskForSuggestion(null)}
          task={
            tasks.find((t) => t.id === selectedTaskForSuggestion.id) ||
            selectedTaskForSuggestion
          }
          project={project}
          teamLeads={teamLeads}
          employeeProfile={employeeProfile}
          currentUserId={currentUserId}
          onTaskUpdated={() => {
            if (onTasksUpdated) onTasksUpdated();
          }}
          onOpenFullDetail={(t) => setSelectedTaskForDetail(t)}
        />
      )}

      {/* Drag & Move Progress Status Update Popup Modal */}
      {pendingProgressUpdate && (
        <TaskProgressUpdateModal
          isOpen={Boolean(pendingProgressUpdate)}
          onClose={() => setPendingProgressUpdate(null)}
          task={pendingProgressUpdate.task}
          targetStatus={pendingProgressUpdate.targetStatus}
          project={project}
          sprints={sprints}
          employeeProfile={employeeProfile}
          onConfirm={handleConfirmProgressUpdate}
          isSubmitting={isSubmittingProgress}
        />
      )}

      {/* Task Extension Request Modal */}
      {selectedTaskForExtension && (
        <TaskExtensionModal
          isOpen={Boolean(selectedTaskForExtension)}
          onClose={() => setSelectedTaskForExtension(null)}
          task={selectedTaskForExtension}
          project={project}
          sprint={selectedTaskForExtension?.sprint || sprints.find((s) => s.id === selectedTaskForExtension?.sprint_id)}
          sprints={sprints}
          employeeProfile={employeeProfile}
          onRequestSubmitted={() => {
            if (onTasksUpdated) onTasksUpdated();
            showNotificationToast("Extension request submitted to Team Lead for review.", "success");
          }}
        />
      )}

      {/* Task Extension Review Modal for Team Leads */}
      {selectedTaskForExtensionReview && (
        <TaskExtensionReviewModal
          isOpen={Boolean(selectedTaskForExtensionReview)}
          onClose={() => setSelectedTaskForExtensionReview(null)}
          task={selectedTaskForExtensionReview}
          project={project}
          sprint={selectedTaskForExtensionReview?.sprint || sprints.find((s) => s.id === selectedTaskForExtensionReview?.sprint_id)}
          sprints={sprints}
          onDecisionMade={(decision, updatedTask) => {
            if (onTasksUpdated) onTasksUpdated();
            showNotificationToast(
              decision === "APPROVE"
                ? "Deadline extension approved."
                : "Deadline extension request rejected.",
              decision === "APPROVE" ? "success" : "info"
            );
          }}
        />
      )}


      {/* Top Center Badge Notification Card */}
      {toastMsg && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[300] pointer-events-auto animate-scaleIn">
          <div className="relative pt-2.5">
            {/* Top Left Pill Badge */}
            <div className="absolute top-0 left-4 z-10">
              <span
                className={`px-3 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider text-white shadow-xs ${
                  toastMsg.type === "warning"
                    ? "bg-amber-500"
                    : toastMsg.type === "error"
                    ? "bg-rose-500"
                    : toastMsg.type === "info"
                    ? "bg-sky-500"
                    : "bg-emerald-500"
                }`}
              >
                {toastMsg.type === "warning"
                  ? "WARNING"
                  : toastMsg.type === "error"
                  ? "ERROR"
                  : toastMsg.type === "info"
                  ? "INFO"
                  : "SUCCESS"}
              </span>
            </div>

            {/* Main Toast Box */}
            <div
              className={`bg-white rounded-2xl border-2 px-4 py-3 shadow-xl flex items-center gap-3 min-w-[280px] sm:min-w-[320px] max-w-md ${
                toastMsg.type === "warning"
                  ? "border-amber-500 shadow-amber-500/10"
                  : toastMsg.type === "error"
                  ? "border-rose-500 shadow-rose-500/10"
                  : toastMsg.type === "info"
                  ? "border-sky-500 shadow-sky-500/10"
                  : "border-emerald-500 shadow-emerald-500/10"
              }`}
            >
              {/* Circular Icon */}
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-black shrink-0 ${
                  toastMsg.type === "warning"
                    ? "border-amber-500 text-amber-500"
                    : toastMsg.type === "error"
                    ? "border-rose-500 text-rose-500"
                    : toastMsg.type === "info"
                    ? "border-sky-500 text-sky-500"
                    : "border-emerald-500 text-emerald-500"
                }`}
              >
                {toastMsg.type === "warning"
                  ? "!"
                  : toastMsg.type === "error"
                  ? "✕"
                  : toastMsg.type === "info"
                  ? "ℹ"
                  : "✓"}
              </div>

              {/* Message */}
              <span className="flex-1 text-sm font-bold text-slate-900 tracking-tight leading-snug">
                {toastMsg.message}
              </span>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setToastMsg(null)}
                className="text-slate-400 hover:text-slate-700 shrink-0 text-xs font-bold cursor-pointer p-1 rounded-full hover:bg-slate-100 transition"
                title="Close"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
