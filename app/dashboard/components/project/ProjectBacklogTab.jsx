/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { authFetch } from "@/lib/api/authFetch";
import TaskDetailModal from "./TaskDetailModal";
import CreateStoryTaskModal from "./CreateStoryTaskModal";
import ToastNotification from "../common/ToastNotification";

export default function ProjectBacklogTab({
  project,
  tasks = [],
  sprints = [],
  epics = [],
  departmentEmployees = [],
  teamLeads = [],
  employeeProfile,
  currentUserId,
  onTasksUpdated,
  onSprintsUpdated,
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

  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [epicFilter, setEpicFilter] = useState("all");
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState(null);
  const [toastMsg, setToastMsg] = useState(null); // { message, type }

  const showNotificationToast = (message, type = "info") => {
    setToastMsg({ message, type });
  };

  const isKanban = (project?.project_type || "").toLowerCase() === "kanban";

  const normalizeSprintStatus = (status) => {
    const s = String(status || "").trim().toUpperCase();
    if (["ACTIVE", "IN_PROGRESS", "RUNNING", "STARTED", "CURRENT"].includes(s)) return "ACTIVE";
    if (["COMPLETED", "DONE", "FINISHED", "CLOSED"].includes(s)) return "COMPLETED";
    return "PLANNED";
  };

  // Filter tasks that match search, priority, and epic
  const taskMatchesFilter = (t) => {
    const matchSearch =
      !search.trim() ||
      t.title?.toLowerCase().includes(search.toLowerCase().trim()) ||
      t.assignee?.full_name?.toLowerCase().includes(search.toLowerCase().trim());
    const matchPriority = priorityFilter === "all" || (t.priority || "MEDIUM").toUpperCase() === priorityFilter;
    const matchEpic = epicFilter === "all" || t.epic_id === epicFilter;
    return matchSearch && matchPriority && matchEpic;
  };

  // All Active and Planned Sprints for assign dropdown selectors
  const activeAndPlannedSprints = useMemo(() => {
    return (sprints || []).filter((s) => {
      const norm = normalizeSprintStatus(s.status);
      return norm === "ACTIVE" || norm === "PLANNED";
    });
  }, [sprints]);

  // Tasks in Backlog: ONLY tasks that are NOT assigned to any sprint
  const backlogTasks = useMemo(() => {
    return tasks.filter((t) => {
      const rawSprintId = t.sprint_id || t.sprint?.id;
      const hasAssignedSprint = Boolean(
        rawSprintId &&
        String(rawSprintId).trim() !== "" &&
        String(rawSprintId).trim() !== "null" &&
        String(rawSprintId).trim() !== "undefined" &&
        String(rawSprintId).trim() !== "backlog"
      );

      // Once a task is assigned to a sprint, NEVER show it in the backlog
      if (hasAssignedSprint) {
        return false;
      }

      return taskMatchesFilter(t);
    });
  }, [tasks, search, priorityFilter, epicFilter]);

  // Create Story or Backlog Item via Modal
  const handleCreateBacklogItem = async (taskPayload) => {
    const res = await authFetch(`/api/projects/${project.id}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(taskPayload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || "Failed to create item.");
    }

    const targetSprintObj = sprints.find((s) => s.id === taskPayload.sprint_id);
    const targetEpicObj = epics.find((e) => e.id === taskPayload.epic_id);
    const destinationMsg = targetSprintObj
      ? `assigned to Sprint "${targetSprintObj.name}"`
      : "added to Backlog";
    const epicMsg = targetEpicObj ? ` and linked to Epic "${targetEpicObj.name}"` : "";

    showNotificationToast(`✓ Task created: ${destinationMsg}${epicMsg}.`, "success");
    if (onTasksUpdated) onTasksUpdated();
  };

  // Move task to a Sprint or to Backlog
  const handleMoveToSprint = async (taskId, targetSprintId) => {
    try {
      const movingTask = tasks.find((t) => t.id === taskId);
      if (!movingTask) return;

      let targetDueDate = movingTask.due_date;
      let targetSprintObj = null;

      if (targetSprintId && targetSprintId !== "backlog") {
        targetSprintObj = sprints.find((s) => s.id === targetSprintId);
        if (targetSprintObj) {
          const sprintStart = targetSprintObj.start_date ? targetSprintObj.start_date.split("T")[0] : null;
          const sprintEnd = targetSprintObj.end_date ? targetSprintObj.end_date.split("T")[0] : null;
          if (sprintEnd) {
            if (!targetDueDate || (sprintStart && targetDueDate < sprintStart) || (targetDueDate > sprintEnd)) {
              targetDueDate = sprintEnd;
            }
          }
        }
      }

      const res = await authFetch(`/api/projects/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sprint_id: (targetSprintId === "backlog" || !targetSprintId) ? null : targetSprintId,
          due_date: targetDueDate,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        const msg = targetSprintObj
          ? `✓ Assigned to Sprint "${targetSprintObj.name}".`
          : "✓ Moved to Backlog.";
        showNotificationToast(msg, "success");
        if (onTasksUpdated) onTasksUpdated();
      } else {
        showNotificationToast(data.message || "Failed to assign task to sprint.", "error");
      }
    } catch (err) {
      console.error("Failed to move task to sprint:", err);
      showNotificationToast(err.message || "Network error moving task to sprint.", "error");
    }
  };

  // Assign or Change Epic
  const handleAssignEpic = async (taskId, epicId) => {
    try {
      const res = await authFetch(`/api/projects/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          epic_id: epicId || null,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        const assignedEpic = epics.find((e) => e.id === epicId);
        showNotificationToast(
          assignedEpic
            ? `✓ Epic set to "${assignedEpic.name}".`
            : "✓ Epic removed from task.",
          "success"
        );
        if (onTasksUpdated) onTasksUpdated();
      } else {
        showNotificationToast(data.message || "Failed to assign epic.", "error");
      }
    } catch (err) {
      console.error("Failed to assign epic:", err);
      showNotificationToast(err.message || "Network error assigning epic.", "error");
    }
  };

  // Render individual backlog task row
  const renderTaskRow = (item) => {
    const linkedEpic = item.epic || epics.find((e) => e.id === item.epic_id);
    const assignee =
      item.assignee ||
      item.planned_assignee ||
      allEmployees.find((e) => e.id === (item.assigned_to || item.planned_assignee_id || item.assignee_id));

    return (
      <div
        key={item.id}
        onClick={() => setSelectedTaskForDetail(item)}
        className="py-3 px-3.5 hover:bg-slate-50/90 rounded-lg transition flex flex-wrap items-center justify-between gap-3 cursor-pointer group border border-transparent hover:border-slate-200"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              item.status === "COMPLETED"
                ? "bg-emerald-500"
                : item.status === "IN_PROGRESS"
                ? "bg-sky-500"
                : item.status === "REVIEW"
                ? "bg-purple-500"
                : "bg-slate-400"
            }`}
          />
          <span className="font-semibold text-slate-900 truncate text-xs group-hover:text-blue-600 transition">
            {item.title}
          </span>

          {/* Detailed description icon */}
          {item.description && (
            <span
              title="Contains detailed description. Click to view."
              className="text-[11px] text-slate-400 shrink-0"
            >
              📄
            </span>
          )}

          {/* Status badge */}
          {item.status && item.status !== "TODO" && (
            <span
              className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                item.status === "IN_PROGRESS"
                  ? "bg-sky-50 text-sky-700 border-sky-200"
                  : item.status === "REVIEW"
                  ? "bg-purple-50 text-purple-700 border-purple-200"
                  : item.status === "COMPLETED"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-slate-100 text-slate-600 border-slate-200"
              }`}
            >
              {item.status} {item.progress > 0 ? `${item.progress}%` : ""}
            </span>
          )}

          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0 font-medium">
            {item.story_points || 1} pts
          </span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Epic Assign Dropdown */}
          <select
            value={item.epic_id || ""}
            onChange={(e) => handleAssignEpic(item.id, e.target.value)}
            className={`h-7 px-2 text-[10px] font-semibold rounded border cursor-pointer focus:outline-none transition ${
              linkedEpic
                ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
            }`}
            title="Assign or change Epic"
          >
            <option value="">No Epic</option>
            {epics.map((ep) => (
              <option key={ep.id} value={ep.id}>
                ⚡ {ep.name}
              </option>
            ))}
          </select>

          {/* Priority Badge */}
          <span
            className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase ${
              (item.priority || "").toUpperCase() === "URGENT"
                ? "bg-rose-50 text-rose-700 border border-rose-200"
                : (item.priority || "").toUpperCase() === "HIGH"
                ? "bg-orange-50 text-orange-700 border border-orange-200"
                : (item.priority || "").toUpperCase() === "MEDIUM"
                ? "bg-amber-50 text-amber-700 border border-amber-200"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {item.priority || "MEDIUM"}
          </span>

          {/* Assignee */}
          {assignee ? (
            <div className="flex items-center gap-1.5 w-24 truncate justify-end">
              <span className="text-[11px] font-medium text-slate-700 truncate">{assignee.full_name}</span>
            </div>
          ) : (
            <span className="text-[11px] text-slate-400 italic w-24 text-right">Unassigned</span>
          )}

          {/* Assign to Sprint dropdown selector (Scrum only) */}
          {!isKanban && (
            <select
              value="backlog"
              onChange={(e) => {
                const val = e.target.value;
                if (val && val !== "backlog") {
                  handleMoveToSprint(item.id, val);
                }
              }}
              className="h-7 px-2.5 text-[10px] font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-blue-400 focus:outline-none cursor-pointer shadow-2xs"
              title="Assign this task to a Sprint"
            >
              <option value="backlog">📋 Backlog (Unassigned)</option>
              {activeAndPlannedSprints.map((s) => {
                const isAct = normalizeSprintStatus(s.status) === "ACTIVE";
                return (
                  <option key={s.id} value={s.id}>
                    {isAct ? "⚡ " : "🏃 "} {s.name} ({s.status})
                  </option>
                );
              })}
            </select>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5 text-xs text-slate-800 animate-fadeIn">
      {/* Top Action & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2.5 flex-wrap flex-1 min-w-[240px]">
          <input
            id="backlog-search-input"
            type="text"
            placeholder="Search tasks, deliverables, assignees…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 h-8.5 px-3 rounded-lg border border-slate-300 bg-white text-xs focus:outline-none focus:border-blue-600 transition shadow-2xs"
          />

          <select
            id="backlog-priority-filter"
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

          {epics.length > 0 && (
            <select
              id="backlog-epic-filter"
              value={epicFilter}
              onChange={(e) => setEpicFilter(e.target.value)}
              className="h-8.5 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-medium focus:outline-none focus:border-blue-600 cursor-pointer shadow-2xs"
            >
              <option value="all">All Epics</option>
              {epics.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  ⚡ {ep.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <button
          id="backlog-add-task-btn"
          type="button"
          onClick={() => setIsAddingItem(true)}
          className="h-8.5 px-3.5 rounded-lg bg-brand-gradient hover:opacity-95 text-white font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-xs shadow-[#1f6fb2]/20 shrink-0 text-xs"
        >
          <span>+</span>
          <span>Add Task</span>
        </button>
      </div>

      {/* Professional Create Task / Bug Modal Popup (defaults to unassigned backlog) */}
      <CreateStoryTaskModal
        isOpen={isAddingItem}
        onClose={() => setIsAddingItem(false)}
        project={project}
        tasks={tasks}
        sprints={sprints}
        epics={epics}
        allEmployees={allEmployees}
        defaultSprintId=""
        onCreateTask={handleCreateBacklogItem}
      />

      {/* PRODUCT BACKLOG LIST SECTION (Only unassigned tasks) */}
      <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-2xs space-y-3">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900 text-xs">
              {isKanban ? "Continuous Backlog" : "Product Backlog"}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 font-mono">
              {backlogTasks.length} {backlogTasks.length === 1 ? "task" : "tasks"}
            </span>
          </div>
        </div>

        {backlogTasks.length === 0 ? (
          <div className="py-16 text-center bg-slate-50/60 rounded-xl border border-dashed border-slate-200 my-1">
            <p className="font-medium text-slate-500 text-xs">No unassigned backlog items</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {backlogTasks.map(renderTaskRow)}
          </div>
        )}
      </div>

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

      {/* Realistic SaaS Toast Notification */}
      <ToastNotification
        toast={toastMsg}
        onClose={() => setToastMsg(null)}
        duration={5500}
      />
    </div>
  );
}
