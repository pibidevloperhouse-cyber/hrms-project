"use client";

import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";

export default function EmployeeTaskProgressModal({
  member,
  project,
  tasks = [],
  sprints = [],
  epics = [],
  isOpen,
  onClose,
  onSelectTask,
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // ESC key listener to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Find all tasks assigned to this employee
  const assignedTasks = useMemo(() => {
    if (!member?.id) return [];
    return (tasks || []).filter(
      (t) =>
        t.assigned_to === member.id ||
        t.assignee_id === member.id ||
        t.planned_assignee_id === member.id
    );
  }, [tasks, member]);

  // Workload summary stats
  const stats = useMemo(() => {
    const total = assignedTasks.length;
    const completed = assignedTasks.filter(
      (t) =>
        (t.status || "").toUpperCase() === "COMPLETED" ||
        (t.status || "").toUpperCase() === "DONE"
    ).length;
    const inProgress = assignedTasks.filter(
      (t) => (t.status || "").toUpperCase() === "IN_PROGRESS"
    ).length;
    const todo = assignedTasks.filter(
      (t) => (t.status || "").toUpperCase() === "TODO" || !t.status
    ).length;
    const review = assignedTasks.filter(
      (t) => (t.status || "").toUpperCase() === "REVIEW"
    ).length;
    const avgProgress =
      total > 0
        ? Math.round(
            assignedTasks.reduce(
              (acc, t) =>
                acc + (Number(t.progress) || (t.status === "COMPLETED" ? 100 : 0)),
              0
            ) / total
          )
        : 0;

    return { total, completed, inProgress, todo, review, avgProgress };
  }, [assignedTasks]);

  // Sprint map for quick name lookup
  const sprintMap = useMemo(() => {
    const m = new Map();
    (sprints || []).forEach((s) => m.set(s.id, s.name));
    return m;
  }, [sprints]);

  if (!isOpen || !member || !mounted || typeof document === "undefined") return null;

  const getRoleBadgeClass = (role) => {
    const r = (role || "").toUpperCase();
    if (r.includes("OWNER")) return "bg-amber-50 text-amber-700 border-amber-200";
    if (r.includes("LEAD")) return "bg-purple-50 text-purple-700 border-purple-200";
    if (r.includes("DEVELOPER") || r.includes("ENGINEER") || r.includes("SQUAD"))
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    return "bg-sky-50 text-sky-700 border-sky-200";
  };

  const modalContent = (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-5 bg-slate-900/50 backdrop-blur-xs overflow-y-auto text-slate-800 animate-fadeIn"
    >
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[88vh] animate-scaleIn">
        {/* Top Header Bar */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/60 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-brand-gradient text-white font-bold flex items-center justify-center text-xs shrink-0 uppercase shadow-2xs shadow-[#1f6fb2]/20">
              {member.full_name?.charAt(0) || "U"}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 truncate">
                  {member.full_name}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border shrink-0 ${
                    member.badgeBg || getRoleBadgeClass(member.projectRole)
                  }`}
                >
                  {member.projectRole || "Member"}
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate">
                {member.designation || member.role || "Squad Member"}
                {member.department ? ` • ${member.department}` : ""}
              </p>
            </div>
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 border border-slate-200 hover:border-slate-300 text-slate-400 hover:text-slate-700 rounded-lg flex items-center justify-center text-xs transition cursor-pointer shrink-0 shadow-2xs"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Summary Progress Cards */}
          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Tasks</span>
              <span className="text-lg font-bold font-mono text-slate-800">{stats.total}</span>
            </div>
            <div className="p-3 rounded-xl bg-sky-50/60 border border-sky-100 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-sky-600 block">In Progress</span>
              <span className="text-lg font-bold font-mono text-sky-700">{stats.inProgress}</span>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-100 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-emerald-600 block">Completed</span>
              <span className="text-lg font-bold font-mono text-emerald-700">{stats.completed}</span>
            </div>
          </div>

          {/* Section: Task List */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] font-bold text-[#1f6fb2] uppercase tracking-wider block">
              Assigned Tasks ({stats.total})
            </span>
            <span className="text-xs font-mono font-semibold text-slate-500">
              {stats.completed}/{stats.total} Completed
            </span>
          </div>

          {/* Tasks List */}
          {assignedTasks.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs italic bg-slate-50 rounded-xl border border-slate-200">
              No tasks currently assigned to this employee.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
              {assignedTasks.map((task) => {
                const status = (task.status || "TODO").toUpperCase();

                return (
                  <div
                    key={task.id}
                    onClick={() => {
                      if (onSelectTask) onSelectTask(task);
                    }}
                    className="py-3 px-3.5 hover:bg-slate-50 transition flex items-center justify-between gap-3 cursor-pointer group"
                  >
                    {/* Task Title */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
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
                      <span className="text-xs font-semibold text-slate-900 truncate group-hover:text-[#1f6fb2] transition">
                        {task.title}
                      </span>
                    </div>

                    {/* Status Pill */}
                    <div className="shrink-0">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wider ${
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

        {/* Bottom Action Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs transition cursor-pointer shadow-2xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
