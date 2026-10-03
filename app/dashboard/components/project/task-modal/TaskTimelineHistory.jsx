"use client";

import React, { useState } from "react";

/**
 * TaskTimelineHistory Sub-Component
 * Clean, modern audit log of status transitions and review feedback.
 */
export default function TaskTimelineHistory({
  task,
  historyItems = [],
  allEmployees = [],
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const resolveEmployeeName = (empId, fallbackName) => {
    if (fallbackName) return fallbackName;
    if (!empId) return "Team Member";
    const found = allEmployees.find((e) => e.id === empId);
    return found?.full_name || "Team Member";
  };

  const getStatusBadge = (status) => {
    switch (String(status).toUpperCase()) {
      case "COMPLETED":
        return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800";
      case "REVIEW":
        return "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-800";
      case "IN_PROGRESS":
        return "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300 border-sky-200 dark:border-sky-800";
      case "TODO":
      default:
        return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700";
    }
  };

  if (!historyItems || historyItems.length === 0) {
    return (
      <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/60">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
          Status History &amp; Audit Trail
        </span>
        <div className="py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-center text-xs text-slate-400 font-medium">
          No previous status transitions recorded.
        </div>
      </div>
    );
  }

  const displayedItems = isExpanded ? historyItems : historyItems.slice(0, 3);

  return (
    <div className="space-y-3 text-xs pt-2 border-t border-slate-100 dark:border-slate-800/60">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          Status History &amp; Audit Trail ({historyItems.length})
        </span>
        {historyItems.length > 3 && (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs font-semibold text-[#1f6fb2] dark:text-sky-400 hover:underline cursor-pointer"
          >
            {isExpanded ? "Show Less" : `View All (${historyItems.length})`}
          </button>
        )}
      </div>

      <div className="relative border-l border-slate-200 dark:border-slate-700 ml-2.5 space-y-3 py-1">
        {displayedItems.map((item, idx) => {
          const actorName =
            item.changed_by_employee?.full_name ||
            resolveEmployeeName(item.changed_by, item.changed_by_name);
          const oldSt = item.old_status || "TODO";
          const newSt = item.new_status || item.status || "TODO";

          return (
            <div key={item.id || idx} className="relative pl-4 group">
              {/* Dot */}
              <div className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-[#1f6fb2]" />

              {/* Event Content */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {actorName}
                    </span>
                    <span className="text-slate-400 text-[11px]">updated status</span>
                  </div>

                  <span className="text-[10px] text-slate-400 font-mono">
                    {item.created_at ? new Date(item.created_at).toLocaleString() : "Recently"}
                  </span>
                </div>

                {/* Transition Flow */}
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${getStatusBadge(oldSt)}`}>
                    {oldSt}
                  </span>
                  <span className="text-slate-400 text-xs">→</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${getStatusBadge(newSt)}`}>
                    {newSt}
                  </span>
                </div>

                {/* Comments / Feedback */}
                {item.comments && (
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-[11px] whitespace-pre-wrap mt-1">
                    {item.comments}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
