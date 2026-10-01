"use client";

import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { authFetch } from "@/lib/api/authFetch";

const EPIC_COLORS = ["#3b82f6", "#6366f1", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4"];

const EPIC_STATUSES = [
  { id: "PLANNING", label: "Planning" },
  { id: "IN_PROGRESS", label: "In Progress" },
  { id: "COMPLETED", label: "Completed" },
  { id: "ON_HOLD", label: "On Hold" },
];

export default function EpicDetailModal({
  epic,
  project,
  tasks = [],
  sprints = [],
  isOpen,
  onClose,
  onSelectTask,
  onEpicUpdated,
  canManage = true,
}) {
  const [mounted, setMounted] = useState(false);

  // Form states initialized with current epic data
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [status, setStatus] = useState("IN_PROGRESS");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showTasksModal, setShowTasksModal] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync form states whenever `epic` changes or modal opens
  useEffect(() => {
    if (epic) {
      setName(epic.name || "");
      setDescription(epic.description || "");
      setColor(epic.color || "#3b82f6");
      setStatus(epic.status || "IN_PROGRESS");
      setStartDate(epic.start_date ? String(epic.start_date).split("T")[0] : "");
      setEndDate(epic.end_date ? String(epic.end_date).split("T")[0] : "");
      setFormError("");
      setFormSuccess("");
      setShowDeleteConfirm(false);
      setShowTasksModal(false);
    }
  }, [epic, isOpen]);

  // Keyboard shortcut Esc to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        if (showTasksModal) {
          setShowTasksModal(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isSubmitting, showTasksModal]);

  // Project date boundaries
  const projectStartDate = project?.start_date ? String(project.start_date).split("T")[0] : "";
  const projectEndDate = project?.end_date ? String(project.end_date).split("T")[0] : "";

  // Tasks in this epic
  const epicTasks = useMemo(() => {
    if (!epic?.id) return [];
    return (tasks || []).filter((t) => t.epic_id === epic.id);
  }, [tasks, epic]);

  // Sprints map
  const sprintMap = useMemo(() => {
    const m = new Map();
    (sprints || []).forEach((s) => m.set(s.id, s.name));
    return m;
  }, [sprints]);

  // Real-time Duration Calculation
  const durationDays = useMemo(() => {
    if (!startDate || !endDate) return null;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diff = end - start;
    if (isNaN(diff) || diff < 0) return null;
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
  }, [startDate, endDate]);

  // Client-side date validation against project boundaries
  const dateValidationError = useMemo(() => {
    if (startDate && endDate && endDate < startDate) {
      return "Epic end date cannot be earlier than start date.";
    }
    if (projectEndDate && endDate && endDate > projectEndDate) {
      return `Epic end date (${endDate}) cannot exceed project end date (${projectEndDate}).`;
    }
    if (projectStartDate && startDate && startDate < projectStartDate) {
      return `Epic start date (${startDate}) cannot be earlier than project start date (${projectStartDate}).`;
    }
    return "";
  }, [startDate, endDate, projectStartDate, projectEndDate]);

  // Handle Save / Update Epic
  const handleSaveEpic = async (e) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    if (!name.trim()) {
      setFormError("Epic Name is required.");
      return;
    }

    if (dateValidationError) {
      setFormError(dateValidationError);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        epic_id: epic.id,
        name: name.trim(),
        description: description.trim(),
        color,
        status,
        start_date: startDate || null,
        end_date: endDate || null,
      };

      const res = await authFetch(`/api/projects/${project.id}/epics`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setFormError(data.message || "Failed to update epic.");
      } else {
        setFormSuccess("Epic updated successfully.");
        if (onEpicUpdated) onEpicUpdated(data.epic);
        setTimeout(() => {
          onClose();
        }, 600);
      }
    } catch (err) {
      setFormError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete Epic
  const handleDeleteEpic = async () => {
    if (!epic?.id || !project?.id) return;
    setIsDeleting(true);
    setFormError("");

    try {
      const res = await authFetch(`/api/projects/${project.id}/epics?epic_id=${epic.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        setFormError(data.message || "Failed to delete epic.");
      } else {
        if (onEpicUpdated) onEpicUpdated();
        onClose();
      }
    } catch (err) {
      setFormError("Network error. Please try again.");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (!isOpen || !epic || !mounted || typeof document === "undefined") return null;

  const modalContent = (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting && !isDeleting) {
          onClose();
        }
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto animate-fadeIn"
    >
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col m-auto my-auto animate-scaleIn">
        {/* Top Header matching exact Configure Hours format */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-2 font-sans min-w-0">
            <span
              className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs"
              style={{ backgroundColor: color || "#3b82f6" }}
            />
            <span className="font-bold text-slate-900 text-sm sm:text-base">Edit:</span>
            <span className="text-[#1f6fb2] font-bold text-sm sm:text-base truncate">
              {epic.name || "Epic Details & Schedule"}
            </span>
          </div>

          {/* Close button */}
          <button
            type="button"
            disabled={isSubmitting || isDeleting}
            onClick={onClose}
            className="w-7 h-7 border border-slate-200 hover:border-slate-300 text-slate-400 hover:text-slate-700 rounded-lg flex items-center justify-center text-xs transition cursor-pointer disabled:opacity-50 shadow-2xs shrink-0"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Error Alert */}
        {(formError || dateValidationError) && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 shrink-0">
            <span className="font-bold">⚠️</span>
            <span>{formError || dateValidationError}</span>
          </div>
        )}

        {/* Success Alert */}
        {formSuccess && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2 shrink-0">
            <span className="font-bold">✓</span>
            <span>{formSuccess}</span>
          </div>
        )}

        {/* Form Body - clean & non-scroll constrained */}
        <form onSubmit={handleSaveEpic} className="p-6 space-y-4">
          {/* Section 1: Epic Overview */}
          <div className="space-y-3">
            <span className="text-[11px] font-bold text-[#1f6fb2] uppercase tracking-wider block">
              Epic Overview
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  Epic Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Auth & Role-Based Access Control"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition font-medium"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  Status <span className="text-rose-500">*</span>
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition font-medium cursor-pointer"
                >
                  {EPIC_STATUSES.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Epic Theme Color Picker */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 block">
                Epic Color
              </label>
              <div className="flex items-center gap-2 pt-0.5">
                {EPIC_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-6 h-6 rounded-full cursor-pointer transition transform ${
                      color === c
                        ? "ring-2 ring-offset-2 ring-[#1f6fb2] scale-110 shadow-xs"
                        : "hover:scale-105 opacity-80 hover:opacity-100"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {/* Description - clearly visible with 3 full rows */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 block">
                Description
              </label>
              <textarea
                rows={3}
                placeholder="Objectives, deliverables, milestones for this epic…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2.5 text-xs bg-white text-slate-900 outline-none shadow-2xs transition font-medium resize-none leading-relaxed"
              />
            </div>
          </div>

          {/* Separation Divider */}
          <div className="border-t border-slate-100" />

          {/* Section 2: Schedule & Timeline Bounds */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#1f6fb2] uppercase tracking-wider block">
                Schedule &amp; Project Timeline
              </span>
              {projectEndDate && (
                <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded-md">
                  Project Deadline: <strong className="text-slate-800">{projectEndDate}</strong>
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  Start Date
                </label>
                <input
                  type="date"
                  min={projectStartDate || undefined}
                  max={projectEndDate || undefined}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 font-mono outline-none shadow-2xs transition"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 block">
                    End Date <span className="text-slate-400 font-normal">(Target)</span>
                  </label>
                  {durationDays && (
                    <span className="text-[11px] font-semibold text-[#1f6fb2]">
                      {durationDays} days duration
                    </span>
                  )}
                </div>
                <input
                  type="date"
                  min={startDate || projectStartDate || undefined}
                  max={projectEndDate || undefined}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={`w-full border rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 font-mono outline-none shadow-2xs transition ${
                    projectEndDate && endDate && endDate > projectEndDate
                      ? "border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 bg-rose-50/30"
                      : "border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20"
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Separation Divider */}
          <div className="border-t border-slate-100" />

          {/* Section 3: Tasks in Epic - clean professional card without emoji */}
          <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900">Tasks in Epic</span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-white text-slate-700 border border-slate-200 font-semibold">
                {epicTasks.length} {epicTasks.length === 1 ? "task" : "tasks"}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowTasksModal(true)}
              className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 font-semibold text-xs border border-slate-200 shadow-2xs transition cursor-pointer"
            >
              View Tasks
            </button>
          </div>

          {/* Delete Confirmation Warning Box */}
          {showDeleteConfirm && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 space-y-2">
              <p className="text-xs text-rose-800 font-semibold">
                Are you sure you want to delete this Epic?
              </p>
              <p className="text-[11px] text-rose-600 leading-relaxed">
                Tasks linked to this epic will NOT be deleted; they will simply be unlinked.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleDeleteEpic}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition cursor-pointer disabled:opacity-50"
                >
                  {isDeleting ? "Deleting…" : "Confirm Delete"}
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 font-semibold text-xs hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Bottom Action Footer matching Configure Hours */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
            {canManage && !showDeleteConfirm ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-xs text-rose-500 hover:text-rose-700 font-semibold transition cursor-pointer"
              >
                Delete Epic
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={isSubmitting || !name.trim() || Boolean(dateValidationError)}
                className="px-4 py-2 rounded-xl bg-brand-gradient hover:opacity-95 text-white font-semibold text-xs transition cursor-pointer disabled:opacity-50 shadow-xs shadow-[#1f6fb2]/20 flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving…</span>
                  </>
                ) : (
                  <span>Save Changes</span>
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* --- DEDICATED POPUP MODAL: TASKS IN EPIC (Executive Clean View) --- */}
      {showTasksModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowTasksModal(false);
          }}
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-fadeIn"
        >
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col m-auto my-auto animate-scaleIn">
            {/* Tasks Modal Header */}
            <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-2 font-sans min-w-0">
                <span
                  className="w-3 h-3 rounded-full shrink-0 shadow-xs"
                  style={{ backgroundColor: color || "#3b82f6" }}
                />
                <span className="font-bold text-slate-900 text-sm">Tasks in:</span>
                <span className="text-[#1f6fb2] font-bold text-sm truncate">
                  {name || epic.name}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold border border-slate-200 shrink-0">
                  {epicTasks.length} {epicTasks.length === 1 ? "task" : "tasks"}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowTasksModal(false)}
                className="w-7 h-7 border border-slate-200 hover:border-slate-300 text-slate-400 hover:text-slate-700 rounded-lg flex items-center justify-center text-xs transition cursor-pointer shadow-2xs"
              >
                ✕
              </button>
            </div>

            {/* Tasks List - Sleek & Professional */}
            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-2 custom-scroll">
              {epicTasks.length === 0 ? (
                <div className="py-12 text-center bg-slate-50/60 rounded-xl border border-slate-200/80 space-y-2">
                  <svg className="w-8 h-8 text-slate-300 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <p className="text-xs font-semibold text-slate-700">No tasks linked to this Epic</p>
                  <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                    Assign tasks to &quot;{name || epic.name}&quot; from the project board or backlog.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                  {epicTasks.map((task) => {
                    const taskStatus = (task.status || "TODO").toUpperCase();
                    const isTaskDone = taskStatus === "COMPLETED";
                    const isTaskInProgress = taskStatus === "IN_PROGRESS";
                    const isTaskReview = taskStatus === "REVIEW";
                    const sprintName = task.sprint_id
                      ? sprintMap.get(task.sprint_id)
                      : task.sprint?.name || null;

                    return (
                      <div
                        key={task.id}
                        onClick={() => {
                          setShowTasksModal(false);
                          if (onSelectTask) onSelectTask(task);
                        }}
                        className="p-3 hover:bg-slate-50/90 transition flex items-center justify-between gap-3 cursor-pointer group"
                      >
                        {/* Left: Professional SVG Task Icon + Title & Meta */}
                        <div className="min-w-0 flex-1 flex items-start gap-2.5">
                          <div className="pt-0.5 shrink-0">
                            {isTaskDone ? (
                              <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            ) : isTaskInProgress ? (
                              <svg className="w-4 h-4 text-[#1f6fb2]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            ) : isTaskReview ? (
                              <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <rect x="4" y="4" width="16" height="16" rx="4" />
                              </svg>
                            )}
                          </div>

                          <div className="min-w-0 flex-1 space-y-1">
                            <span className="text-xs font-semibold text-slate-900 group-hover:text-[#1f6fb2] transition truncate block">
                              {task.title}
                            </span>

                            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                              {sprintName && (
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-sans font-medium">
                                  {sprintName}
                                </span>
                              )}
                              {task.due_date && (
                                <span>Due: {task.due_date.split("T")[0]}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right: Status badge */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wider ${
                              isTaskDone
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : isTaskInProgress
                                ? "bg-sky-50 text-[#1f6fb2] border-sky-200"
                                : isTaskReview
                                ? "bg-purple-50 text-purple-700 border-purple-200"
                                : "bg-slate-100 text-slate-600 border-slate-200"
                            }`}
                          >
                            {isTaskInProgress
                              ? "In Progress"
                              : isTaskDone
                              ? "Completed"
                              : isTaskReview
                              ? "Review"
                              : "To Do"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowTasksModal(false)}
                className="px-4 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(modalContent, document.body);
}
