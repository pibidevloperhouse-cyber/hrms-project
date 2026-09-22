"use client";

import React, { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import SprintDetailModal from "./SprintDetailModal";
import TaskDetailModal from "./TaskDetailModal";
import ProjectTeamModal from "./ProjectTeamModal";

export default function ProjectOverviewTab({
  project,
  tasks = [],
  sprints = [],
  epics = [],
  departmentEmployees = [],
  teamLeads = [],
  employeeProfile,
  currentUserId,
  canManageTeam = false,
  onSelectTab,
  onRemoveMember,
  onTasksUpdated,
  onSprintsUpdated,
  onProjectUpdated,
}) {
  const [selectedSprintForModal, setSelectedSprintForModal] = useState(null);
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState(null);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);

  const allEmployeesPool = useMemo(() => {
    const map = new Map();
    (departmentEmployees || []).forEach((e) => {
      if (e?.id) map.set(e.id, e);
    });
    (teamLeads || []).forEach((l) => {
      if (l?.id) map.set(l.id, l);
    });
    (project?.teamMembers || []).forEach((m) => {
      if (m?.id) map.set(m.id, m);
    });
    return map;
  }, [departmentEmployees, teamLeads, project]);

  const resolvedSquadMembers = useMemo(() => {
    const map = new Map();
    if (Array.isArray(project?.teamMembers)) {
      project.teamMembers.forEach((m) => {
        if (m?.id) map.set(m.id, m);
      });
    }
    if (Array.isArray(project?.team_members)) {
      project.team_members.forEach((item) => {
        const id = typeof item === "object" ? item?.id : item;
        if (id && !map.has(id)) {
          const emp = typeof item === "object" ? item : allEmployeesPool.get(id);
          if (emp) map.set(id, emp);
        }
      });
    }
    return Array.from(map.values());
  }, [project, allEmployeesPool]);

  const resolvedOwner =
    project?.creator ||
    (project?.created_by ? allEmployeesPool.get(project.created_by) : null) ||
    (project?.owner_id ? allEmployeesPool.get(project.owner_id) : null);

  const resolvedLead =
    project?.teamLead ||
    (project?.team_lead_id ? allEmployeesPool.get(project.team_lead_id) : null);

  // Compute key analytics cleanly
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === "COMPLETED").length;
  const inProgressTasks = tasks.filter((t) => t.status === "IN_PROGRESS").length;
  const reviewTasks = tasks.filter((t) => t.status === "REVIEW").length;
  const todoTasks = tasks.filter((t) => t.status === "TODO").length;

  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const overdueTasks = tasks.filter(
    (t) => t.due_date && new Date(t.due_date) < new Date() && t.status !== "COMPLETED"
  ).length;

  const isKanban = (project?.project_type || "").toLowerCase() === "kanban";

  // Active Sprint
  const activeSprint = useMemo(() => {
    if (isKanban) return null;
    return sprints.find((s) => s.status === "ACTIVE") || null;
  }, [sprints, isKanban]);

  const handleUpdateSprintStatus = async (sprintId, newStatus) => {
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

      if (res.ok) {
        if (onSprintsUpdated) onSprintsUpdated();
        if (onTasksUpdated) onTasksUpdated();
      }
    } catch (err) {
      console.error("Update sprint status error:", err);
    }
  };

  // Team Workload calculation
  const memberWorkload = useMemo(() => {
    const workloadMap = {};

    tasks.forEach((t) => {
      const assigneeId = t.assigned_to || t.assignee_id;
      if (!assigneeId) return;

      if (!workloadMap[assigneeId]) {
        const emp =
          t.assignee ||
          departmentEmployees.find((e) => e.id === assigneeId) ||
          teamLeads.find((l) => l.id === assigneeId);

        workloadMap[assigneeId] = {
          id: assigneeId,
          name: emp?.full_name || "Assigned Member",
          email: emp?.email || "",
          role: emp?.designation || emp?.role || "Member",
          total: 0,
          completed: 0,
          inProgress: 0,
          todo: 0,
        };
      }

      workloadMap[assigneeId].total += 1;
      if (t.status === "COMPLETED") workloadMap[assigneeId].completed += 1;
      else if (t.status === "IN_PROGRESS") workloadMap[assigneeId].inProgress += 1;
      else workloadMap[assigneeId].todo += 1;
    });

    return Object.values(workloadMap);
  }, [tasks, departmentEmployees, teamLeads]);

  return (
    <div className="space-y-6 text-xs text-slate-800">
      {/* Pending Deliverable Review Alert for Team Leads & Managers */}
      {reviewTasks > 0 && (
        <div className="p-3.5 rounded-xl bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-blue-500/10 border border-purple-200/90 flex flex-wrap items-center justify-between gap-3 shadow-2xs animate-fadeIn">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
              🔍
            </span>
            <div>
              <h4 className="text-xs font-bold text-purple-950 flex items-center gap-2">
                <span>{reviewTasks} Deliverable{reviewTasks > 1 ? "s" : ""} Awaiting Review</span>
                <span className="px-1.5 py-0.2 rounded-full bg-purple-200 text-purple-900 text-[10px] font-bold animate-pulse">
                  Action Required
                </span>
              </h4>
              <p className="text-[11px] text-purple-700">
                Team members submitted completion notes &amp; proof screenshots for verification.
              </p>
            </div>
          </div>
          {onSelectTab && (
            <button
              type="button"
              onClick={() => onSelectTab("reviews")}
              className="px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition cursor-pointer shadow-xs flex items-center gap-1.5"
            >
              <span>Inspect &amp; Review Deliverables</span>
              <span>→</span>
            </button>
          )}
        </div>
      )}

      {/* 1. Key Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Progress Card */}
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Overall Progress</span>
            <span className="text-blue-600 font-bold">{completionRate}%</span>
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono">
            {completedTasks} <span className="text-xs font-normal text-slate-400">/ {totalTasks} Tasks</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>

        {/* Active Sprint Card (or Kanban Delivery Mode) */}
        {!isKanban ? (
          <div
            onClick={() => {
              if (activeSprint) setSelectedSprintForModal(activeSprint);
            }}
            className={`p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-2 transition ${
              activeSprint
                ? "hover:border-emerald-300 hover:shadow-xs cursor-pointer group"
                : ""
            }`}
            title={activeSprint ? "Click to view all tasks in active sprint popup" : ""}
          >
            <div className="flex items-center justify-between text-slate-500">
              <span className="font-semibold uppercase tracking-wider text-[10px]">Active Sprint</span>
              {activeSprint ? (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 group-hover:bg-emerald-100 transition">
                  Running ↗
                </span>
              ) : (
                <span className="text-[10px] text-slate-400">None</span>
              )}
            </div>
            <div className="text-sm font-bold text-slate-900 truncate group-hover:text-blue-600 transition">
              {activeSprint?.name || "No Active Sprint"}
            </div>
            <p className="text-[11px] text-slate-500 truncate">
              {activeSprint
                ? `${activeSprint.metrics?.completedTasks || 0} of ${activeSprint.metrics?.totalTasks || 0} tasks done • Click for details`
                : "Plan or start a sprint in Sprints tab"}
            </p>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-slate-500">
              <span className="font-semibold uppercase tracking-wider text-[10px]">Delivery Mode</span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                Continuous
              </span>
            </div>
            <div className="text-sm font-bold text-slate-900 truncate">
              Kanban Flow
            </div>
            <p className="text-[11px] text-slate-500 truncate">
              {inProgressTasks + reviewTasks} active WIP tasks on board
            </p>
          </div>
        )}

        {/* Epics Card */}
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Epics Tracked</span>
            <span className="text-indigo-600 font-bold">{epics.length}</span>
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono">
            {epics.filter((e) => e.status === "COMPLETED").length}{" "}
            <span className="text-xs font-normal text-slate-400">/ {epics.length} Done</span>
          </div>
          <p className="text-[11px] text-slate-500">Strategic milestone features</p>
        </div>

        {/* Overdue Card */}
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Overdue Tasks</span>
            {overdueTasks > 0 ? (
              <span className="w-2 h-2 rounded-full bg-rose-500" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            )}
          </div>
          <div className={`text-2xl font-bold font-mono ${overdueTasks > 0 ? "text-rose-600" : "text-slate-900"}`}>
            {overdueTasks}
          </div>
          <p className="text-[11px] text-slate-500">
            {overdueTasks > 0 ? "Past target completion date" : "All deliverables on schedule"}
          </p>
        </div>
      </div>

      {/* 2. Task Status Distribution */}
      <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Task Status Distribution
          </h3>
          <span className="text-[11px] text-slate-500 font-mono">{totalTasks} Total Deliverables</span>
        </div>

        {/* Multi-segment status bar */}
        {totalTasks > 0 ? (
          <div className="space-y-3">
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
              <div
                style={{ width: `${(completedTasks / totalTasks) * 100}%` }}
                className="bg-emerald-500 transition-all duration-300"
                title={`Completed: ${completedTasks}`}
              />
              <div
                style={{ width: `${(inProgressTasks / totalTasks) * 100}%` }}
                className="bg-sky-500 transition-all duration-300"
                title={`In Progress: ${inProgressTasks}`}
              />
              <div
                style={{ width: `${(reviewTasks / totalTasks) * 100}%` }}
                className="bg-purple-500 transition-all duration-300"
                title={`In Review: ${reviewTasks}`}
              />
              <div
                style={{ width: `${(todoTasks / totalTasks) * 100}%` }}
                className="bg-slate-300 transition-all duration-300"
                title={`To Do: ${todoTasks}`}
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                <span className="text-slate-600">To Do:</span>
                <strong className="text-slate-900 font-mono ml-auto">{todoTasks}</strong>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-sky-50/50 border border-sky-100">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                <span className="text-sky-900">In Progress:</span>
                <strong className="text-sky-900 font-mono ml-auto">{inProgressTasks}</strong>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-purple-50/50 border border-purple-100">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                <span className="text-purple-900">In Review:</span>
                <strong className="text-purple-900 font-mono ml-auto">{reviewTasks}</strong>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50/50 border border-emerald-100">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-emerald-900">Completed:</span>
                <strong className="text-emerald-900 font-mono ml-auto">{completedTasks}</strong>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-6 text-center text-slate-400 italic">
            No tasks created in this project yet. Add tasks from Backlog or Board.
          </div>
        )}
      </div>

      {/* 3. Team Member Workload Summary */}
      <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
          Team Member Workload
        </h3>

        {memberWorkload.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-medium">
                  <th className="py-2.5 px-3">Member</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3 text-center">To Do</th>
                  <th className="py-2.5 px-3 text-center">In Progress</th>
                  <th className="py-2.5 px-3 text-center">Completed</th>
                  <th className="py-2.5 px-3 text-right">Total</th>
                  <th className="py-2.5 px-3 text-right">Completion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {memberWorkload.map((m) => {
                  const mRate = m.total > 0 ? Math.round((m.completed / m.total) * 100) : 0;
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{m.name}</td>
                      <td className="py-2.5 px-3 text-slate-500">{m.role}</td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-600">{m.todo}</td>
                      <td className="py-2.5 px-3 text-center font-mono text-sky-700">{m.inProgress}</td>
                      <td className="py-2.5 px-3 text-center font-mono text-emerald-700">{m.completed}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">{m.total}</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="font-mono font-bold text-blue-600">{mRate}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-400 italic py-4 text-center">
            No team members assigned to tasks yet.
          </p>
        )}
      </div>

      {/* 4. Project Squad & Team Members */}
      <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-base">👥</span>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Project Squad &amp; Assigned Team
              </h3>
              {project?.project_group && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  {project.project_group}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              Only assigned team members and the team lead can receive tasks in this project.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsTeamModalOpen(true)}
            className="px-3.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 self-start sm:self-auto shadow-2xs"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <span>Manage Squad &amp; Team</span>
          </button>
        </div>

        {/* Members Pills & Roles */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Team Lead Pill */}
          {resolvedLead && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-cyan-50/80 border border-cyan-200 text-cyan-900 text-xs shadow-2xs">
              <span className="text-sm">👑</span>
              <div className="min-w-0">
                <span className="font-bold block truncate">{resolvedLead.full_name}</span>
                <span className="text-[10px] text-cyan-700 block">Team Lead</span>
              </div>
            </div>
          )}

          {/* Project Owner / Creator Pill */}
          {resolvedOwner && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs shadow-2xs">
              <span className="text-sm">👤</span>
              <div className="min-w-0">
                <span className="font-bold block truncate">{resolvedOwner.full_name}</span>
                <span className="text-[10px] text-amber-700 block">Owner / Creator</span>
              </div>
            </div>
          )}

          {/* Team Members */}
          {resolvedSquadMembers.length > 0 ? (
            resolvedSquadMembers.map((m) => (
              <div
                key={m.id}
                className="group flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50/80 hover:bg-slate-100/80 border border-slate-200/80 text-slate-800 text-xs transition shadow-2xs"
                title={`${m.full_name} (${m.designation || m.role || "Member"}${m.email ? ` • ${m.email}` : ""})`}
              >
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px]">
                  {m.full_name ? m.full_name.charAt(0).toUpperCase() : "?"}
                </div>
                <div className="min-w-0">
                  <span className="font-semibold block truncate">{m.full_name}</span>
                  <span className="text-[10px] text-slate-500 block">{m.designation || m.role || "Squad Member"}</span>
                </div>
                {canManageTeam && onRemoveMember && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveMember(m);
                    }}
                    className="opacity-60 group-hover:opacity-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold transition cursor-pointer ml-1"
                    title={`Remove ${m.full_name} from project`}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))
          ) : !resolvedLead && !resolvedOwner ? (
            <span className="text-xs text-slate-400 italic">
              No individual team members assigned yet. Click &quot;Manage Squad &amp; Team&quot; to add software engineers or specialists.
            </span>
          ) : null}
        </div>
      </div>

      {/* 5. Project Information & Attributes */}
      <div className="p-5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
          Project Metadata
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-slate-500 block text-[11px]">Owner (Creator)</span>
            <span className="font-semibold text-slate-900">{project?.creator?.full_name || "You"}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[11px]">Team Lead</span>
            <span className="font-semibold text-slate-900">{project?.teamLead?.full_name || "Unassigned"}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[11px]">Methodology</span>
            <span className="font-semibold text-slate-900">{project?.project_type || "Scrum"}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[11px]">Project Squad / Group</span>
            <span className="font-semibold text-slate-900">{project?.project_group || "General"}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[11px]">Start Date</span>
            <span className="font-mono text-slate-900">{project?.start_date || "—"}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[11px]">Target End Date</span>
            <span className="font-mono text-slate-900">{project?.end_date || "—"}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[11px]">Current Status</span>
            <span className="font-semibold text-slate-900">{project?.status || "PLANNING"}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[11px]">Priority</span>
            <span className="font-semibold text-slate-900">{project?.priority || "MEDIUM"}</span>
          </div>
        </div>
      </div>

      {/* Team Management Modal */}
      {isTeamModalOpen && (
        <ProjectTeamModal
          isOpen={isTeamModalOpen}
          onClose={() => setIsTeamModalOpen(false)}
          project={project}
          tasks={tasks}
          departmentEmployees={departmentEmployees}
          teamLeads={teamLeads}
          onProjectUpdated={(updated) => {
            if (onProjectUpdated) onProjectUpdated(updated);
          }}
        />
      )}

      {/* Sprint Detail Tasks Popup Modal (Scrum / Custom Agile only) */}
      {selectedSprintForModal && !isKanban && (
        <SprintDetailModal
          sprint={
            sprints.find((s) => s.id === selectedSprintForModal.id) || selectedSprintForModal
          }
          project={project}
          tasks={tasks}
          epics={epics}
          departmentEmployees={departmentEmployees}
          teamLeads={teamLeads}
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

      {/* Project Team Modal */}
      {isTeamModalOpen && (
        <ProjectTeamModal
          isOpen={isTeamModalOpen}
          onClose={() => setIsTeamModalOpen(false)}
          project={project}
          tasks={tasks}
          departmentEmployees={departmentEmployees}
          teamLeads={teamLeads}
          onProjectUpdated={onProjectUpdated}
        />
      )}
    </div>
  );
}
