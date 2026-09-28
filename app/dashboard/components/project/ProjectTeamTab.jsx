"use client";

import React, { useState, useMemo } from "react";
import TaskDetailModal from "./TaskDetailModal";
import EmployeeTaskProgressModal from "./EmployeeTaskProgressModal";

export default function ProjectTeamTab({
  project,
  tasks = [],
  sprints = [],
  epics = [],
  projectRoster = [],
  departmentEmployees = [],
  teamLeads = [],
  employeeProfile = null,
  currentUserId,
  canManageTeam = false,
  onRemoveMember,
  onOpenTeamModal,
  onTasksUpdated,
  onProjectUpdated,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMemberForTasks, setSelectedMemberForTasks] = useState(null);
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState(null);

  // Compute task count per member
  const memberTaskCountMap = useMemo(() => {
    const map = new Map();
    (tasks || []).forEach((task) => {
      const assigneeId =
        task.assigned_to || task.assignee_id || task.planned_assignee_id;
      if (assigneeId) {
        map.set(assigneeId, (map.get(assigneeId) || 0) + 1);
      }
    });
    return map;
  }, [tasks]);

  // Filtered members list
  const filteredMembers = useMemo(() => {
    return (projectRoster || [])
      .filter((member) => {
        const q = searchQuery.toLowerCase().trim();
        if (!q) return true;
        const nameMatch = member.full_name?.toLowerCase().includes(q);
        const emailMatch = member.email?.toLowerCase().includes(q);
        const deptMatch = member.department?.toLowerCase().includes(q);
        const desigMatch = member.designation?.toLowerCase().includes(q);
        const roleMatch = member.projectRole?.toLowerCase().includes(q);
        return Boolean(
          nameMatch || emailMatch || deptMatch || desigMatch || roleMatch
        );
      })
      .sort((a, b) => {
        const roleWeight = {
          Owner: 1,
          "Team Lead": 2,
          "Squad Member": 3,
          Contributor: 4,
        };
        const wA = roleWeight[a.projectRole] || 5;
        const wB = roleWeight[b.projectRole] || 5;
        if (wA !== wB) return wA - wB;
        return (a.full_name || "").localeCompare(b.full_name || "");
      });
  }, [projectRoster, searchQuery]);

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Top Header Bar: Search & Add Member */}
      <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Search Box */}
        <div className="relative flex-1 w-full sm:max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search employee by name, role, department…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 rounded-md border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-xs text-slate-900 placeholder:text-slate-400 bg-slate-50 focus:bg-white transition"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Right CTA: Add Member */}
        {canManageTeam && onOpenTeamModal && (
          <button
            type="button"
            onClick={onOpenTeamModal}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs transition cursor-pointer shadow-xs shrink-0"
          >
            <span>+</span>
            <span>Add Member</span>
          </button>
        )}
      </div>

      {/* Main Employee List */}
      {filteredMembers.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-lg border border-slate-200 shadow-2xs space-y-2">
          <p className="text-xs font-semibold text-slate-700">No project members found</p>
          <p className="text-[11px] text-slate-400">
            {searchQuery
              ? "No team members matched your search criteria."
              : "No employees added to this project team yet."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
          <div className="divide-y divide-slate-100">
            {filteredMembers.map((member) => {
              const taskCount = memberTaskCountMap.get(member.id) || 0;
              const isOwner = member.projectRole === "Owner";
              const isLead = member.projectRole === "Team Lead";
              const canRemove = canManageTeam && onRemoveMember && !isOwner && !isLead;

              return (
                <div
                  key={member.id}
                  onClick={() => setSelectedMemberForTasks(member)}
                  className="px-4 py-3 hover:bg-slate-50/80 transition flex items-center justify-between gap-3 cursor-pointer group"
                >
                  {/* Left: Employee Info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs uppercase shrink-0">
                      {member.full_name?.charAt(0) || "U"}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-900 group-hover:text-blue-600 transition truncate">
                          {member.full_name}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.2 rounded border shrink-0 uppercase tracking-wider ${
                            member.badgeBg ||
                            "bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          {member.projectRole}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate">
                        {member.designation || member.role || "Squad Member"}
                        {member.department && ` • ${member.department}`}
                      </p>
                    </div>
                  </div>

                  {/* Right: Task Count & Remove action */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-slate-500 font-mono">
                      {taskCount} {taskCount === 1 ? "task" : "tasks"}
                    </span>

                    {canRemove && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveMember(member);
                        }}
                        className="w-6 h-6 rounded border border-rose-200 text-rose-500 hover:bg-rose-50 flex items-center justify-center text-xs transition cursor-pointer"
                        title={`Remove ${member.full_name} from project`}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Employee Task Progress Popup Modal */}
      {selectedMemberForTasks && (
        <EmployeeTaskProgressModal
          member={selectedMemberForTasks}
          project={project}
          tasks={tasks}
          sprints={sprints}
          epics={epics}
          isOpen={Boolean(selectedMemberForTasks)}
          onClose={() => setSelectedMemberForTasks(null)}
          onSelectTask={(task) => {
            setSelectedTaskForDetail(task);
          }}
        />
      )}

      {/* Task Detail Modal (if user clicks on a task from within the employee popup) */}
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
