"use client";

import React, { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import TaskDetailModal from "./TaskDetailModal";
import SprintDetailModal from "./SprintDetailModal";
import SprintPerformanceModal from "./SprintPerformanceModal";
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
  const [selectedSprintForModal, setSelectedSprintForModal] = useState(null);
  const [selectedSprintForEvaluation, setSelectedSprintForEvaluation] = useState(null);
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState(null);
  const [sprintToComplete, setSprintToComplete] = useState(null);
  const [isCompletingSprint, setIsCompletingSprint] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);

  const isTeamLeadOrManager = Boolean(
    employeeProfile?.designation?.toLowerCase().includes("lead") ||
    employeeProfile?.designation?.toLowerCase().includes("manager") ||
    employeeProfile?.designation?.toLowerCase().includes("admin") ||
    employeeProfile?.designation?.toLowerCase().includes("owner") ||
    project?.team_lead_id === employeeProfile?.id ||
    project?.teamLead?.id === employeeProfile?.id ||
    project?.created_by === employeeProfile?.id ||
    project?.owner_id === employeeProfile?.id
  );
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

  const activeSprints = sprints.filter((s) => s.status === "ACTIVE");
  const plannedSprints = sprints.filter((s) => s.status === "PLANNED");
  const completedSprints = sprints.filter((s) => s.status === "COMPLETED");

  const handleCreateSprint = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    setFormError("");

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      const res = await fetch(`/api/projects/${project.id}/sprints`, {
        method: "POST",
        headers,
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
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      const res = await fetch(`/api/projects/${project.id}/sprints`, {
        method: "PATCH",
        headers,
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
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      const res = await fetch(`/api/projects/${project.id}/sprints`, {
        method: "PATCH",
        headers,
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
        if (selectedSprintForModal?.id === sprintId) {
          setSelectedSprintForModal(null);
        }
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
            Sprint cycles, iteration goals, velocity, and delivery cadence. Tasks in planned sprints are assigned once the sprint is started.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="h-8.5 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
        >
          <span>+</span>
          <span>Create Sprint</span>
        </button>
      </div>

      {/* 1. ACTIVE SPRINT */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
            Active Sprint
          </h4>
        </div>

        {activeSprints.length === 0 ? (
          <div className="p-6 rounded-xl bg-white border border-dashed border-slate-300 text-center text-slate-400">
            No active sprint running right now. You can start a planned sprint below.
          </div>
        ) : (
          activeSprints.map((sprint) => {
            const sprintTasks = tasks.filter((t) => t.sprint_id === sprint.id);
            const total = sprintTasks.length;
            const completed = sprintTasks.filter((t) => t.status === "COMPLETED").length;
            const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

            return (
              <div
                key={sprint.id}
                className="p-5 rounded-xl bg-white border border-emerald-200 shadow-2xs space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div
                    onClick={() => setSelectedSprintForModal(sprint)}
                    className="space-y-1 cursor-pointer group flex-1 min-w-[200px]"
                    title="Click to view all tasks in this sprint popup"
                  >
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        Active
                      </span>
                      <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition flex items-center gap-1.5">
                        <span>{sprint.name}</span>
                        <span className="text-xs font-normal text-slate-400">↗</span>
                      </h3>
                    </div>
                    {sprint.goal && (
                      <p className="text-slate-600 text-xs">{sprint.goal}</p>
                    )}
                    <p className="text-slate-400 font-mono text-[11px]">
                      📅 {sprint.start_date || "No start"} → {sprint.end_date || "Ongoing"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedSprintForEvaluation(sprint)}
                      className="h-8 px-3 rounded-lg border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-800 font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-2xs text-xs"
                      title="View member performance metrics or submit evaluation for this sprint"
                    >
                      <span>📊</span>
                      <span>Member Evaluations</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedSprintForModal(sprint)}
                      className="h-8 px-3 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-2xs text-xs"
                    >
                      <span>🔍</span>
                      <span>View Tasks Popup ({total})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleUpdateSprintStatus(sprint.id, "COMPLETED")}
                      className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition cursor-pointer text-xs shadow-2xs"
                    >
                      Complete Sprint ✓
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                    <span>Sprint Execution Progress</span>
                    <span className="font-bold text-emerald-700">{progress}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                    <span>{completed} of {total} deliverables completed</span>
                    <span>{sprint.metrics?.totalPoints || 0} story pts committed</span>
                  </div>
                </div>

                {/* Tasks in Sprint */}
                {sprintTasks.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 divide-y divide-slate-100">
                    {sprintTasks.map((task) => (
                      <div
                        key={task.id}
                        onClick={() => setSelectedTaskForDetail(task)}
                        className="py-2.5 px-2 -mx-2 rounded-lg hover:bg-slate-50 flex items-center justify-between text-xs cursor-pointer group transition"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-slate-800 group-hover:text-blue-600 truncate">
                                {task.title}
                              </span>
                              {task.description && (
                                <span className="text-slate-400 text-[10px] shrink-0" title="Has detailed description">
                                  📄
                                </span>
                              )}
                            </div>
                            {task.description && (
                              <p className="text-[10px] text-slate-400 truncate max-w-md">
                                {task.description}
                              </p>
                            )}
                          </div>
                          {(task.assignee || task.planned_assignee) && (
                            <span className="text-[11px] text-slate-500 shrink-0">
                              ({(task.assignee || task.planned_assignee).full_name})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono">
                            {task.status}
                          </span>
                          <span className="text-slate-300 text-xs group-hover:text-blue-600 group-hover:translate-x-0.5 transition">
                            →
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 2. PLANNED SPRINTS */}
      <div className="space-y-2">
        <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
          Planned Sprints ({plannedSprints.length})
        </h4>

        {plannedSprints.length === 0 ? (
          <div className="p-4 rounded-xl bg-white border border-slate-200 text-slate-400 text-center italic">
            No planned sprints in the pipeline.
          </div>
        ) : (
          <div className="space-y-2.5">
            {plannedSprints.map((sprint) => {
              const sprintTasks = tasks.filter((t) => t.sprint_id === sprint.id);

              return (
                <div
                  key={sprint.id}
                  className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div
                      onClick={() => setSelectedSprintForModal(sprint)}
                      className="space-y-0.5 cursor-pointer group flex-1 min-w-[200px]"
                      title="Click to view all tasks in this sprint popup"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm group-hover:text-blue-600 transition flex items-center gap-1.5">
                          <span>{sprint.name}</span>
                          <span className="text-xs font-normal text-slate-400">↗</span>
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-100 text-slate-600">
                          {sprintTasks.length} tasks planned
                        </span>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200">
                          Sprint not started
                        </span>
                      </div>
                      {sprint.goal && <p className="text-slate-500 text-xs">{sprint.goal}</p>}
                      <p className="text-slate-400 font-mono text-[10px]">
                        Dates: {sprint.start_date || "—"} → {sprint.end_date || "—"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setSelectedSprintForModal(sprint)}
                        className="h-8 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-2xs text-xs"
                      >
                        <span>🔍</span>
                        <span>View Tasks ({sprintTasks.length})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUpdateSprintStatus(sprint.id, "ACTIVE")}
                        className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition cursor-pointer shadow-2xs text-xs"
                      >
                        Start Sprint ⚡
                      </button>
                    </div>
                  </div>

                  {/* Tasks in Planned Sprint */}
                  {sprintTasks.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 divide-y divide-slate-100">
                      {sprintTasks.map((task) => {
                        const targetAssignee = task.assignee || task.planned_assignee;
                        return (
                          <div
                            key={task.id}
                            onClick={() => setSelectedTaskForDetail(task)}
                            className="py-2.5 px-2 -mx-2 rounded-lg hover:bg-slate-50 flex items-center justify-between text-xs cursor-pointer group transition"
                          >
                            <div className="min-w-0 pr-2">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-slate-800 group-hover:text-blue-600 truncate">
                                  {task.title}
                                </span>
                                {task.description && (
                                  <span className="text-slate-400 text-[10px] shrink-0" title="Has detailed description">
                                    📄
                                  </span>
                                )}
                              </div>
                              {task.description && (
                                <p className="text-[10px] text-slate-400 truncate max-w-md">
                                  {task.description}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {targetAssignee ? (
                                <span className="text-[11px] text-slate-600">
                                  Planned: <strong className="font-semibold text-slate-800">{targetAssignee.full_name}</strong>
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-400 italic">Unassigned</span>
                              )}
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-500">
                                Assigned on Start
                              </span>
                              <span className="text-slate-300 text-xs group-hover:text-blue-600 group-hover:translate-x-0.5 transition">
                                →
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. COMPLETED SPRINTS */}
      {completedSprints.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-bold text-slate-500 uppercase tracking-wider text-[11px]">
            Completed Sprints History ({completedSprints.length})
          </h4>

          <div className="space-y-2">
            {completedSprints.map((sprint) => (
              <div
                key={sprint.id}
                onClick={() => setSelectedSprintForModal(sprint)}
                className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 hover:bg-slate-100/80 transition cursor-pointer flex items-center justify-between gap-3 text-slate-600 group"
                title="Click to view all tasks in this completed sprint popup"
              >
                <div>
                  <span className="font-bold text-slate-800 group-hover:text-blue-600 transition flex items-center gap-1.5">
                    <span>{sprint.name}</span>
                    <span className="text-xs font-normal text-slate-400">↗</span>
                  </span>
                  <p className="text-[10px] text-slate-400 font-mono">
                    Completed on {sprint.end_date || "N/A"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSprintForEvaluation(sprint);
                    }}
                    className="h-7 px-2.5 rounded-lg border border-blue-300 bg-white hover:bg-blue-50 text-blue-700 font-semibold transition cursor-pointer flex items-center gap-1 text-[11px] shadow-2xs"
                    title="View finalized performance evaluations for this sprint"
                  >
                    <span>📊</span>
                    <span>Evaluations</span>
                  </button>
                  <span className="text-[11px] text-blue-600 font-medium group-hover:underline">
                    View Tasks →
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700">
                    Finished
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Sprint Modal */}
      {/* Create Sprint Modal */}
      {isModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmitting) setIsModalOpen(false);
          }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto animate-fadeIn"
        >
          <div className="relative w-full max-w-xl bg-white rounded-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col m-auto my-auto animate-scaleIn">
            {/* Top Header matching reference format */}
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
                          ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
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
                    className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-1 text-sm bg-transparent text-slate-900"
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
                    className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-1 text-sm bg-transparent text-slate-900"
                  />
                </div>
              </div>

              {/* Schedule Estimation Helper */}
              {startDate && endDate && (
                <div className="text-xs text-blue-700 py-1 flex items-center gap-1.5 font-medium">
                  <span>🕒</span>
                  <span>Estimated Schedule: <strong>{formatSprintDuration(startDate, endDate)}</strong></span>
                </div>
              )}

              {/* Bottom Action Buttons: Blue Create & Clean Cancel */}
              <div className="pt-6 pb-2 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={isSubmitting || !name.trim()}
                  className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition cursor-pointer disabled:opacity-50 shadow-xs"
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

      {/* Sprint Detail Tasks Popup Modal */}
      {selectedSprintForModal && (
        <SprintDetailModal
          sprint={
            sprints.find((s) => s.id === selectedSprintForModal.id) || selectedSprintForModal
          }
          project={project}
          tasks={tasks}
          epics={epics}
          departmentEmployees={departmentEmployees}
          teamLeads={teamLeads}
          employeeProfile={employeeProfile}
          currentUserId={currentUserId}
          isOpen={Boolean(selectedSprintForModal)}
          onClose={() => setSelectedSprintForModal(null)}
          onSprintStatusChange={handleUpdateSprintStatus}
          onTasksUpdated={onTasksUpdated}
          onSelectTask={(task) => setSelectedTaskForDetail(task)}
        />
      )}

      {/* Task Detail & Description Modal */}
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

      {/* Complete Sprint & Rollover Modal */}
      {sprintToComplete && (() => {
        const sprintTasks = tasks.filter((t) => t.sprint_id === sprintToComplete.id);
        const completedTasks = sprintTasks.filter((t) => t.status === "COMPLETED");
        const unfinishedTasks = sprintTasks.filter((t) => t.status !== "COMPLETED");
        const completedPoints = completedTasks.reduce((sum, t) => sum + (Number(t.story_points) || 1), 0);
        const totalPoints = sprintTasks.reduce((sum, t) => sum + (Number(t.story_points) || 1), 0);
        const unfinishedPoints = totalPoints - completedPoints;

        return (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget && !isCompletingSprint) setSprintToComplete(null);
            }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-fadeIn"
          >
            <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col m-auto my-auto animate-scaleIn text-xs">
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-700 flex items-center justify-center text-sm font-bold">
                    ✓
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Complete Sprint</h3>
                    <p className="text-[11px] text-slate-500 font-mono">{sprintToComplete.name}</p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isCompletingSprint}
                  onClick={() => setSprintToComplete(null)}
                  className="w-7 h-7 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer transition disabled:opacity-50"
                >
                  ✕
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                {/* Deliverable Metrics Cards */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-0.5">
                    <span className="text-[10px] uppercase font-bold text-emerald-700 block">Completed</span>
                    <span className="text-lg font-bold text-emerald-900 font-mono">
                      {completedTasks.length}{" "}
                      <span className="text-xs font-normal text-emerald-700">task(s)</span>
                    </span>
                    <p className="text-[10px] text-emerald-600 font-mono">{completedPoints} story pts burned</p>
                  </div>

                  <div
                    className={`p-3 rounded-xl space-y-0.5 ${
                      unfinishedTasks.length > 0
                        ? "bg-amber-50 border border-amber-200"
                        : "bg-slate-50 border border-slate-200 text-slate-400"
                    }`}
                  >
                    <span
                      className={`text-[10px] uppercase font-bold block ${
                        unfinishedTasks.length > 0 ? "text-amber-700" : "text-slate-400"
                      }`}
                    >
                      Unfinished
                    </span>
                    <span
                      className={`text-lg font-bold font-mono ${
                        unfinishedTasks.length > 0 ? "text-amber-900" : "text-slate-500"
                      }`}
                    >
                      {unfinishedTasks.length}{" "}
                      <span className="text-xs font-normal">task(s)</span>
                    </span>
                    <p
                      className={`text-[10px] font-mono ${
                        unfinishedTasks.length > 0 ? "text-amber-600" : "text-slate-400"
                      }`}
                    >
                      {unfinishedPoints} story pts pending
                    </p>
                  </div>
                </div>

                {/* Rollover notice for unfinished tasks */}
                {unfinishedTasks.length > 0 ? (
                  <div className="p-3.5 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 space-y-2">
                    <div className="flex items-center gap-1.5 font-bold text-[11px] text-amber-800">
                      <span>📦</span>
                      <span>Automatic Product Backlog Rollover</span>
                    </div>
                    <p className="text-[11px] text-amber-700 leading-relaxed">
                      All <strong>{unfinishedTasks.length} unfinished task(s)</strong> will automatically move back to the{" "}
                      <strong>Product Backlog (Unscheduled)</strong>. Their current progress percentages, assignees, priorities, subtasks, and descriptions will remain 100% intact.
                    </p>

                    <div className="pt-2 border-t border-amber-200/80 space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {unfinishedTasks.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-white/80 border border-amber-200/60 text-[11px]"
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <span className="font-semibold text-slate-800 truncate block">{t.title}</span>
                            <span className="text-[10px] text-slate-500">
                              Assigned: {t.assignee?.full_name || "Unassigned"} • {t.progress || 0}% progress
                            </span>
                          </div>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                            {t.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-3">
                    <span className="text-xl">🎉</span>
                    <div>
                      <p className="font-bold text-xs">All deliverables completed!</p>
                      <p className="text-[11px] text-emerald-700">100% of sprint story points have been successfully delivered.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5 shrink-0">
                <button
                  type="button"
                  disabled={isCompletingSprint}
                  onClick={() => setSprintToComplete(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 font-medium transition cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isCompletingSprint}
                  onClick={() => handleConfirmCompleteSprint(sprintToComplete.id)}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isCompletingSprint ? (
                    <span>Completing…</span>
                  ) : (
                    <>
                      <span>✓</span>
                      <span>
                        {unfinishedTasks.length > 0 ? "Complete Sprint & Move Tasks to Backlog" : "Complete Sprint"}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Sprint Performance & Member Evaluation Modal */}
      {selectedSprintForEvaluation && (() => {
        // Resolve strictly members included in this project
        const memberMap = new Map();
        const pool = [...(departmentEmployees || []), ...(teamLeads || [])];

        // 1. Team Lead
        if (project?.teamLead?.id) {
          memberMap.set(project.teamLead.id, { ...project.teamLead, roleTag: "Team Lead" });
        } else if (project?.team_lead_id) {
          const lead = pool.find((e) => e.id === project.team_lead_id);
          if (lead) memberMap.set(lead.id, { ...lead, roleTag: "Team Lead" });
        }

        // 2. Creator / Owner
        if (project?.creator?.id) {
          memberMap.set(project.creator.id, { ...project.creator, roleTag: "Owner" });
        } else if (project?.created_by || project?.owner_id) {
          const ownerId = project.owner_id || project.created_by;
          const owner = pool.find((e) => e.id === ownerId);
          if (owner) memberMap.set(owner.id, { ...owner, roleTag: "Owner" });
        }

        // 3. Team Members (from project.teamMembers objects or project.team_members IDs)
        if (Array.isArray(project?.teamMembers) && project.teamMembers.length > 0) {
          project.teamMembers.forEach((m) => {
            if (m?.id && !memberMap.has(m.id)) {
              memberMap.set(m.id, { ...m, roleTag: m.designation || m.role || "Member" });
            }
          });
        }

        if (Array.isArray(project?.team_members) && project.team_members.length > 0) {
          project.team_members.forEach((memberId) => {
            const cleanId = typeof memberId === "object" ? memberId?.id : memberId;
            if (cleanId && !memberMap.has(cleanId)) {
              const emp = typeof memberId === "object" ? memberId : pool.find((e) => e.id === cleanId);
              if (emp) {
                memberMap.set(cleanId, { ...emp, roleTag: emp.designation || emp.role || "Member" });
              }
            }
          });
        }

        // 4. Any employee with tasks assigned in this project or sprint
        if (Array.isArray(tasks) && tasks.length > 0) {
          tasks.forEach((t) => {
            if (t.assignee?.id && !memberMap.has(t.assignee.id)) {
              memberMap.set(t.assignee.id, { ...t.assignee, roleTag: t.assignee.designation || "Member" });
            }
            if (t.planned_assignee?.id && !memberMap.has(t.planned_assignee.id)) {
              memberMap.set(t.planned_assignee.id, { ...t.planned_assignee, roleTag: t.planned_assignee.designation || "Member" });
            }
            const assignId = t.assigned_to || t.planned_assignee_id;
            if (assignId && !memberMap.has(assignId)) {
              const emp = pool.find((e) => e.id === assignId);
              if (emp) memberMap.set(assignId, { ...emp, roleTag: emp.designation || emp.role || "Member" });
            }
          });
        }

        const projectOnlyMembers = Array.from(memberMap.values()).sort((a, b) =>
          (a.full_name || "").localeCompare(b.full_name || "")
        );

        return (
          <SprintPerformanceModal
            isOpen={Boolean(selectedSprintForEvaluation)}
            onClose={() => setSelectedSprintForEvaluation(null)}
            sprint={selectedSprintForEvaluation}
            project={project}
            teamMembers={projectOnlyMembers.length > 0 ? projectOnlyMembers : (project?.teamMembers || [])}
            currentUserId={currentUserId}
            isTeamLeadOrManager={isTeamLeadOrManager}
            onEvaluationSaved={() => {
              if (onSprintsUpdated) onSprintsUpdated();
              if (onTasksUpdated) onTasksUpdated();
            }}
          />
        );
      })()}
    </div>
  );
}
