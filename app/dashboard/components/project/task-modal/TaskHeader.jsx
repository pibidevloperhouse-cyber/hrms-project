"use client";

import React from "react";

/**
 * TaskHeader Sub-Component
 * Clean, modern task header matching HRMS design system.
 * Displays identifier badge, type selector, frameless title input, and tab switcher.
 */
export default function TaskHeader({
  task,
  projectKey = "HRM",
  title,
  setTitle,
  taskType,
  setTaskType,
  activeTab,
  setActiveTab,
  attachmentsCount = 0,
  canEdit = true,
  onClose,
}) {
  const taskNumber = task?.task_number || task?.id?.slice(0, 5) || "01";
  const displayKey = `${projectKey}-${taskNumber}`;

  return (
    <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 px-6 py-4 space-y-3 shrink-0">
      {/* Top Metadata Row: Identifier, Type, Sprint & Close Button */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {/* Identifier Badge */}
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold font-mono bg-blue-50 text-[#1f6fb2] dark:bg-blue-950/40 dark:text-sky-300 border border-blue-200 dark:border-blue-900/60 shadow-2xs shrink-0">
            {displayKey}
          </span>

          {/* Task Type Selector */}
          {canEdit && setTaskType ? (
            <select
              value={taskType || "TASK"}
              onChange={(e) => setTaskType(e.target.value)}
              className="px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#1f6fb2] shadow-2xs shrink-0 cursor-pointer transition"
            >
              <option value="TASK">Task</option>
              <option value="STORY">Story</option>
              <option value="BUG">Bug</option>
            </select>
          ) : (
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
              {taskType === "BUG" ? "Bug" : taskType === "STORY" ? "Story" : "Task"}
            </span>
          )}

          {/* Sprint Tag (if assigned) */}
          {task?.sprint?.name && (
            <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 truncate max-w-[200px]">
              {task.sprint.name}
            </span>
          )}
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center text-sm transition cursor-pointer shrink-0"
          title="Close (Esc)"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Task Title Input */}
      <div>
        {canEdit && setTitle ? (
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title..."
            className="w-full text-base sm:text-lg font-bold text-slate-900 dark:text-white placeholder:text-slate-400 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-[#1f6fb2] focus:bg-white/60 dark:focus:bg-slate-800/40 px-2 py-1 transition outline-none rounded-md"
          />
        ) : (
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-snug px-2 py-1">
            {title || task?.title || "Untitled Task"}
          </h2>
        )}
      </div>

      {/* Minimal Tabs Navigation */}
      <div className="flex items-center gap-2 border-t border-slate-200/80 dark:border-slate-800/80 pt-2.5">
        <button
          type="button"
          onClick={() => setActiveTab("TASK_DETAILS")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
            activeTab === "TASK_DETAILS"
              ? "bg-[#1f6fb2] text-white shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          Task Overview
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("REVIEW_TASK")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
            activeTab === "REVIEW_TASK"
              ? "bg-[#1f6fb2] text-white shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <span>Deliverables &amp; Verification</span>
          {attachmentsCount > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                activeTab === "REVIEW_TASK"
                  ? "bg-white/25 text-white"
                  : "bg-blue-100 dark:bg-blue-950 text-[#1f6fb2] dark:text-sky-300"
              }`}
            >
              {attachmentsCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
