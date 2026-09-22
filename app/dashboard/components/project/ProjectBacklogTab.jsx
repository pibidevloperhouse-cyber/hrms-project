/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import TaskDetailModal from "./TaskDetailModal";
import CreateStoryTaskModal from "./CreateStoryTaskModal";
import { checkTaskSprintOverdue } from "@/lib/projectUtils";

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
  const [defaultSprintForModal, setDefaultSprintForModal] = useState("");
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState(null);
  const [toastMsg, setToastMsg] = useState(null); // { message, type }

  useEffect(() => {
    if (toastMsg) {
      const timer = setTimeout(() => setToastMsg(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [toastMsg]);

  const showNotificationToast = (message, type = "info") => {
    setToastMsg({ message, type });
  };

  const isKanban = (project?.project_type || "").toLowerCase() === "kanban";

  // Filter tasks that match search, priority, and epic
  const taskMatchesFilter = (t) => {
    const matchSearch =
      !search.trim() ||
      t.title?.toLowerCase().includes(search.toLowerCase().trim()) ||
      t.assignee?.full_name?.toLowerCase().includes(search.toLowerCase().trim());
    const matchPriority = priorityFilter === "all" || t.priority === priorityFilter;
    const matchEpic = epicFilter === "all" || t.epic_id === epicFilter;
    return matchSearch && matchPriority && matchEpic;
  };

  // Tasks in Backlog (unscheduled in Scrum, or unstarted/continuous in Kanban)
  const backlogTasks = useMemo(() => {
    return tasks.filter((t) => {
      const isUnscheduled = !t.sprint_id || !sprints.some((s) => s.id === t.sprint_id);
      if (isKanban) {
        return (t.status === "TODO" || !t.status) && taskMatchesFilter(t);
      }
      return isUnscheduled && taskMatchesFilter(t);
    });
  }, [tasks, sprints, search, priorityFilter, epicFilter, isKanban]);

  // Active and Planned Sprints
  const activeAndPlannedSprints = useMemo(() => {
    return sprints.filter((s) => s.status !== "COMPLETED");
  }, [sprints]);

  // Create Story or Backlog Item via Modal
  const handleCreateBacklogItem = async (taskPayload) => {
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

      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      let targetDueDate = movingTask.due_date;
      let targetSprintObj = null;

      if (targetSprintId) {
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

      const res = await fetch(`/api/projects/tasks/${taskId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          sprint_id: targetSprintId || null,
          due_date: targetDueDate,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        const msg = targetSprintObj
          ? `✓ Moved to Sprint "${targetSprintObj.name}".`
          : "✓ Moved to Backlog (Unscheduled).";
        showNotificationToast(msg, "success");
        if (onTasksUpdated) onTasksUpdated();
      } else {
        showNotificationToast(data.message || "Failed to move task to sprint.", "error");
      }
    } catch (err) {
      console.error("Failed to move task to sprint:", err);
      showNotificationToast(err.message || "Network error moving task to sprint.", "error");
    }
  };

  // Assign or Change Epic
  const handleAssignEpic = async (taskId, epicId) => {
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

  const openCreateModal = (sprintId = "") => {
    setDefaultSprintForModal(sprintId);
    setIsAddingItem(true);
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
            className="w-full sm:w-64 h-8.5 px-3 rounded-lg border border-slate-300 bg-white text-xs focus:outline-none focus:border-blue-600 transition"
          />

          <select
            id="backlog-priority-filter"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="h-8.5 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-medium focus:outline-none focus:border-blue-600 cursor-pointer"
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
              className="h-8.5 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-medium focus:outline-none focus:border-blue-600 cursor-pointer"
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
          onClick={() => openCreateModal("")}
          className="h-8.5 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs shrink-0"
        >
          <span>+</span>
          <span>Add Task</span>
        </button>
      </div>

      {/* Professional Create Task / Bug Modal Popup */}
      <CreateStoryTaskModal
        isOpen={isAddingItem}
        onClose={() => {
          setIsAddingItem(false);
          setDefaultSprintForModal("");
        }}
        project={project}
        tasks={tasks}
        sprints={sprints}
        epics={epics}
        allEmployees={allEmployees}
        defaultSprintId={defaultSprintForModal}
        onCreateTask={handleCreateBacklogItem}
      />



      {/* BACKLOG SECTION (Unscheduled / Unstarted Deliverables) */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <span className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <span>📋</span> Backlog Deliverables ({backlogTasks.length})
          </span>
          <span className="text-[10px] text-slate-400">
            {isKanban
              ? "Continuous backlog tasks ready for prioritization & board execution"
              : "Unscheduled tasks waiting for sprint allocation"}
          </span>
        </div>

        {backlogTasks.length === 0 ? (
          <div className="py-8 text-center text-slate-400 italic">
            No backlog items found. Click &quot;+ Add Task&quot; above to create items.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {backlogTasks.map((item) => {
              const linkedEpic = item.epic || epics.find((e) => e.id === item.epic_id);
              const assignee =
                item.assignee ||
                item.planned_assignee ||
                allEmployees.find((e) => e.id === (item.assigned_to || item.planned_assignee_id || item.assignee_id));

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedTaskForDetail(item)}
                  className="py-2.5 px-2 hover:bg-slate-50/80 rounded-lg transition flex flex-wrap items-center justify-between gap-3 cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                    <span className="font-semibold text-slate-900 truncate text-xs group-hover:text-blue-600 transition">
                      {item.title}
                    </span>

                    {/* Detailed description badge */}
                    {item.description && (
                      <span
                        title="Contains detailed description. Click to view."
                        className="text-[11px] text-slate-400 shrink-0"
                      >
                        📄
                      </span>
                    )}

                    {/* Status & Progress badge for in-progress backlog items */}
                    {item.status && item.status !== "TODO" && (
                      <span
                        className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border shrink-0 ${
                          item.status === "IN_PROGRESS"
                            ? "bg-sky-50 text-sky-700 border-sky-200"
                            : item.status === "REVIEW"
                            ? "bg-purple-50 text-purple-700 border-purple-200"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                        title={`Task is currently ${item.status} with ${item.progress || 0}% progress`}
                      >
                        {item.status} {item.progress > 0 ? `${item.progress}%` : ""}
                      </span>
                    )}

                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 shrink-0">
                      {item.story_points || 1} pts
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {/* Epic Assign Dropdown */}
                    <select
                      value={item.epic_id || ""}
                      onChange={(e) => handleAssignEpic(item.id, e.target.value)}
                      className={`h-6.5 px-2 text-[10px] font-semibold rounded border cursor-pointer focus:outline-none transition ${
                        linkedEpic
                          ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                          : "bg-white text-slate-400 border-slate-200 hover:border-slate-300"
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
                        item.priority === "URGENT"
                          ? "bg-rose-50 text-rose-700 border border-rose-200"
                          : item.priority === "HIGH"
                          ? "bg-orange-50 text-orange-700 border border-orange-200"
                          : item.priority === "MEDIUM"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {item.priority}
                    </span>

                    {/* Assignee */}
                    {assignee ? (
                      <div className="flex items-center gap-1.5 w-24 truncate justify-end">
                        <span className="text-[11px] font-medium text-slate-700 truncate">{assignee.full_name}</span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic w-24 text-right">Unassigned</span>
                    )}

                    {/* Move to Sprint dropdown (Scrum / Custom Agile only) */}
                    {!isKanban && activeAndPlannedSprints.length > 0 && (
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) handleMoveToSprint(item.id, e.target.value);
                        }}
                        className="h-7 px-2 text-[10px] font-semibold rounded border border-blue-200 bg-blue-50/50 text-blue-700 hover:bg-blue-100/60 focus:outline-none cursor-pointer"
                      >
                        <option value="" disabled>
                          Move to Sprint…
                        </option>
                        {activeAndPlannedSprints.map((s) => {
                          const optWarning = checkTaskSprintOverdue(item.due_date, s);
                          return (
                            <option key={s.id} value={s.id}>
                              {optWarning ? `⚠️ ${s.name} (+${optWarning.diffDays}d overdue)` : `${s.name} (${s.status})`}
                            </option>
                          );
                        })}
                      </select>
                    )}
                  </div>
                </div>
              );
            })}
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
