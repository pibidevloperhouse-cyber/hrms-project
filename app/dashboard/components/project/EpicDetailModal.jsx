"use client";

import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";

export default function EpicDetailModal({
  epic,
  project,
  tasks = [],
  sprints = [],
  isOpen,
  onClose,
  onSelectTask,
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Keyboard shortcut Esc to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

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

  // Summary stats
  const stats = useMemo(() => {
    const total = epicTasks.length;
    const completed = epicTasks.filter(
      (t) => (t.status || "").toUpperCase() === "COMPLETED"
    ).length;
    const inProgress = epicTasks.filter(
      (t) => (t.status || "").toUpperCase() === "IN_PROGRESS"
    ).length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, inProgress, progress };
  }, [epicTasks]);

  if (!isOpen || !epic || !mounted || typeof document === "undefined") return null;

  const modalContent = (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs overflow-y-auto text-slate-800"
    >
      <div className="relative w-full max-w-xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[88vh] animate-scaleUp">
        {/* Top Header Bar */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="w-3.5 h-3.5 rounded-full shrink-0"
              style={{ backgroundColor: epic.color || "#3b82f6" }}
            />
            <div className="min-w-0 flex items-center gap-2">
              <span className="font-bold text-slate-900">Epic Details:</span>
              <span className="text-blue-600 font-semibold border-b-2 border-blue-600 pb-0.5 text-sm truncate">
                {epic.name}
              </span>
              <span
                className={`ml-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border shrink-0 ${
                  epic.status === "COMPLETED"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : epic.status === "IN_PROGRESS"
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-slate-100 text-slate-700 border-slate-200"
                }`}
              >
                {epic.status || "IN_PROGRESS"}
              </span>
            </div>
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 border border-rose-300 hover:border-rose-400 text-rose-400 hover:text-rose-600 rounded-md flex items-center justify-center text-xs transition cursor-pointer shrink-0 ml-2"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
          {/* Row: Epic Name */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
            <label className="sm:w-32 text-sm text-slate-700 font-medium shrink-0">
              <span className="border-b-2 border-rose-500 pb-0.5">Epic Name</span>
            </label>
            <div className="flex-1 text-sm font-semibold text-slate-900 pb-1 border-b border-slate-300">
              {epic.name}
            </div>
          </div>

          {/* Row: Description */}
          {epic.description && (
            <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1">
              <label className="sm:w-32 text-sm text-slate-700 font-medium shrink-0 pt-0.5">
                Description
              </label>
              <div className="flex-1 text-sm text-slate-800 pb-1 border-b border-slate-300 leading-relaxed">
                {epic.description}
              </div>
            </div>
          )}

          {/* Row: Start Date */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
            <label className="sm:w-32 text-sm text-slate-700 font-medium shrink-0">
              Start Date
            </label>
            <div className="flex-1 text-sm text-slate-800 pb-1 border-b border-slate-300 font-mono">
              {epic.start_date ? epic.start_date.split("T")[0] : "Not specified"}
            </div>
          </div>

          {/* Row: End Date */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
            <label className="sm:w-32 text-sm text-slate-700 font-medium shrink-0">
              End Date
            </label>
            <div className="flex-1 text-sm text-slate-800 pb-1 border-b border-slate-300 font-mono">
              {epic.end_date ? epic.end_date.split("T")[0] : "Not specified"}
            </div>
          </div>

          {/* Row: Creator Note (if present) */}
          {epic.creator_note && (
            <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1">
              <label className="sm:w-32 text-sm text-slate-700 font-medium shrink-0 pt-0.5">
                Creator Note
              </label>
              <div className="flex-1 text-sm text-slate-800 pb-1 border-b border-slate-300 italic">
                {epic.creator_note}
              </div>
            </div>
          )}

          {/* Section Divider: Tasks in Epic */}
          <div className="text-blue-600 font-semibold border-b border-blue-500 pb-1 text-sm pt-3 flex items-center justify-between">
            <span>Tasks in Epic</span>
            <span className="text-xs font-mono font-medium text-slate-500">
              {stats.completed}/{stats.total} Completed
            </span>
          </div>

          {/* Tasks List */}
          {epicTasks.length === 0 ? (
            <div className="py-6 text-center text-slate-400 text-xs italic bg-slate-50 rounded-lg border border-slate-200">
              No tasks currently assigned to this epic.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
              {epicTasks.map((task) => {
                const status = (task.status || "TODO").toUpperCase();
                const sprintName = task.sprint_id
                  ? sprintMap.get(task.sprint_id)
                  : task.sprint?.name || null;
                const progressVal =
                  Number(task.progress) || (status === "COMPLETED" ? 100 : 0);

                return (
                  <div
                    key={task.id}
                    onClick={() => {
                      if (onSelectTask) onSelectTask(task);
                    }}
                    className="py-2.5 px-3.5 hover:bg-slate-50 transition flex items-center justify-between gap-3 cursor-pointer group"
                  >
                    {/* Task Title */}
                    <div className="flex items-center gap-2 min-w-0 flex-1">
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
                      <span className="text-sm text-slate-900 font-medium truncate group-hover:text-blue-600 transition">
                        {task.title}
                      </span>
                    </div>

                    {/* Status Pill */}
                    <div className="shrink-0">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
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
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/70 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded border border-slate-300 hover:bg-slate-100 text-slate-700 font-medium text-xs transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
