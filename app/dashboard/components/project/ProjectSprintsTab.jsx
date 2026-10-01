"use client";

import React, { useState, useMemo, useEffect } from "react";
import { authFetch } from "@/lib/api/authFetch";
import TaskDetailModal from "./TaskDetailModal";
import { calculateSprintEndDate, formatSprintDuration } from "@/lib/projectUtils";

export default function ProjectSprintsTab({
  project,
  sprints = [],
  tasks = [],
  epics = [],
  departmentEmployees = [],
  teamLeads = [],
  employeeProfile,
  currentUserId,
  onSprintsUpdated,
  onTasksUpdated,
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState(null);
  const [sprintToComplete, setSprintToComplete] = useState(null);
  const [isCompletingSprint, setIsCompletingSprint] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const [expandedSprintIds, setExpandedSprintIds] = useState(new Set());

  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const todayStr = new Date().toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(todayStr);
  const [durationWeeks, setDurationWeeks] = useState("2");
  const [endDate, setEndDate] = useState(calculateSprintEndDate(todayStr, 2));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const showNotificationToast = (message, type = "info") => {
    setToastMsg({ message, type });
    setTimeout(() => setToastMsg(null), 5000);
  };

  const normalizeSprintStatus = (status) => {
    const s = String(status || "").trim().toUpperCase();
    if (["ACTIVE", "IN_PROGRESS", "RUNNING", "STARTED", "CURRENT"].includes(s)) return "ACTIVE";
    if (["COMPLETED", "DONE", "FINISHED", "CLOSED"].includes(s)) return "COMPLETED";
    return "PLANNED";
  };

  const activeSprints = useMemo(
    () => (sprints || []).filter((s) => normalizeSprintStatus(s.status) === "ACTIVE"),
    [sprints]
  );
  const plannedSprints = useMemo(
    () => (sprints || []).filter((s) => normalizeSprintStatus(s.status) === "PLANNED"),
    [sprints]
  );
  const completedSprints = useMemo(
    () => (sprints || []).filter((s) => normalizeSprintStatus(s.status) === "COMPLETED"),
    [sprints]
  );

  // Auto-expand active sprints initially
  useEffect(() => {
    if (activeSprints.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpandedSprintIds((prev) => {
        const next = new Set(prev);
        activeSprints.forEach((s) => next.add(s.id));
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSprints.length]);

  const toggleSprintExpand = (sprintId) => {
    setExpandedSprintIds((prev) => {
      const next = new Set(prev);
      if (next.has(sprintId)) {
        next.delete(sprintId);
      } else {
        next.add(sprintId);
      }
      return next;
    });
  };

  const handleDurationPreset = (weeks) => {
    setDurationWeeks(weeks);
    if (weeks !== "custom") {
      const calculated = calculateSprintEndDate(startDate || todayStr, Number(weeks));
      setEndDate(calculated);
    }
  };

  const handleStartDateChange = (val) => {
    setStartDate(val);
    if (durationWeeks !== "custom" && val) {
      setEndDate(calculateSprintEndDate(val, Number(durationWeeks)));
    }
  };

  const handleEndDateChange = (val) => {
    setEndDate(val);
    setDurationWeeks("custom");
  };

  const handleCreateSprint = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    setFormError("");

    try {
      const res = await authFetch(`/api/projects/${project.id}/sprints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          goal: goal.trim(),
          start_date: startDate || null,
          end_date: endDate || null,
          status: "PLANNED",
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setName("");
        setGoal("");
        setStartDate(todayStr);
        setDurationWeeks("2");
        setEndDate(calculateSprintEndDate(todayStr, 2));
        setIsModalOpen(false);
        showNotificationToast(`Sprint "${data.sprint?.name || "Sprint"}" created successfully.`, "success");
        if (onSprintsUpdated) onSprintsUpdated();
      } else {
        setFormError(data.message || "Failed to create sprint.");
      }
    } catch (err) {
      setFormError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateSprintStatus = async (sprintId, newStatus) => {
    if (newStatus === "COMPLETED") {
      const targetSprint = sprints.find((s) => s.id === sprintId);
      if (targetSprint) {
        setSprintToComplete(targetSprint);
        return;
      }
    }

    try {
      const res = await authFetch(`/api/projects/${project.id}/sprints`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sprint_id: sprintId,
          status: newStatus,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        showNotificationToast(data.message || `Sprint status updated to ${newStatus}.`, "success");
        if (onSprintsUpdated) onSprintsUpdated();
        if (onTasksUpdated) onTasksUpdated();
      } else {
        showNotificationToast(data.message || "Failed to update sprint status.", "error");
      }
    } catch (err) {
      console.error("Update sprint status error:", err);
      showNotificationToast("Network error updating sprint status.", "error");
    }
  };

  const handleConfirmCompleteSprint = async (sprintId) => {
    setIsCompletingSprint(true);
    try {
      const res = await authFetch(`/api/projects/${project.id}/sprints`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sprint_id: sprintId,
          status: "COMPLETED",
        }),
      });

      const data = await res.json();
      if (res.ok) {
        showNotificationToast(
          data.message || "Sprint completed successfully! Unfinished tasks moved to Backlog.",
          "success"
        );
        setSprintToComplete(null);
        if (onSprintsUpdated) onSprintsUpdated();
        if (onTasksUpdated) onTasksUpdated();
      } else {
        showNotificationToast(data.message || "Failed to complete sprint.", "error");
      }
    } catch (err) {
      console.error("Complete sprint error:", err);
      showNotificationToast("Network error completing sprint.", "error");
    } finally {
      setIsCompletingSprint(false);
    }
  };

  // Render individual sprint card with click-to-show task details
  const renderSprintCard = (sprint) => {
    const sprintTasks = tasks.filter((t) => t.sprint_id === sprint.id);
    const normStatus = normalizeSprintStatus(sprint.status);
    const isActive = normStatus === "ACTIVE";
    const isPlanned = normStatus === "PLANNED";
    const isCompleted = normStatus === "COMPLETED";
    const isExpanded = expandedSprintIds.has(sprint.id);

    return (
      <div
        key={sprint.id}
        className="rounded-xl bg-white border border-slate-200 shadow-2xs overflow-hidden transition-all"
      >
        {/* Clickable Sprint Header */}
        <div
          onClick={() => toggleSprintExpand(sprint.id)}
          className="p-4 flex flex-wrap items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/90 transition select-none"
          title="Click to view task details"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span
              className={`text-xs text-slate-400 transition-transform duration-200 shrink-0 ${
                isExpanded ? "rotate-90 text-blue-600 font-bold" : ""
              }`}
            >
              ▶
            </span>

            <div className="flex items-center gap-2.5 flex-wrap min-w-0">
              <span className="font-bold text-slate-900 text-sm hover:text-blue-600 transition truncate">
                {sprint.name}
              </span>

              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border shrink-0 ${
                  isActive
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : isCompleted
                    ? "bg-slate-100 text-slate-700 border-slate-200"
                    : "bg-blue-50 text-blue-700 border-blue-200"
                }`}
              >
                {isActive ? "Active" : isCompleted ? "Completed" : "Planned"}
              </span>

              <span className="text-[11px] text-slate-400 font-mono shrink-0 hidden sm:inline">
                📅 {sprint.start_date ? sprint.start_date.split("T")[0] : "—"} → {sprint.end_date ? sprint.end_date.split("T")[0] : "—"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            <span className="text-xs font-mono font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
              {sprintTasks.length} {sprintTasks.length === 1 ? "task" : "tasks"}
            </span>

            {isPlanned && (
              <button
                type="button"
                onClick={() => handleUpdateSprintStatus(sprint.id, "ACTIVE")}
                className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs transition cursor-pointer shadow-xs flex items-center gap-1"
              >
                <span>⚡</span>
                <span>Start Sprint</span>
              </button>
            )}

            {isActive && (
              <button
                type="button"
                onClick={() => handleUpdateSprintStatus(sprint.id, "COMPLETED")}
                className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs transition cursor-pointer shadow-xs flex items-center gap-1"
              >
                <span>✓</span>
                <span>Complete Sprint</span>
              </button>
            )}
          </div>
        </div>

        {/* Task Details Section: Shown strictly upon clicking the sprint */}
        {isExpanded && (
          <div className="px-5 pb-5 pt-2 border-t border-slate-100 space-y-3 bg-slate-50/30 animate-fadeIn">
            {/* Sprint Goal (if any) */}
            {sprint.goal && (
              <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1 text-xs">
                <span className="text-slate-500 font-medium sm:w-28 shrink-0">Goal:</span>
                <span className="text-slate-700 font-normal">{sprint.goal}</span>
              </div>
            )}

            {/* Section Divider */}
            <div className="text-blue-600 font-semibold border-b border-blue-500 pb-1 text-xs pt-1 flex items-center justify-between">
              <span>Tasks in Sprint ({sprintTasks.length})</span>
            </div>

            {/* Tasks List: Only Task Name and Task Status */}
            {sprintTasks.length === 0 ? (
              <div className="py-5 text-center text-slate-400 text-xs italic bg-white rounded-lg border border-slate-200">
                No tasks assigned to this sprint.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                {sprintTasks.map((task) => {
                  const status = (task.status || "TODO").toUpperCase();
                  return (
                    <div
                      key={task.id}
                      onClick={() => setSelectedTaskForDetail(task)}
                      className="py-2.5 px-3.5 hover:bg-slate-50 transition flex items-center justify-between gap-3 cursor-pointer group"
                    >
                      {/* Task Name */}
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            status === "COMPLETED"
                              ? "bg-emerald-500"
                              : status === "IN_PROGRESS"
                              ? "bg-sky-500"
                              : status === "REVIEW"
                              ? "bg-purple-500"
                              : "bg-slate-400"
                          }`}
                        />
                        <span className="text-xs font-medium text-slate-900 truncate group-hover:text-blue-600 transition">
                          {task.title}
                        </span>
                      </div>

                      {/* Task Status */}
                      <div className="shrink-0">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                            status === "COMPLETED"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : status === "IN_PROGRESS"
                              ? "bg-sky-50 text-sky-700 border-sky-200"
                              : status === "REVIEW"
                              ? "bg-purple-50 text-purple-700 border-purple-200"
                              : "bg-slate-100 text-slate-600 border-slate-200"
                          }`}
                        >
                          {status === "IN_PROGRESS"
                            ? "In Progress"
                            : status === "COMPLETED"
                            ? "Completed"
                            : status === "REVIEW"
                            ? "In Review"
                            : "To Do"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 text-xs text-slate-800 relative">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-[200] max-w-md animate-fadeIn">
          <div
            className={`p-3.5 rounded-xl shadow-xl border flex items-center gap-3 text-xs font-medium ${
              toastMsg.type === "success"
                ? "bg-emerald-900 text-white border-emerald-700"
                : toastMsg.type === "error"
                ? "bg-rose-900 text-white border-rose-700"
                : "bg-slate-900 text-white border-slate-700"
            }`}
          >
            <span>{toastMsg.type === "success" ? "✓" : toastMsg.type === "error" ? "⚠️" : "ℹ️"}</span>
            <span className="flex-1 leading-snug">{toastMsg.message}</span>
            <button
              type="button"
              onClick={() => setToastMsg(null)}
              className="text-white/70 hover:text-white text-xs px-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Action Header */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Sprint Management</h3>
          <p className="text-[11px] text-slate-500">
            Sprint cycles, iteration goals, velocity, and delivery cadence. Click any sprint to view its task details.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="h-8.5 px-3.5 rounded-lg bg-brand-gradient hover:opacity-95 text-white font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-[#1f6fb2]/20 text-xs"
        >
          <span>+</span>
          <span>Create Sprint</span>
        </button>
      </div>

      {/* 1. ACTIVE SPRINT */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
            Active Sprint
          </h4>
        </div>

        {activeSprints.length === 0 ? (
          <div className="p-6 rounded-xl bg-white border border-dashed border-slate-300 text-center text-slate-400">
            No active sprint running right now. You can start a planned sprint below.
          </div>
        ) : (
          <div className="space-y-3">
            {activeSprints.map(renderSprintCard)}
          </div>
        )}
      </div>

      {/* 2. PLANNED SPRINTS */}
      <div className="space-y-3">
        <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
          Planned Sprints ({plannedSprints.length})
        </h4>

        {plannedSprints.length === 0 ? (
          <div className="p-4 rounded-xl bg-white border border-slate-200 text-slate-400 text-center italic">
            No planned sprints in the pipeline.
          </div>
        ) : (
          <div className="space-y-3">
            {plannedSprints.map(renderSprintCard)}
          </div>
        )}
      </div>

      {/* 3. COMPLETED SPRINTS */}
      {completedSprints.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-bold text-slate-500 uppercase tracking-wider text-[11px]">
            Completed Sprints History ({completedSprints.length})
          </h4>

          <div className="space-y-3">
            {completedSprints.map(renderSprintCard)}
          </div>
        </div>
      )}

      {/* Complete Sprint Modal */}
      {sprintToComplete && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !isCompletingSprint) setSprintToComplete(null);
          }}
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn"
        >
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden p-6 space-y-4 animate-scaleIn">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>✓</span>
                <span>Complete Sprint: {sprintToComplete.name}</span>
              </h3>
              <button
                type="button"
                disabled={isCompletingSprint}
                onClick={() => setSprintToComplete(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer disabled:opacity-50 text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Are you sure you want to complete this sprint? Any unfinished tasks will be returned to the Backlog for future scheduling.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isCompletingSprint}
                onClick={() => setSprintToComplete(null)}
                className="px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-xs transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isCompletingSprint}
                onClick={() => handleConfirmCompleteSprint(sprintToComplete.id)}
                className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs transition cursor-pointer disabled:opacity-50 shadow-xs flex items-center gap-1.5"
              >
                {isCompletingSprint ? "Completing…" : "Confirm & Complete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Sprint Modal */}
      {isModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmitting) setIsModalOpen(false);
          }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto animate-fadeIn"
        >
          <div className="relative w-full max-w-xl bg-white rounded-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col m-auto my-auto animate-scaleIn">
            {/* Top Header */}
            <div className="px-6 pt-5 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-3 text-base">
                <span className="font-bold text-slate-900">Create:</span>
                <span className="text-blue-600 font-semibold border-b-2 border-blue-600 pb-0.5 text-sm">
                  Sprint
                </span>
              </div>

              {/* Red square close button */}
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setIsModalOpen(false)}
                className="w-6 h-6 border border-rose-300 hover:border-rose-400 text-rose-400 hover:text-rose-600 rounded flex items-center justify-center text-xs transition cursor-pointer disabled:opacity-50"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleCreateSprint} className="px-6 py-4 space-y-4 max-h-[80vh] overflow-y-auto">
              {formError && (
                <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                  {formError}
                </div>
              )}

              {/* Row: Sprint Name with red underline indicator */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                  <span className="border-b-2 border-rose-500 pb-0.5">
                    Sprint Name
                  </span>
                </label>
                <div className="flex-1">
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g., Sprint 1 (Release v1.2)"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-1 text-sm bg-transparent text-slate-900 transition-colors placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Row: Sprint Goal */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-2">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0 pt-1">
                  Sprint Goal
                </label>
                <div className="flex-1">
                  <textarea
                    rows={2}
                    placeholder="What is the primary deliverable or outcome of this sprint?"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-1 text-sm bg-transparent text-slate-900 resize-none transition-colors placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Section Divider: Default Section */}
              <div className="text-blue-600 font-semibold border-b border-blue-500 pb-1 text-sm pt-3">
                Default Section
              </div>

              {/* Row: Sprint Duration Presets */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                  Duration
                </label>
                <div className="flex-1 flex items-center gap-1.5 border-b border-slate-300 pb-1.5">
                  {[
                    { label: "1 Week", value: "1" },
                    { label: "2 Weeks", value: "2" },
                    { label: "3 Weeks", value: "3" },
                    { label: "4 Weeks", value: "4" },
                    { label: "Custom", value: "custom" },
                  ].map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => handleDurationPreset(preset.value)}
                      className={`px-2 py-0.5 rounded text-xs font-medium transition cursor-pointer border ${
                        durationWeeks === preset.value
                          ? "bg-brand-gradient text-white border-transparent shadow-2xs"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row: Start Date */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                  Start Date
                </label>
                <div className="flex-1">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => handleStartDateChange(e.target.value)}
                    className="w-full border-b border-slate-300 focus:border-[#1f6fb2] outline-none pb-1 text-sm bg-transparent text-slate-900"
                  />
                </div>
              </div>

              {/* Row: End Date */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                  End Date
                </label>
                <div className="flex-1">
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => handleEndDateChange(e.target.value)}
                    className="w-full border-b border-slate-300 focus:border-[#1f6fb2] outline-none pb-1 text-sm bg-transparent text-slate-900"
                  />
                </div>
              </div>

              {/* Schedule Estimation Helper */}
              {startDate && endDate && (
                <div className="text-xs text-[#1f6fb2] py-1 flex items-center gap-1.5 font-medium">
                  <span>🕒</span>
                  <span>Estimated Schedule: <strong>{formatSprintDuration(startDate, endDate)}</strong></span>
                </div>
              )}

              {/* Bottom Action Buttons: Brand Gradient Create & Clean Cancel */}
              <div className="pt-6 pb-2 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={isSubmitting || !name.trim()}
                  className="px-4 py-1.5 rounded-lg bg-brand-gradient hover:opacity-95 text-white font-semibold text-sm transition cursor-pointer disabled:opacity-50 shadow-md shadow-[#1f6fb2]/20"
                >
                  {isSubmitting ? "Creating…" : "Create"}
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-sm transition cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Detail Modal when clicking any task */}
      {selectedTaskForDetail && (
        <TaskDetailModal
          task={selectedTaskForDetail}
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
      )}
    </div>
  );
}
