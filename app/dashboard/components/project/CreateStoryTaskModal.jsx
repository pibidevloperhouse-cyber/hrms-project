/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  checkTaskSprintOverdue,
  validateTaskSprintBounds,
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
    return sprints.find((s) => s.id === sprintId);
  }, [sprints, sprintId, isKanban]);

  const sprintMinDate = useMemo(() => {
    return selectedSprint?.start_date ? selectedSprint.start_date.split("T")[0] : "";
  }, [selectedSprint]);

  const sprintMaxDate = useMemo(() => {
    return selectedSprint?.end_date ? selectedSprint.end_date.split("T")[0] : "";
  }, [selectedSprint]);

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
      const minD = targetSprint.start_date ? targetSprint.start_date.split("T")[0] : "";
      const maxD = targetSprint.end_date ? targetSprint.end_date.split("T")[0] : "";

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

  // Strict Project Squad Filter: ONLY employees belonging to this project (Owner, Lead, Squad Members)
  const projectTeamEmployees = useMemo(() => {
    const map = new Map();
    const sourcePool = Array.isArray(allEmployees) ? allEmployees : [];

    // 1. Team Lead
    if (project?.teamLead?.id) {
      map.set(project.teamLead.id, { ...project.teamLead, roleTag: "Team Lead" });
    } else if (project?.team_lead_id) {
      const lead = sourcePool.find((e) => e.id === project.team_lead_id);
      if (lead) map.set(lead.id, { ...lead, roleTag: "Team Lead" });
    }

    // 2. Project Owner / Creator
    if (project?.creator?.id) {
      map.set(project.creator.id, { ...project.creator, roleTag: "Owner" });
    } else if (project?.created_by || project?.owner_id) {
      const ownerId = project.owner_id || project.created_by;
      const owner = sourcePool.find((e) => e.id === ownerId);
      if (owner) map.set(owner.id, { ...owner, roleTag: "Owner" });
    }

    // 3. Explicit Team Members (from project.teamMembers objects or project.team_members IDs)
    if (Array.isArray(project?.teamMembers)) {
      project.teamMembers.forEach((m) => {
        if (m?.id && !map.has(m.id)) {
          map.set(m.id, {
            ...m,
            roleTag: project?.project_group ? project.project_group : (m.designation || m.role || "Squad Member"),
          });
        }
      });
    }

    if (Array.isArray(project?.team_members)) {
      project.team_members.forEach((memberId) => {
        const cleanId = typeof memberId === "object" ? memberId?.id : memberId;
        if (cleanId && !map.has(cleanId)) {
          const emp = typeof memberId === "object" ? memberId : sourcePool.find((e) => e.id === cleanId);
          if (emp) {
            map.set(cleanId, {
              ...emp,
              roleTag: project?.project_group ? project.project_group : (emp.designation || emp.role || "Squad Member"),
            });
          }
        }
      });
    }

    return Array.from(map.values()).sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
  }, [project, allEmployees]);

  // Real-time selected assignee details & sprint workload
  const selectedAssignee = useMemo(() => {
    return projectTeamEmployees.find((e) => e.id === assigneeId) || null;
  }, [projectTeamEmployees, assigneeId]);

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
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn overflow-y-auto"
    >
      <div className="relative w-full max-w-xl bg-white rounded-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-scaleIn m-auto">
        {/* Top Header with Blue Theme: Task and Bug */}
        <div className="px-6 pt-4 pb-2.5 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-3 text-base">
            <span className="font-bold text-slate-900 text-sm">Create:</span>
            <div className="flex items-center gap-4 text-sm">
              <button
                type="button"
                onClick={() => setTaskType("TASK")}
                className={`transition-colors cursor-pointer pb-0.5 ${
                  taskType === "TASK"
                    ? "text-blue-600 font-semibold border-b-2 border-blue-600"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Task
              </button>
              <button
                type="button"
                onClick={() => setTaskType("BUG")}
                className={`transition-colors cursor-pointer pb-0.5 ${
                  taskType === "BUG"
                    ? "text-blue-600 font-semibold border-b-2 border-blue-600"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Bug
              </button>
            </div>
          </div>

          {/* Red square close button */}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="w-6 h-6 border border-rose-300 hover:border-rose-400 text-rose-400 hover:text-rose-600 rounded flex items-center justify-center text-xs transition cursor-pointer disabled:opacity-50"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Form Body - Full view, scrollable feature removed */}
        <form onSubmit={handleSubmit} className="px-6 py-3 space-y-2.5">
          {errorMsg && (
            <div className="p-2 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {errorMsg}
            </div>
          )}

          {/* Row: Name / Title with red underline indicator */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
            <label className="sm:w-32 text-xs text-slate-700 font-medium shrink-0">
              <span className="border-b-2 border-rose-500 pb-0.5">
                {taskType === "BUG" ? "Bug Name" : "Task Name"}
              </span>
            </label>
            <div className="flex-1">
              <input
                type="text"
                required
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  taskType === "BUG"
                    ? "e.g., Task title fails to update on save"
                    : "e.g., Implement employee attendance export"
                }
                className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-0.5 text-xs bg-transparent text-slate-900 transition-colors placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Row: Description */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1">
            <label className="sm:w-32 text-xs text-slate-700 font-medium shrink-0 pt-0.5">
              Description
            </label>
            <div className="flex-1">
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description or details…"
                className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-0.5 text-xs bg-transparent text-slate-900 resize-none transition-colors placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Section Divider: Default Section in Blue */}
          <div className="text-blue-600 font-semibold border-b border-blue-500 pb-0.5 text-xs pt-1">
            Default Section
          </div>

          {/* Row: Owner (Assignee) */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-0.5">
            <label className="sm:w-32 text-xs text-slate-700 font-medium shrink-0 pt-0.5">
              Owner
            </label>
            <div className="flex-1 space-y-1">
              <div className="relative">
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-0.5 text-xs bg-transparent text-slate-900 appearance-none pr-6 cursor-pointer"
                >
                  <option value="">Unassigned</option>
                  {projectTeamEmployees.map((emp) => {
                    const load = getEmployeeSprintWorkload(emp.id, sprintId, tasks);
                    const tag = emp.roleTag ? `[${emp.roleTag}] ` : "";
                    return (
                      <option key={emp.id} value={emp.id}>
                        {tag}{emp.full_name} {emp.designation ? `(${emp.designation})` : ""} {sprintId ? `— ${load.count} sprint tasks` : `— ${load.count} active`}
                      </option>
                    );
                  })}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center text-blue-600 text-xs pb-0.5">
                  ▼
                </div>
              </div>
              <div className="text-[10px] text-slate-500 flex items-start gap-1 pt-0.5 bg-slate-50/80 p-1.5 rounded border border-slate-100">
                <span className="text-blue-600 font-semibold shrink-0">ℹ️ Note:</span>
                <span>
                  Only members included in this project are shown. To assign tasks to other colleagues, first add them to this project via the <strong>Team</strong> tab.
                </span>
              </div>
            </div>
          </div>

          {/* Row: Sprint Allocation (Scrum / Custom Agile only) */}
          {!isKanban && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-0.5">
              <label className="sm:w-32 text-xs text-slate-700 font-medium shrink-0">
                Sprint
              </label>
              <div className="flex-1 relative">
                <select
                  value={sprintId}
                  onChange={(e) => handleSprintChange(e.target.value)}
                  className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-0.5 text-xs bg-transparent text-slate-900 appearance-none pr-6 cursor-pointer"
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
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center text-blue-600 text-xs">
                  ▼
                </div>
              </div>
            </div>
          )}

          {/* Row: Priority */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-0.5">
            <label className="sm:w-32 text-xs text-slate-700 font-medium shrink-0">
              Priority
            </label>
            <div className="flex-1 relative">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-0.5 text-xs bg-transparent text-slate-900 appearance-none pr-6 cursor-pointer"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center text-blue-600 text-xs">
                ▼
              </div>
            </div>
          </div>

          {/* Row: Story Points */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-0.5">
            <label className="sm:w-32 text-xs text-slate-700 font-medium shrink-0">
              Story Points
            </label>
            <div className="flex-1 relative">
              <select
                value={storyPoints}
                onChange={(e) => setStoryPoints(Number(e.target.value))}
                className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-0.5 text-xs bg-transparent text-slate-900 appearance-none pr-6 cursor-pointer"
              >
                {[1, 2, 3, 5, 8, 13, 21].map((pts) => (
                  <option key={pts} value={pts}>
                    {pts} {pts === 1 ? "point" : "points"}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center text-blue-600 text-xs">
                ▼
              </div>
            </div>
          </div>

          {/* Row: Epic */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-0.5">
            <label className="sm:w-32 text-xs text-slate-700 font-medium shrink-0">
              Epic
            </label>
            <div className="flex-1 relative">
              <select
                value={epicId}
                onChange={(e) => setEpicId(e.target.value)}
                className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-0.5 text-xs bg-transparent text-slate-900 appearance-none pr-6 cursor-pointer"
              >
                <option value="">--None--</option>
                {epics.map((epic) => (
                  <option key={epic.id} value={epic.id}>
                    {epic.name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center text-blue-600 text-xs">
                ▼
              </div>
            </div>
          </div>

          {/* Row: Due Date (Strictly locked to sprint week) */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-0.5">
            <label className="sm:w-32 text-xs text-slate-700 font-medium shrink-0 pt-0.5">
              Due Date
            </label>
            <div className="flex-1 space-y-0.5">
              <input
                type="date"
                min={sprintMinDate || undefined}
                max={sprintMaxDate || undefined}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-0.5 text-xs bg-transparent text-slate-900"
              />
              {selectedSprint && (
                <p className="text-[10px] text-blue-700 font-medium pt-0.5">
                  Locked to sprint window: {sprintMinDate || "Start"} to {sprintMaxDate || "End"}
                </p>
              )}
              {!dateValidation.isValid && (
                <p className="text-[10px] text-rose-600 font-semibold pt-0.5">
                  ❌ {dateValidation.error}
                </p>
              )}
            </div>
          </div>

          {/* Bottom Action Buttons: Blue Create & Clean Cancel */}
          <div className="pt-3 pb-1 flex items-center gap-3">
            <button
              type="submit"
              disabled={isSubmitting || !title.trim() || !dateValidation.isValid}
              className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs transition cursor-pointer disabled:opacity-50 shadow-xs"
            >
              {isSubmitting ? "Creating…" : "Create"}
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-xs transition cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
