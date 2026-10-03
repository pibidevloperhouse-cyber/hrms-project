"use client";

import React, { useState, useMemo } from "react";
import TaskDetailModal from "./TaskDetailModal";
import { formatSprintDuration } from "@/lib/projectUtils";

export default function ProjectCompletedSprintsTab({
  project,
  sprints = [],
  tasks = [],
  epics = [],
  departmentEmployees = [],
  teamLeads = [],
  employeeProfile,
  currentUserId,
  onTasksUpdated,
  onSprintsUpdated,
  onNavigateToSprints,
}) {
  const [expandedSprintIds, setExpandedSprintIds] = useState(new Set());
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState(null);

  // Filter strictly completed sprints, sorted newest first
  const completedSprints = useMemo(() => {
    return (sprints || [])
      .filter((s) => {
        const status = String(s.status || "").trim().toUpperCase();
        return status === "COMPLETED" || status === "DONE" || status === "CLOSED";
      })
      .sort((a, b) => {
        const dateA = new Date(a.end_date || a.updated_at || a.created_at || 0).getTime();
        const dateB = new Date(b.end_date || b.updated_at || b.created_at || 0).getTime();
        return dateB - dateA;
      });
  }, [sprints]);

  const toggleSprintExpand = (sprintId) => {
    setExpandedSprintIds((prev) => {
      const next = new Set(prev);
      if (next.has(sprintId)) next.delete(sprintId);
      else next.add(sprintId);
      return next;
    });
  };

  return (
    <div className="space-y-4 text-xs text-slate-800 animate-fadeIn">
      {completedSprints.length === 0 ? (
        <div className="p-12 rounded-2xl bg-white border border-dashed border-slate-300 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl mx-auto font-bold shadow-2xs">
            ✓
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-slate-900">
              No Completed Sprints
            </h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              Completed sprints and their finished tasks will appear here once finalized.
            </p>
          </div>

          {onNavigateToSprints && (
            <button
              type="button"
              onClick={onNavigateToSprints}
              className="px-4 py-2 rounded-xl bg-brand-gradient hover:opacity-95 text-white font-semibold text-xs transition cursor-pointer shadow-xs shadow-[#1f6fb2]/20 inline-flex items-center gap-1.5 mt-2"
            >
              <span>🏃</span>
              <span>Go to Sprints</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {completedSprints.map((sprint) => {
            const sprintTasks = tasks.filter(
              (t) => t.sprint_id === sprint.id && (t.status === "COMPLETED" || !t.status || t.status === "DONE")
            );
            const isExpanded = expandedSprintIds.has(sprint.id);

            return (
              <div
                key={sprint.id}
                className="rounded-2xl bg-white border border-slate-200 shadow-2xs overflow-hidden transition-all hover:border-slate-300"
              >
                {/* Sprint Row Header */}
                <div
                  onClick={() => toggleSprintExpand(sprint.id)}
                  className="p-4 sm:p-5 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/70 transition select-none"
                >
                  {/* Left: Expand chevron, Sprint Name, Status Badge, Date Range */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span
                      className={`text-xs text-slate-400 transition-transform duration-200 shrink-0 ${
                        isExpanded ? "rotate-90 text-[#1f6fb2] font-bold" : ""
                      }`}
                    >
                      ▶
                    </span>

                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-bold text-slate-900 text-sm sm:text-base hover:text-[#1f6fb2] transition truncate">
                          {sprint.name}
                        </span>

                        <span className="px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0 flex items-center gap-1">
                          <span>✓</span>
                          <span>Completed</span>
                        </span>

                        {sprint.start_date && (
                          <div className="flex items-center gap-1 text-[11px] text-slate-500 font-mono shrink-0">
                            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            <span>
                              {sprint.start_date.split("T")[0]} → {sprint.end_date ? sprint.end_date.split("T")[0] : "—"}
                            </span>
                            {sprint.end_date && (
                              <span className="text-slate-400 ml-1">
                                ({formatSprintDuration(sprint.start_date, sprint.end_date)})
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {sprint.goal && (
                        <p className="text-xs text-slate-500 line-clamp-1 italic">
                          Goal: {sprint.goal}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: Completed tasks count badge */}
                  <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                    <span className="text-xs font-mono font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg">
                      {sprintTasks.length} {sprintTasks.length === 1 ? "completed task" : "completed tasks"}
                    </span>
                  </div>
                </div>

                {/* Expanded Section: Completed tasks list only */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-3 border-t border-slate-100 space-y-3 bg-slate-50/40 animate-fadeIn">
                    {/* Section Header */}
                    <div className="flex items-center justify-between pt-0.5 pb-0.5">
                      <span className="text-[11px] font-bold text-[#1f6fb2] uppercase tracking-wider">
                        Tasks in Sprint ({sprintTasks.length})
                      </span>
                    </div>

                    {/* Tasks List */}
                    {sprintTasks.length === 0 ? (
                      <div className="py-5 text-center text-slate-400 text-xs italic bg-white rounded-xl border border-slate-200">
                        No completed tasks in this sprint.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                        {sprintTasks.map((task) => {
                          return (
                            <div
                              key={task.id}
                              onClick={() => setSelectedTaskForDetail(task)}
                              className="py-2.5 px-3.5 hover:bg-slate-50 transition flex items-center justify-between gap-3 cursor-pointer group"
                            >
                              {/* Task Title */}
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                <span className="text-xs font-semibold text-slate-900 truncate group-hover:text-[#1f6fb2] transition">
                                  {task.title}
                                </span>
                              </div>

                              {/* Task Status Badge */}
                              <div className="shrink-0">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wider bg-emerald-50 text-emerald-700 border-emerald-200">
                                  Completed
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
          })}
        </div>
      )}

      {/* Task Detail Modal */}
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
