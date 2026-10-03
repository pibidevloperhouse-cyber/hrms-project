/* eslint-disable react-hooks/purity */
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import TaskDetailModal from "./TaskDetailModal";
import TaskProgressUpdateModal from "./TaskProgressUpdateModal";
import CreateStoryTaskModal from "./CreateStoryTaskModal";
import TaskSuggestionModal from "./TaskSuggestionModal";
import TaskExtensionModal from "./TaskExtensionModal";
import TaskExtensionReviewModal from "./TaskExtensionReviewModal";
import { authFetch } from "@/lib/api/authFetch";
import {
  checkTaskSprintOverdue,
  getTaskPermissionRole,
  normalizeTaskStatus,
  canUserDragBoardTask,
} from "@/lib/projectUtils";
import { useBoardFilters } from "@/hooks/useBoardFilters";
import { useBoardDragAndDrop } from "@/hooks/useBoardDragAndDrop";
import { useTaskMutations } from "@/hooks/useTaskMutations";
import ToastNotification from "../common/ToastNotification";

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
  // 1. Toast Notification State
  const [toastMsg, setToastMsg] = useState(null);

  const showNotificationToast = useCallback((message, type = "info") => {
    setToastMsg({ message, type });
  }, []);

  // 2. Custom Filter Hook
  const {
    isKanban,
    allEmployees,
    activeSprints,
    activeSprint,
    sprintFilter,
    setSprintFilter,
    assigneeFilter,
    setAssigneeFilter,
    priorityFilter,
    setPriorityFilter,
    filteredTasks,
    tasksByColumn,
  } = useBoardFilters({
    project,
    tasks,
    sprints,
    epics,
    departmentEmployees,
    teamLeads,
    employeeProfile,
  });

  // 3. User Permission Roles
  const cleanRole = (employeeProfile?.role || "").toLowerCase().replace(/[\s_-]+/g, "");
  const isOwnerOrAdmin = cleanRole.includes("admin") || cleanRole.includes("owner") || cleanRole.includes("hr");
  const isProjectOwnerOrCreator = project?.owner_id === employeeProfile?.id || project?.created_by === employeeProfile?.id;
  const isAssignedLead = project?.team_lead_id === employeeProfile?.id;
  const isManagerRole = cleanRole.includes("manager") || cleanRole.includes("lead");
  const isLeadOrManagerOrAdmin = isOwnerOrAdmin || isProjectOwnerOrCreator || isAssignedLead || isManagerRole;

  const userRoleCategory = useMemo(() => {
    return getTaskPermissionRole(employeeProfile?.role, employeeProfile, project);
  }, [employeeProfile, project]);

  // Check if task is assigned to current user
  const isTaskAssignedToCurrentUser = useCallback(
    (task) => {
      if (!task) return false;
      const effectiveUserId = currentUserId || employeeProfile?.id;
      const authId = employeeProfile?.auth_user_id || employeeProfile?.user_id;
      const userEmail = employeeProfile?.email?.toLowerCase()?.trim();

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
    },
    [currentUserId, employeeProfile]
  );

  // Sprint Readiness Check
  const getTaskSprintState = useCallback(
    (task) => {
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
    },
    [isKanban, sprints]
  );

  // 4. Custom Task Mutation Hook
  const {
    updatingTaskId,
    updateTaskStatus,
    submitDeliverableForReview,
  } = useTaskMutations({
    project,
    tasks,
    setTasks,
    setTaskLock,
    clearTaskLock,
    onTasksUpdated,
    showNotificationToast,
    employeeProfile,
    userRoleCategory,
  });

  // Modal States
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState(null);
  const [selectedTaskForSuggestion, setSelectedTaskForSuggestion] = useState(null);
  const [selectedTaskForExtension, setSelectedTaskForExtension] = useState(null);
  const [selectedTaskForExtensionReview, setSelectedTaskForExtensionReview] = useState(null);
  const [pendingProgressUpdate, setPendingProgressUpdate] = useState(null);
  const [isSubmittingProgress, setIsSubmittingProgress] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [, setFormError] = useState("");

  // 5. Custom Drag and Drop Hook
  const {
    draggedTaskId,
    dragOverColId,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useBoardDragAndDrop({
    tasks,
    sprints,
    isKanban,
    userRoleCategory,
    employeeProfile,
    currentUserId,
    isLeadOrManagerOrAdmin,
    isTaskAssignedToCurrentUser,
    getTaskSprintState,
    onDirectStatusUpdate: (taskId, newStatus) => updateTaskStatus(taskId, newStatus),
    onOpenReviewModal: (task) => setPendingProgressUpdate({ task, targetStatus: "REVIEW" }),
    showNotificationToast,
  });

  // WIP Limit calculation per assignee for In Progress column
  const inProgressByAssignee = useMemo(() => {
    const map = new Map();
    const progressTasks = tasksByColumn.IN_PROGRESS || [];
    progressTasks.forEach((t) => {
      const assigneeKey =
        t.assigned_to ||
        t.assignee_id ||
        t.planned_assignee_id ||
        t.assignee?.id ||
        "unassigned";
      const currentList = map.get(assigneeKey) || [];
      currentList.push(t);
      map.set(assigneeKey, currentList);
    });
    return map;
  }, [tasksByColumn.IN_PROGRESS]);

  // Identify any developer that has exceeded the max 2 WIP limit
  const assigneesOverWipLimit = useMemo(() => {
    const list = [];
    inProgressByAssignee.forEach((devTasks, devId) => {
      if (devTasks.length > 2) {
        const devName =
          devTasks[0]?.assignee?.full_name ||
          devTasks[0]?.planned_assignee?.full_name ||
          allEmployees.find((e) => e.id === devId)?.full_name ||
          (devId === "unassigned" ? "Unassigned Tasks" : "Developer");
        list.push({ devId, devName, count: devTasks.length });
      }
    });
    return list;
  }, [inProgressByAssignee, allEmployees]);

  // Check if currently dragged task's assignee already has >= 2 in-progress tasks
  const isDraggedTaskAssigneeWipBlocked = useMemo(() => {
    if (!draggedTaskId) return false;
    const task = tasks.find((t) => t.id === draggedTaskId);
    if (!task || normalizeTaskStatus(task.status) === "IN_PROGRESS") return false;
    const assignee =
      task.assignee ||
      task.assigned_to ||
      task.assignee_id ||
      task.planned_assignee_id ||
      employeeProfile;
    const wipCheck = checkEmployeeWipLimit(assignee, tasks, draggedTaskId, 2);
    return !wipCheck.allowed;
  }, [draggedTaskId, tasks, employeeProfile]);

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

  const hasActiveTlSuggestions = (task) => {
    if (!task) return false;
    const currentNorm = normalizeTaskStatus(task.status);
    if (currentNorm !== "TODO" && currentNorm !== "IN_PROGRESS") return false;
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

  // Confirm progress status update from popup modal
  const handleConfirmProgressUpdate = async ({
    taskId,
    newStatus,
    progress,
    comments,
    review_comments,
    review_attachments,
    review_submitted_at,
  }) => {
    setIsSubmittingProgress(true);
    const success = await submitDeliverableForReview({
      taskId,
      comments: comments || review_comments || "",
      review_attachments: review_attachments || [],
      progress: progress || 85,
    });
    setIsSubmittingProgress(false);
    if (success) {
      setPendingProgressUpdate(null);
    }
  };

  // Create Story / Task / Bug
  const handleCreateTask = async (taskPayload) => {
    setIsCreating(true);
    setFormError("");

    try {
      const res = await authFetch(`/api/projects/${project.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  const handleStartSprint = async (sprintId) => {
    try {
      const res = await authFetch(`/api/projects/${project.id}/sprints`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sprint_id: sprintId,
          status: "ACTIVE",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotificationToast(data.message || "Sprint started successfully! Deliverables are now live.", "success");
        if (onTasksUpdated) onTasksUpdated();
      } else {
        showNotificationToast(data.message || "Failed to start sprint.", "error");
      }
    } catch (err) {
      console.error("Start sprint error:", err);
      showNotificationToast("Network error starting sprint.", "error");
    }
  };

  return (
    <div className="space-y-4 text-xs text-slate-800 dark:text-slate-200">
      {/* Board Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Sprint Filter */}
          {!isKanban && (
            <select
              value={sprintFilter}
              onChange={(e) => setSprintFilter(e.target.value)}
              className="h-8.5 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold focus:outline-hidden focus:border-blue-600 cursor-pointer shadow-2xs"
            >
              <option value="active">
                ⚡ Active Sprints {activeSprints.length > 0 ? `(${activeSprints.map((s) => s.name).join(", ")})` : "(None Running)"}
              </option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.status})
                </option>
              ))}
              <option value="backlog">Backlog (Unscheduled)</option>
              <option value="all">All Sprints &amp; Tasks</option>
            </select>
          )}

          {/* Assignee Filter */}
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="h-8.5 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium focus:outline-hidden focus:border-blue-600 cursor-pointer shadow-2xs"
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
            className="h-8.5 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium focus:outline-hidden focus:border-blue-600 cursor-pointer shadow-2xs"
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
          className="h-8.5 px-3.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-xs shadow-sky-600/20 text-xs"
        >
          <span>+</span>
          <span>Add Task</span>
        </button>
      </div>

      {/* No Active Sprint Notice for Scrum */}
      {!isKanban && sprintFilter === "active" && activeSprints.length === 0 && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 flex flex-wrap items-center justify-between gap-3 text-xs animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <span className="text-base">ℹ️</span>
            <div>
              <p className="font-bold">No Active Sprint Running</p>
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                {sprints.length > 0
                  ? `You have ${sprints.length} planned sprint(s). Start a sprint to focus deliverables on this cycle.`
                  : "The Scrum board displays tasks for the active sprint. Create and start a sprint in the Sprints tab."}
              </p>
            </div>
          </div>
          {isLeadOrManagerOrAdmin && sprints.length > 0 && (
            <div className="flex items-center gap-2">
              {sprints
                .filter((s) => String(s.status || "").toUpperCase() === "PLANNED" || !s.status)
                .slice(0, 2)
                .map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleStartSprint(s.id)}
                    className="h-8 px-3 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold transition cursor-pointer shadow-2xs text-xs flex items-center gap-1.5"
                  >
                    <span>⚡ Start {s.name}</span>
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Kanban Board Columns with HTML5 Drag and Drop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {COLUMNS.map((col) => {
          const colTasks = tasksByColumn[col.id] || [];
          const isOver = dragOverColId === col.id;
          const isCompletedCol = col.id === "COMPLETED";
          const isProgressCol = col.id === "IN_PROGRESS";
          const isRestrictedTarget = isCompletedCol && userRoleCategory === "EMPLOYEE";

          return (
            <div
              key={col.id}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={(e) => handleDragLeave(e, col.id)}
              onDrop={(e) => handleDrop(e, col.id)}
              className={`rounded-xl border p-3 space-y-3 min-h-[480px] flex flex-col transition-all duration-200 ${
                isOver
                  ? isRestrictedTarget
                    ? "bg-rose-50/70 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700 border-dashed ring-2 ring-rose-500/15 shadow-md scale-[1.01]"
                    : "bg-sky-50/80 dark:bg-sky-950/40 border-sky-400 dark:border-sky-600 border-dashed ring-2 ring-sky-500/20 shadow-md scale-[1.01]"
                  : `${col.bg} dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-800`
              }`}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                  <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">{col.label}</span>
                  {isCompletedCol && userRoleCategory === "EMPLOYEE" && (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800"
                      title="Deliverables are verified and marked Completed by Team Leads & Managers"
                    >
                      <span>🔒</span>
                      <span>Verified</span>
                    </span>
                  )}
                  {isProgressCol && userRoleCategory === "EMPLOYEE" && (
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        colTasks.length >= 2
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-700"
                          : "bg-sky-100/80 dark:bg-sky-950 text-sky-700 dark:text-sky-300 border border-sky-200/90 dark:border-sky-800"
                      }`}
                      title="Work In Progress (WIP) Limit: You can have at most 2 active tasks in progress at a time."
                    >
                      <span>⚡</span>
                      <span>WIP: {colTasks.length}/2</span>
                    </span>
                  )}
                </div>
                <span
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border ${
                    isProgressCol && userRoleCategory === "EMPLOYEE" && colTasks.length >= 2
                      ? "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-700"
                      : "text-slate-500 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  }`}
                >
                  {colTasks.length}
                </span>
              </div>

              {/* In Progress Warning Banner for Employee ONLY if > 2 */}
              {isProgressCol && userRoleCategory === "EMPLOYEE" && colTasks.length > 2 && (
                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-[11px] font-semibold flex items-center gap-2 animate-fadeIn">
                  <span className="text-amber-600 dark:text-amber-400">⚠️</span>
                  <span>
                    Limit Exceeded ({colTasks.length}/2 tasks in progress). Please complete or submit tasks for review before processing new items.
                  </span>
                </div>
              )}

              {/* Drag Over Visual Target Banner */}
              {draggedTaskId && isOver && (
                isRestrictedTarget ? (
                  <div className="py-2.5 px-3 rounded-lg border border-dashed border-rose-300 bg-rose-50 text-rose-800 text-center text-[11px] font-semibold flex items-center justify-center gap-1.5 shadow-2xs">
                    <span className="text-rose-600">🔒</span>
                    <span>Review &amp; Approval Required (Lead/Manager Only)</span>
                  </div>
                ) : isProgressCol && isDraggedTaskAssigneeWipBlocked ? (
                  <div className="py-2.5 px-3 rounded-lg border border-dashed border-amber-400 bg-amber-50 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 text-center text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-2xs animate-pulse">
                    <span className="text-amber-600">⚠️</span>
                    <span>Action Blocked: Already 2 tasks in progress!</span>
                  </div>
                ) : (
                  <div className="py-2 px-3 rounded-lg border border-dashed border-sky-400 bg-sky-100/80 text-sky-800 text-center text-[11px] font-bold animate-pulse flex items-center justify-center gap-1.5 shadow-2xs">
                    <span>↓</span>
                    <span>Drop to change to {col.label}</span>
                  </div>
                )
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
                    const currentNormStatus = normalizeTaskStatus(task.status);
                    const isDueTodayTask = isDueToday(task.due_date) && currentNormStatus !== "COMPLETED";
                    const isOverdue = isTaskOverdue(task.due_date, currentNormStatus);

                    const isBeingDragged = draggedTaskId === task.id;
                    const isAssigned = isTaskAssignedToCurrentUser(task);
                    const sprintState = getTaskSprintState(task);
                    const isCompleted = currentNormStatus === "COMPLETED";
                    const isInReview = currentNormStatus === "REVIEW";

                    const canMoveTask = canUserDragBoardTask({
                      isAssigned,
                      status: task.status,
                      sprintIsReady: sprintState.isReady,
                    });

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
                        className={`relative p-3.5 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200/90 dark:border-slate-700/80 shadow-2xs hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-150 group select-none ${
                          canMoveTask ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                        } ${isBeingDragged ? "opacity-30 scale-95 border-dashed border-sky-500" : ""} ${
                          updatingTaskId === task.id ? "opacity-50 pointer-events-none" : ""
                        }`}
                        title={
                          hasActiveTlSuggestions(task)
                            ? "Team Lead provided suggestions. Click to view instructions."
                            : isCompleted
                            ? "Deliverable approved & completed (Locked)."
                            : isInReview
                            ? isLeadOrManagerOrAdmin
                              ? "Deliverable submitted by developer. Click to inspect screenshots and approve or give suggestions."
                              : "Deliverable submitted. Awaiting supervisor review."
                            : !isAssigned
                            ? "Oversight mode: Task is managed by the assigned developer."
                            : !sprintState.isReady
                            ? "Sprint is in planned state. Status updates locked."
                            : "Drag to change status, or click to view detailed description"
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
                              <svg className="w-3.5 h-3.5 text-rose-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <circle cx="12" cy="12" r="9" />
                                <path d="M12 8v4m0 4h.01" />
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            )}
                            <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs tracking-tight truncate">
                              {taskCode}
                            </span>
                          </div>

                          {/* Assignee Avatar Initials Badge */}
                          <div
                            className="w-6 h-6 rounded bg-slate-100/90 dark:bg-slate-700 border border-slate-200/80 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-bold text-[10px] flex items-center justify-center shrink-0 shadow-2xs"
                            title={assignee?.full_name ? `Assignee: ${assignee.full_name}` : "Unassigned"}
                          >
                            {initials}
                          </div>
                        </div>

                        {/* Middle: Task Title */}
                        <h5 className="font-medium text-slate-900 dark:text-white text-[13px] leading-snug group-hover:text-sky-600 dark:group-hover:text-sky-400 transition pt-1.5 pb-0.5">
                          {task.title}
                        </h5>

                        {/* Epic / Category Pill */}
                        {linkedEpic && (
                          <div className="pt-1">
                            <span
                              className="inline-flex items-center text-[11px] font-medium text-slate-800 dark:text-slate-200 bg-slate-100/80 dark:bg-slate-700/80 px-2 py-0.5 rounded border-l-[3px] truncate max-w-full"
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
                            title="Due Today: Please prioritize work."
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
                            className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:border-sky-400 hover:text-sky-700 px-2 py-1 rounded-md shadow-2xs w-fit cursor-pointer transition active:scale-95 animate-fadeIn"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-600 animate-pulse" />
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
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
                            <span>💬 TL Review Suggestions</span>
                          </div>
                        )}

                        {/* Task Completed Status Badge */}
                        {isCompleted && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTaskForDetail(task);
                            }}
                            className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-emerald-950 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded-md shadow-2xs w-fit cursor-pointer transition active:scale-95 animate-fadeIn"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span>{userRoleCategory === "EMPLOYEE" ? "🔒 Completed (Locked)" : "✓ Completed"}</span>
                          </div>
                        )}

                        {/* Task Under Review Status Badge */}
                        {isInReview && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTaskForDetail(task);
                            }}
                            className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-purple-950 bg-purple-50 border border-purple-300 px-2 py-0.5 rounded-md shadow-2xs w-fit cursor-pointer transition active:scale-95 animate-fadeIn"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-pulse" />
                            <span>{userRoleCategory === "EMPLOYEE" ? "⏳ In Review (Awaiting Approval)" : "📋 In Review (Ready for Verification)"}</span>
                          </div>
                        )}

                        {/* Bottom Toolbar with dashed divider */}
                        <div className="border-t border-dashed border-slate-200 dark:border-slate-700 mt-2.5 pt-2 flex items-center justify-between text-slate-400">
                          {/* Left action icons */}
                          <div className="flex items-center gap-2">
                            {/* Timer / Due Date */}
                            <div
                              className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition cursor-pointer text-[11px] font-medium ${
                                isDueTodayTask
                                  ? "text-amber-900 bg-amber-50 border border-amber-300/80 font-bold font-mono"
                                  : isOverdue
                                  ? "text-rose-700 bg-rose-50 border border-rose-300/80 font-bold font-mono"
                                  : "hover:text-slate-700 dark:hover:text-slate-200"
                              }`}
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

                            {/* Story Points */}
                            <div
                              className="flex items-center gap-0.5 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
                              title={`Story Points: ${task.story_points || 1} pts`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTaskForDetail(task);
                              }}
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <ellipse cx="12" cy="5" rx="9" ry="3" />
                                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                              </svg>
                              {task.story_points ? (
                                <span className="text-[10px] font-mono font-semibold text-slate-600 dark:text-slate-300">
                                  {task.story_points}
                                </span>
                              ) : null}
                            </div>

                            {/* Comments / Feedback icon */}
                            <div
                              className={`relative hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer ${
                                hasActiveTlSuggestions(task) ? "text-amber-600" : ""
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (hasActiveTlSuggestions(task)) {
                                  setSelectedTaskForSuggestion(task);
                                } else {
                                  setSelectedTaskForDetail(task);
                                }
                              }}
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                              </svg>
                              {hasActiveTlSuggestions(task) && (
                                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500 animate-pulse ring-1 ring-white" />
                              )}
                            </div>

                            {/* Request Extension Trigger */}
                            {isTaskAssignedToCurrentUser(task) && task.status !== "COMPLETED" && (
                              <div
                                className={`hover:text-sky-600 transition cursor-pointer text-[11px] flex items-center gap-0.5 ${
                                  task.extension_status === "PENDING" ? "text-amber-600" : ""
                                }`}
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

                            {/* Details Trigger */}
                            <div
                              className="hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer font-bold text-xs tracking-widest leading-none px-0.5"
                              title="View task details"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTaskForDetail(task);
                              }}
                            >
                              •••
                            </div>
                          </div>

                          {/* Right action icon: Priority Tag */}
                          <div className="flex items-center">
                            <div
                              className="hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
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

      {/* Granular Task Detail Modal */}
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

      {/* Suggestion / Feedback Popup Modal */}
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

      {/* Progress & Review Modal */}
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

      {/* Task Extension Review Modal */}
      {selectedTaskForExtensionReview && (
        <TaskExtensionReviewModal
          isOpen={Boolean(selectedTaskForExtensionReview)}
          onClose={() => setSelectedTaskForExtensionReview(null)}
          task={selectedTaskForExtensionReview}
          project={project}
          sprint={selectedTaskForExtensionReview?.sprint || sprints.find((s) => s.id === selectedTaskForExtensionReview?.sprint_id)}
          sprints={sprints}
          onDecisionMade={(decision) => {
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

      {/* Realistic SaaS Toast Notification with live countdown seconds */}
      <ToastNotification
        toast={toastMsg}
        onClose={() => setToastMsg(null)}
        duration={5500}
      />
    </div>
  );
}
