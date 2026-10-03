/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  checkTaskSprintOverdue,
  validateTaskSprintBounds,
  getSprintDateBounds,
  getEmployeeSprintWorkload,
} from "@/lib/projectUtils";

export default function CreateStoryTaskModal({
  isOpen,
  onClose,
  project,
  tasks = [],
  sprints = [],
  epics = [],
  allEmployees = [],
  defaultSprintId = "",
  initialIssueType = "TASK",
  onCreateTask,
  onSubmit,
}) {
  const [mounted, setMounted] = useState(false);
  const [taskType, setTaskType] = useState(initialIssueType || "TASK");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [storyPoints, setStoryPoints] = useState(1);
  const [sprintId, setSprintId] = useState(defaultSprintId || "");
  const [epicId, setEpicId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const prevIsOpenRef = useRef(false);

  const isKanban = (project?.project_type || "").toLowerCase() === "kanban";

  useEffect(() => {
    setMounted(true);
  }, []);

  const selectedSprint = useMemo(() => {
    if (isKanban) return null;
    return sprints.find((s) => s.id === sprintId) || null;
  }, [sprints, sprintId, isKanban]);

  const sprintBounds = useMemo(() => {
    if (isKanban || !selectedSprint) return { minDate: "", maxDate: "", isSprintActive: false };
    return getSprintDateBounds(selectedSprint);
  }, [selectedSprint, isKanban]);

  const sprintMinDate = sprintBounds.minDate;
  const sprintMaxDate = sprintBounds.maxDate;

  // Sync default sprint and issue type strictly only when modal transitions from closed to open
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      const initialSprint = isKanban ? "" : (defaultSprintId || "");
      setSprintId(initialSprint);
      setTaskType(initialIssueType || "TASK");
      setErrorMsg("");

      if (initialSprint) {
        const found = sprints.find((s) => s.id === initialSprint);
        if (found?.end_date) {
          setDueDate(found.end_date.split("T")[0]);
        } else {
          setDueDate("");
        }
      } else {
        setDueDate("");
      }
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, defaultSprintId, initialIssueType, sprints, isKanban]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  // When user changes sprint selection, clamp or auto-populate due date to sprint end date
  const handleSprintChange = (newSprintId) => {
    setSprintId(newSprintId);
    if (!newSprintId) return;

    const targetSprint = sprints.find((s) => s.id === newSprintId);
    if (targetSprint) {
      const bounds = getSprintDateBounds(targetSprint);
      const minD = bounds.minDate;
      const maxD = bounds.maxDate;

      if (!dueDate || (minD && dueDate < minD) || (maxD && dueDate > maxD)) {
        setDueDate(maxD || minD || "");
      }
    }
  };

  // Real-time validation of due date within sprint bounds
  const dateValidation = useMemo(() => {
    if (isKanban) return { isValid: true, error: "" };
    return validateTaskSprintBounds(dueDate, selectedSprint);
  }, [dueDate, selectedSprint, isKanban]);

  // Strict Project Squad Filter: ONLY employees belonging to this project (Excludes Team Lead and Manager)
  const assignableProjectEmployees = useMemo(() => {
    const map = new Map();
    const sourcePool = Array.isArray(allEmployees) ? allEmployees : [];

    const leadId = project?.teamLead?.id || project?.team_lead_id;
    const ownerId = project?.creator?.id || project?.owner_id || project?.created_by;

    const isLeadOrManager = (emp) => {
      if (!emp) return false;
      if (emp.id === leadId || emp.id === ownerId) return true;
      const normalizedRole = (emp.role || "").toLowerCase().replace(/[\s_-]+/g, "");
      return (
        normalizedRole === "teamlead" ||
        normalizedRole === "manager" ||
        normalizedRole === "admin" ||
        normalizedRole === "hrmanager"
      );
    };

    // 1. Explicit Team Members (from project.teamMembers)
    if (Array.isArray(project?.teamMembers)) {
      project.teamMembers.forEach((m) => {
        if (m?.id && !isLeadOrManager(m) && !map.has(m.id)) {
          map.set(m.id, m);
        }
      });
    }

    // 2. Explicit Team Members (from project.team_members IDs or objects)
    if (Array.isArray(project?.team_members)) {
      project.team_members.forEach((memberId) => {
        const cleanId = typeof memberId === "object" ? memberId?.id : memberId;
        if (cleanId && !map.has(cleanId)) {
          const emp = typeof memberId === "object" ? memberId : sourcePool.find((e) => e.id === cleanId);
          if (emp && !isLeadOrManager(emp)) {
            map.set(cleanId, emp);
          }
        }
      });
    }

    // Fallback: If no explicit members in team list, check sourcePool for employees with matching department/group
    if (map.size === 0 && Array.isArray(sourcePool)) {
      sourcePool.forEach((emp) => {
        if (emp?.id && !isLeadOrManager(emp)) {
          const empRole = (emp.role || "").toLowerCase();
          if (empRole === "employee" || !empRole) {
            map.set(emp.id, emp);
          }
        }
      });
    }

    return Array.from(map.values()).sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
  }, [project, allEmployees]);

  // Real-time selected assignee details & sprint workload
  const selectedAssignee = useMemo(() => {
    return assignableProjectEmployees.find((e) => e.id === assigneeId) || null;
  }, [assignableProjectEmployees, assigneeId]);

  const assigneeSprintWorkload = useMemo(() => {
    if (!assigneeId) return { count: 0, completedCount: 0, inProgressCount: 0, points: 0 };
    return getEmployeeSprintWorkload(assigneeId, sprintId, tasks);
  }, [assigneeId, sprintId, tasks]);

  const sprintTotalTasksCount = useMemo(() => {
    if (!sprintId) return 0;
    return tasks.filter((t) => t.sprint_id === sprintId).length;
  }, [sprintId, tasks]);

  if (!isOpen || !mounted) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg("Please enter a title.");
      return;
    }

    if (!dateValidation.isValid) {
      setErrorMsg(dateValidation.error || "Please select a due date within the sprint week.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");

    const callback = onCreateTask || onSubmit;
    if (!callback) {
      setIsSubmitting(false);
      return;
    }

    try {
      await callback({
        title: title.trim(),
        description: description.trim(),
        task_type: taskType,
        priority,
        story_points: Number(storyPoints) || 1,
        assigned_to: assigneeId && assigneeId.trim() ? assigneeId.trim() : null,
        sprint_id: sprintId && sprintId.trim() ? sprintId.trim() : null,
        epic_id: epicId && epicId.trim() ? epicId.trim() : null,
        due_date: dueDate || null,
        status: "TODO",
      });

      // Reset form on success
      setTitle("");
      setDescription("");
      setAssigneeId("");
      setDueDate("");
      setStoryPoints(1);
      setEpicId("");
      setPriority("MEDIUM");
      setTaskType("TASK");
      onClose();
    } catch (err) {
      console.error("Create task modal error:", err);
      setErrorMsg(err.message || "Failed to create item. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn overflow-y-auto"
    >
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-scaleIn m-auto">
        {/* Top Header with Brand Theme */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/60 shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-bold text-slate-900 text-sm sm:text-base">Create:</span>
            <div className="flex items-center gap-1 p-1 bg-slate-200/60 rounded-xl">
              <button
                type="button"
                onClick={() => setTaskType("TASK")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  taskType === "TASK"
                    ? "bg-brand-gradient text-white shadow-xs shadow-[#1f6fb2]/20"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Task
              </button>
              <button
                type="button"
                onClick={() => setTaskType("BUG")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  taskType === "BUG"
                    ? "bg-brand-gradient text-white shadow-xs shadow-[#1f6fb2]/20"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Bug
              </button>
            </div>
          </div>

          {/* Close button */}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="w-7 h-7 border border-slate-200 hover:border-slate-300 text-slate-400 hover:text-slate-700 rounded-lg flex items-center justify-center text-xs transition cursor-pointer disabled:opacity-50 shadow-2xs"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto text-xs">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-medium">
              {errorMsg}
            </div>
          )}

          {/* Section: Task / Bug Details */}
          <div className="space-y-3">
            <span className="text-[11px] font-bold text-[#1f6fb2] uppercase tracking-wider block">
              {taskType === "BUG" ? "Bug Details" : "Task Details"}
            </span>

            {/* Title / Name */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 block">
                {taskType === "BUG" ? "Bug Title" : "Task Title"} <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  taskType === "BUG"
                    ? "e.g. Task title fails to update on save"
                    : "e.g. Implement employee attendance export"
                }
                className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition font-medium"
              />
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 block">
                Description
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description or deliverable scope…"
                className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition font-medium resize-none"
              />
            </div>
          </div>

          {/* Section: Assignment & Schedule */}
          <div className="space-y-3 pt-2">
            <span className="text-[11px] font-bold text-[#1f6fb2] uppercase tracking-wider block">
              Assignment &amp; Schedule
            </span>

            {/* Owner (Assignee) */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 block">
                Assignee
              </label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition font-medium cursor-pointer"
              >
                <option value="">Unassigned</option>
                {assignableProjectEmployees.map((emp) => {
                  const roleLabel =
                    emp.designation ||
                    (emp.role
                      ? emp.role.charAt(0).toUpperCase() + emp.role.slice(1).replace(/_/g, " ")
                      : "Employee");
                  return (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} ({roleLabel})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Grid for Sprint & Epic */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {!isKanban && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 block">
                    Sprint
                  </label>
                  <select
                    value={sprintId}
                    onChange={(e) => handleSprintChange(e.target.value)}
                    className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition font-medium cursor-pointer"
                  >
                    <option value="">Backlog (Unscheduled)</option>
                    {sprints
                      .filter((s) => s.status !== "COMPLETED")
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.status})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  Epic
                </label>
                <select
                  value={epicId}
                  onChange={(e) => setEpicId(e.target.value)}
                  className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition font-medium cursor-pointer"
                >
                  <option value="">None</option>
                  {epics.map((epic) => (
                    <option key={epic.id} value={epic.id}>
                      {epic.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Grid for Priority, Story Points, Due Date */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition font-medium cursor-pointer"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  Story Points
                </label>
                <select
                  value={storyPoints}
                  onChange={(e) => setStoryPoints(Number(e.target.value))}
                  className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition font-medium cursor-pointer"
                >
                  {[1, 2, 3, 5, 8, 13, 21].map((pts) => (
                    <option key={pts} value={pts}>
                      {pts} {pts === 1 ? "point" : "points"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  Due Date
                </label>
                <input
                  type="date"
                  min={sprintMinDate || undefined}
                  max={sprintMaxDate || undefined}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs font-mono bg-white text-slate-900 outline-none shadow-2xs transition"
                />
              </div>
            </div>

            {!dateValidation.isValid && (
              <p className="text-[11px] text-rose-600 font-semibold pt-1">
                {dateValidation.error}
              </p>
            )}
          </div>

          {/* Bottom Action Buttons */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition cursor-pointer disabled:opacity-50 shadow-2xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim() || !dateValidation.isValid}
              className="px-4 py-2 rounded-xl bg-brand-gradient hover:opacity-95 text-white font-semibold text-xs transition cursor-pointer disabled:opacity-50 shadow-xs shadow-[#1f6fb2]/20 flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Creating…</span>
                </>
              ) : (
                <span>Create {taskType === "BUG" ? "Bug" : "Task"}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
