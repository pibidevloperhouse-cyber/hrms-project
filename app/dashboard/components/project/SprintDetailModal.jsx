"use client";

import React, { useState, useMemo, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  checkTaskSprintOverdue,
  validateTaskSprintBounds,
  getEmployeeSprintWorkload,
} from "@/lib/projectUtils";

const STATUS_CONFIG = {
  TODO: { label: "To Do", bg: "bg-slate-100 text-slate-700 border-slate-200", dot: "bg-slate-400" },
  IN_PROGRESS: { label: "In Progress", bg: "bg-sky-50 text-sky-700 border-sky-200", dot: "bg-sky-500" },
  REVIEW: { label: "In Review", bg: "bg-purple-50 text-purple-700 border-purple-200", dot: "bg-purple-500" },
  COMPLETED: { label: "Completed", bg: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
};

const PRIORITY_BADGES = {
  LOW: { label: "Low", bg: "bg-slate-100 text-slate-700 border-slate-200" },
  MEDIUM: { label: "Medium", bg: "bg-amber-50 text-amber-700 border-amber-200" },
  HIGH: { label: "High", bg: "bg-orange-50 text-orange-700 border-orange-200" },
  URGENT: { label: "Urgent", bg: "bg-rose-50 text-rose-700 border-rose-200" },
};

export default function SprintDetailModal({
  sprint,
  project,
  tasks = [],
  epics = [],
  departmentEmployees = [],
  teamLeads = [],
  employeeProfile,
  currentUserId,
  isOpen,
  onClose,
  onSprintStatusChange,
  onTasksUpdated,
  onSelectTask,
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickAssignee, setQuickAssignee] = useState("");
  const [quickPriority, setQuickPriority] = useState("MEDIUM");
  const [quickPoints, setQuickPoints] = useState(1);
  const [quickEpic, setQuickEpic] = useState("");
  const [quickDueDate, setQuickDueDate] = useState(sprint?.end_date ? sprint.end_date.split("T")[0] : "");
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  const showNotificationToast = (message, type = "info") => {
    setToastMsg({ message, type });
    setTimeout(() => setToastMsg(null), 5000);
  };

  // Scope assignable employees strictly to project team
  const allEmployees = useMemo(() => {
    const map = new Map();
    if (project?.teamLead?.id) map.set(project.teamLead.id, project.teamLead);
    if (project?.creator?.id) map.set(project.creator.id, project.creator);
    (project?.teamMembers || []).forEach((m) => {
      if (m?.id) map.set(m.id, m);
    });
    if (map.size === 0) {
      (departmentEmployees || []).forEach((e) => {
        if (e?.id) map.set(e.id, e);
      });
      (teamLeads || []).forEach((l) => {
        if (l?.id) map.set(l.id, l);
      });
    }
    return Array.from(map.values()).sort((a, b) =>
      (a.full_name || "").localeCompare(b.full_name || "")
    );
  }, [project, departmentEmployees, teamLeads]);

  // Helper: Verify if task is assigned to the current employee
  const isTaskAssignedToCurrentUser = (task) => {
    if (!task) return false;
    const effectiveUserId = currentUserId || employeeProfile?.id;
    const authId = employeeProfile?.auth_user_id || employeeProfile?.user_id;
    const userEmail = employeeProfile?.email?.toLowerCase();

    if (effectiveUserId) {
      if (
        task.assigned_to === effectiveUserId ||
        task.assignee_id === effectiveUserId ||
        task.planned_assignee_id === effectiveUserId ||
        task.assignee?.id === effectiveUserId
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
        task.assignee?.id === authId
      ) {
        return true;
      }
    }

    if (userEmail && task.assignee?.email) {
      if (task.assignee.email.toLowerCase() === userEmail) {
        return true;
      }
    }

    return false;
  };

  // Quick Status change directly for assigned employee
  const handleQuickStatusChange = async (taskId, newStatus) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    if (!isTaskAssignedToCurrentUser(task)) {
      showNotificationToast(
        "Only the assigned employee can update the task status. Managers can view progress only.",
        "warning"
      );
      return;
    }

    let nextProgress = Number(task.progress) || 0;
    if (newStatus === "COMPLETED") {
      nextProgress = 100;
    } else if (newStatus === "TODO") {
      nextProgress = 0;
    } else if (newStatus === "REVIEW") {
      nextProgress = Math.max(85, nextProgress);
    } else if (newStatus === "IN_PROGRESS") {
      nextProgress = nextProgress > 0 && nextProgress < 100 ? nextProgress : 50;
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
          status: newStatus,
          progress: nextProgress,
        }),
      });

      if (res.ok) {
        showNotificationToast(
          newStatus === "COMPLETED"
            ? "🎉 Task completed (100%)!"
            : `✓ Status updated to ${newStatus} (${nextProgress}% progress)`,
          "success"
        );
        if (onTasksUpdated) onTasksUpdated();
      } else {
        const data = await res.json();
        throw new Error(data.message || "Failed to update task status.");
      }
    } catch (err) {
      console.error("Failed to update status in sprint modal:", err);
      showNotificationToast(err.message || "Failed to update status.", "error");
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const sprintMinDate = useMemo(() => {
    return sprint?.start_date ? sprint.start_date.split("T")[0] : "";
  }, [sprint]);

  const sprintMaxDate = useMemo(() => {
    return sprint?.end_date ? sprint.end_date.split("T")[0] : "";
  }, [sprint]);

  const quickDateValidation = useMemo(() => {
    return validateTaskSprintBounds(quickDueDate, sprint);
  }, [quickDueDate, sprint]);

  const quickOverdueWarning = useMemo(() => {
    return checkTaskSprintOverdue(quickDueDate, sprint);
  }, [quickDueDate, sprint]);

  // Keyboard shortcut Esc to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);



  // Filter tasks specifically belonging to this sprint
  const sprintTasks = useMemo(() => {
    if (!sprint?.id) return [];
    return tasks.filter((t) => t.sprint_id === sprint.id);
  }, [tasks, sprint]);

  // Metric computations
  const metrics = useMemo(() => {
    const total = sprintTasks.length;
    const completed = sprintTasks.filter((t) => t.status === "COMPLETED").length;
    const inProgress = sprintTasks.filter((t) => t.status === "IN_PROGRESS").length;
    const review = sprintTasks.filter((t) => t.status === "REVIEW").length;
    const todo = sprintTasks.filter((t) => !t.status || t.status === "TODO").length;

    const totalPoints = sprintTasks.reduce((acc, t) => acc + (Number(t.story_points) || 1), 0);
    const completedPoints = sprintTasks
      .filter((t) => t.status === "COMPLETED")
      .reduce((acc, t) => acc + (Number(t.story_points) || 1), 0);

    const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      completed,
      inProgress,
      review,
      todo,
      totalPoints,
      completedPoints,
      progressPct,
    };
  }, [sprintTasks]);

  // Filtered tasks based on search and filters
  const filteredSprintTasks = useMemo(() => {
    return sprintTasks.filter((t) => {
      const matchSearch =
        !search.trim() ||
        t.title?.toLowerCase().includes(search.toLowerCase().trim()) ||
        t.assignee?.full_name?.toLowerCase().includes(search.toLowerCase().trim());
      const matchStatus = statusFilter === "all" || t.status === statusFilter;
      const matchPriority = priorityFilter === "all" || t.priority === priorityFilter;
      return matchSearch && matchStatus && matchPriority;
    });
  }, [sprintTasks, search, statusFilter, priorityFilter]);

  if (!isOpen || !sprint) return null;

  // Handle Remove Task from Sprint (Moves back to Backlog)
  const handleRemoveFromSprint = async (taskId) => {
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
        body: JSON.stringify({ sprint_id: null }),
      });

      if (res.ok && onTasksUpdated) {
        onTasksUpdated();
      }
    } catch (err) {
      console.error("Remove task from sprint error:", err);
    }
  };

  // Handle Quick Add Task directly into this Sprint
  const handleCreateTaskInSprint = async (e) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;

    if (!quickDateValidation.isValid) {
      showNotificationToast(quickDateValidation.error || "Due date must be within sprint week timeline.", "error");
      return;
    }

    setIsSubmittingTask(true);
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
        body: JSON.stringify({
          title: quickTitle.trim(),
          sprint_id: sprint.id,
          assigned_to: quickAssignee || null,
          priority: quickPriority,
          story_points: quickPoints,
          epic_id: quickEpic || null,
          due_date: quickDueDate || null,
          status: "TODO",
        }),
      });

      if (res.ok) {
        setQuickTitle("");
        setQuickAssignee("");
        setQuickPoints(1);
        setQuickEpic("");
        setQuickDueDate(sprint?.end_date ? sprint.end_date.split("T")[0] : "");
        setIsAddingTask(false);
        if (quickOverdueWarning) {
          showNotificationToast(`⚠️ Task created with schedule notice: ${quickOverdueWarning.shortMessage}`, "warning");
        } else {
          showNotificationToast("Task added to sprint successfully.", "success");
        }
        if (onTasksUpdated) onTasksUpdated();
      }
    } catch (err) {
      console.error("Add task to sprint error:", err);
    } finally {
      setIsSubmittingTask(false);
    }
  };

  const isActive = sprint.status === "ACTIVE";
  const isPlanned = sprint.status === "PLANNED";
  const isCompleted = sprint.status === "COMPLETED";

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-fadeIn text-slate-800"
    >
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col m-auto my-auto animate-scaleIn text-xs">
        {/* Top Header Bar */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-start justify-between gap-3 shrink-0">
          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border font-mono ${
                  isActive
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300 animate-pulse"
                    : isPlanned
                    ? "bg-blue-100 text-blue-800 border-blue-300"
                    : "bg-slate-200 text-slate-700 border-slate-300"
                }`}
              >
                {isActive ? "⚡ Active Sprint" : isPlanned ? "📋 Planned Sprint" : "✓ Completed Sprint"}
              </span>

              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight truncate">
                {sprint.name}
              </h2>
            </div>

            {sprint.goal && (
              <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
                {sprint.goal}
              </p>
            )}

            <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
              <span>📅 {sprint.start_date || "No start"} → {sprint.end_date || "Ongoing"}</span>
              {project?.name && <span>• Project: {project.name}</span>}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isPlanned && onSprintStatusChange && (
              <button
                type="button"
                onClick={() => onSprintStatusChange(sprint.id, "ACTIVE")}
                className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-2xs text-xs"
              >
                <span>⚡</span>
                <span>Start Sprint</span>
              </button>
            )}

            {isActive && onSprintStatusChange && (
              <button
                type="button"
                onClick={() => onSprintStatusChange(sprint.id, "COMPLETED")}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-2xs text-xs"
              >
                <span>✓</span>
                <span>Complete Sprint</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer transition text-base font-semibold"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Metrics & Progress Section */}
        <div className="px-6 py-3.5 bg-white border-b border-slate-200/80 space-y-2.5 shrink-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-slate-700">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Tasks</span>
              <span className="text-base font-bold text-slate-900 font-mono">{metrics.total}</span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Story Points</span>
              <span className="text-base font-bold text-slate-900 font-mono">
                {metrics.completedPoints} / {metrics.totalPoints}{" "}
                <span className="text-[11px] font-normal text-slate-500">burned</span>
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Completed</span>
              <span className="text-base font-bold text-emerald-700 font-mono">
                {metrics.completed} / {metrics.total}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Progress</span>
              <span className="text-base font-bold text-blue-700 font-mono">{metrics.progressPct}%</span>
            </div>
          </div>

          {/* Multi-color Segmented Progress Bar */}
          <div className="space-y-1">
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex">
              <div
                style={{ width: metrics.total > 0 ? `${(metrics.completed / metrics.total) * 100}%` : "0%" }}
                className="bg-emerald-500 transition-all duration-300"
                title={`Completed: ${metrics.completed}`}
              />
              <div
                style={{ width: metrics.total > 0 ? `${(metrics.inProgress / metrics.total) * 100}%` : "0%" }}
                className="bg-sky-500 transition-all duration-300"
                title={`In Progress: ${metrics.inProgress}`}
              />
              <div
                style={{ width: metrics.total > 0 ? `${(metrics.review / metrics.total) * 100}%` : "0%" }}
                className="bg-purple-500 transition-all duration-300"
                title={`In Review: ${metrics.review}`}
              />
              <div
                style={{ width: metrics.total > 0 ? `${(metrics.todo / metrics.total) * 100}%` : "0%" }}
                className="bg-slate-300 transition-all duration-300"
                title={`To Do: ${metrics.todo}`}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" /> To Do ({metrics.todo})
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-sky-500 inline-block" /> In Progress ({metrics.inProgress})
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" /> Review ({metrics.review})
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Completed ({metrics.completed})
                </span>
              </div>
              <span>{metrics.progressPct}% Complete</span>
            </div>
          </div>
        </div>

        {/* Filter & Action Toolbar */}
        <div className="px-6 py-3 bg-slate-50/50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search sprint tasks…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 px-3 rounded-lg border border-slate-300 bg-white text-xs focus:outline-none focus:border-blue-600 w-full max-w-xs"
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs focus:outline-none focus:border-blue-600 font-medium"
            >
              <option value="all">All Statuses ({metrics.total})</option>
              <option value="TODO">To Do ({metrics.todo})</option>
              <option value="IN_PROGRESS">In Progress ({metrics.inProgress})</option>
              <option value="REVIEW">Review ({metrics.review})</option>
              <option value="COMPLETED">Completed ({metrics.completed})</option>
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs focus:outline-none focus:border-blue-600 font-medium hidden sm:inline-block"
            >
              <option value="all">All Priorities</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>

          {!isCompleted && (
            <button
              type="button"
              onClick={() => setIsAddingTask(!isAddingTask)}
              className="h-8 px-3 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <span>+</span>
              <span>Add Task to Sprint</span>
            </button>
          )}
        </div>

        {/* Quick Add Task directly into this Sprint (Expandable) */}
        {isAddingTask && (
          <form
            onSubmit={handleCreateTaskInSprint}
            className="p-4 bg-blue-50/50 border-b border-blue-200 space-y-3 shrink-0 animate-fadeIn"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-blue-900 text-xs uppercase tracking-wider">
                Add New Task to {sprint.name}
              </h4>
              <button
                type="button"
                onClick={() => setIsAddingTask(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
              <div className="sm:col-span-2">
                <label className="text-[10px] font-semibold text-slate-600 block mb-1">Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Build authentication endpoints"
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  className="w-full h-8 px-3 rounded-lg border border-slate-300 bg-white text-xs focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="text-[10px] font-semibold text-slate-600 block mb-1">Assignee</label>
                <select
                  value={quickAssignee}
                  onChange={(e) => setQuickAssignee(e.target.value)}
                  className="w-full h-8 px-2 rounded-lg border border-slate-300 bg-white text-xs focus:outline-none focus:border-blue-600"
                >
                  <option value="">Unassigned</option>
                  {allEmployees.map((emp, idx) => {
                    const empId = emp.id || `emp-${idx}`;
                    const load = getEmployeeSprintWorkload(empId, sprint?.id, tasks);
                    return (
                      <option key={`sprint-emp-opt-${empId}-${idx}`} value={empId}>
                        {emp.full_name || "Employee"} ({load.count} sprint tasks)
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-slate-600 block mb-1">Priority</label>
                <select
                  value={quickPriority}
                  onChange={(e) => setQuickPriority(e.target.value)}
                  className="w-full h-8 px-2 rounded-lg border border-slate-300 bg-white text-xs focus:outline-none focus:border-blue-600 font-medium"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-slate-600 block mb-1">Story Points</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={quickPoints}
                  onChange={(e) => setQuickPoints(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full h-8 px-3 rounded-lg border border-slate-300 bg-white text-xs focus:outline-none focus:border-blue-600 font-mono"
                />
              </div>

              <div className="sm:col-span-1">
                <label className="text-[10px] font-semibold text-slate-600 block mb-1">Epic Link</label>
                <select
                  value={quickEpic}
                  onChange={(e) => setQuickEpic(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs focus:outline-none focus:border-blue-600"
                >
                  <option value="">None</option>
                  {epics.map((epic, idx) => (
                    <option key={`sprint-epic-opt-${epic.id || idx}-${idx}`} value={epic.id}>
                      {epic.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-1">
                <label className="text-[10px] font-semibold text-slate-600 block mb-1">
                  Due Date <span className="text-blue-600 font-normal font-mono text-[9px]">(Sprint Week)</span>
                </label>
                <input
                  type="date"
                  min={sprintMinDate || undefined}
                  max={sprintMaxDate || undefined}
                  value={quickDueDate}
                  onChange={(e) => setQuickDueDate(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white font-mono text-xs focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="sm:col-span-2 flex items-end">
                <button
                  type="submit"
                  disabled={isSubmittingTask || !quickTitle.trim() || !quickDateValidation.isValid}
                  className="w-full h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition cursor-pointer disabled:opacity-50 text-xs shadow-2xs"
                >
                  {isSubmittingTask ? "Adding…" : "Add to Sprint"}
                </button>
              </div>

              {!quickDateValidation.isValid && (
                <div className="sm:col-span-4 p-2 rounded-lg bg-rose-50 border border-rose-300 text-rose-800 text-xs flex items-center gap-1.5 animate-fadeIn">
                  <span>❌</span>
                  <span>{quickDateValidation.error}</span>
                </div>
              )}
            </div>
          </form>
        )}

        {/* Sprint Task List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <span className="font-bold text-slate-900 uppercase tracking-wider text-[10px]">
              Tasks in this Sprint ({filteredSprintTasks.length})
            </span>
            <span className="text-[10px] text-slate-400">
              Click any task row to view or edit full details
            </span>
          </div>

          {filteredSprintTasks.length === 0 ? (
            <div className="py-12 text-center text-slate-400 italic">
              {sprintTasks.length === 0
                ? "No tasks have been added to this sprint yet. Click '+ Add Task to Sprint' above or move tasks from the Backlog tab."
                : "No tasks match your active filter."}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
              {filteredSprintTasks.map((task) => {
                const linkedEpic = epics.find((e) => e.id === task.epic_id);
                const assignee =
                  task.assignee ||
                  task.planned_assignee ||
                  allEmployees.find((e) => e.id === (task.assigned_to || task.planned_assignee_id || task.assignee_id));
                const statusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.TODO;
                const priorityCfg = PRIORITY_BADGES[task.priority] || PRIORITY_BADGES.MEDIUM;

                return (
                  <div
                    key={task.id}
                    onClick={() => {
                      if (onSelectTask) onSelectTask(task);
                    }}
                    className="p-3 hover:bg-slate-50/80 transition flex flex-wrap items-center justify-between gap-3 cursor-pointer group"
                  >
                    {/* Left: Task identifier, title, badges */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200 font-mono shrink-0">
                        {task.task_type || "TASK"}
                      </span>

                      <span className="font-semibold text-slate-900 truncate text-xs group-hover:text-blue-600 transition">
                        {task.title}
                      </span>

                      {task.description && (
                        <span
                          title="Contains detailed description"
                          className="text-[11px] text-slate-400 shrink-0"
                        >
                          📄
                        </span>
                      )}

                      {linkedEpic && (
                        <span
                          className="px-2 py-0.5 rounded text-[9px] font-bold text-white shrink-0 max-w-[120px] truncate shadow-2xs"
                          style={{ backgroundColor: linkedEpic.color || "#3b82f6" }}
                        >
                          ⚡ {linkedEpic.name}
                        </span>
                      )}

                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 shrink-0">
                        {task.story_points || 1} pts
                      </span>
                    </div>

                    {/* Right: Assignee, Priority, Status Dropdown, Actions */}
                    <div className="flex items-center gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {/* Assignee display */}
                      {assignee ? (
                        <div className="flex items-center gap-1.5 min-w-[110px]">
                          <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 flex items-center justify-center font-bold text-[10px]">
                            {assignee.full_name ? assignee.full_name.charAt(0).toUpperCase() : "?"}
                          </div>
                          <span className="text-[11px] font-medium text-slate-700 truncate max-w-[90px]">
                            {assignee.full_name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic min-w-[110px]">
                          Unassigned
                        </span>
                      )}

                      {/* Priority pill */}
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase border ${priorityCfg.bg}`}
                      >
                        {priorityCfg.label}
                      </span>

                      {/* Quick Status selector: Only assigned employee can change status. Managers view progress only */}
                      {isTaskAssignedToCurrentUser(task) ? (
                        <select
                          value={task.status || "TODO"}
                          disabled={updatingTaskId === task.id}
                          onChange={(e) => handleQuickStatusChange(task.id, e.target.value)}
                          className={`h-6.5 px-2 rounded text-[10px] font-semibold border cursor-pointer focus:outline-none ${statusCfg.bg}`}
                          title="Change task status"
                        >
                          <option value="TODO">To Do</option>
                          <option value="IN_PROGRESS">In Progress</option>
                          <option value="REVIEW">In Review</option>
                          <option value="COMPLETED">Completed</option>
                        </select>
                      ) : (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${statusCfg.bg}`}
                          title={`Status managed by ${assignee?.full_name || "assignee"} (Manager view only)`}
                        >
                          {statusCfg.label}
                        </span>
                      )}

                      {/* Remove from sprint button */}
                      <button
                        type="button"
                        title="Move back to Backlog"
                        onClick={() => handleRemoveFromSprint(task.id)}
                        className="text-[10px] text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition cursor-pointer"
                      >
                        ↩ Backlog
                      </button>

                      <span className="text-slate-300 group-hover:text-blue-600 group-hover:translate-x-0.5 transition font-bold text-xs">
                        →
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-slate-400">
            Sprint iteration: <strong className="text-slate-700">{sprint.name}</strong> • {metrics.total} deliverables committed
          </span>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold transition cursor-pointer text-xs"
          >
            Close
          </button>
        </div>
      </div>

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
