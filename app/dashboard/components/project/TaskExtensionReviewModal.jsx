/* eslint-disable react-hooks/purity */
"use client";

import React, { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

export default function TaskExtensionReviewModal({
  isOpen,
  onClose,
  task,
  project,
  sprint,
  sprints = [],
  onDecisionMade,
}) {
  const [decisionNote, setDecisionNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const resolvedProject = project || task?.project;

  // Active sprint details
  const activeSprint = useMemo(() => {
    if (sprint) return sprint;
    if (task?.sprint) return task.sprint;
    const taskSprintId = task?.sprint_id;
    if (!taskSprintId) return null;
    const foundInList = (sprints || []).find((s) => s.id === taskSprintId);
    if (foundInList) return foundInList;
    const foundInProj = (resolvedProject?.sprints || []).find((s) => s.id === taskSprintId);
    return foundInProj || null;
  }, [sprint, task?.sprint, task?.sprint_id, sprints, resolvedProject?.sprints]);

  const sprintEndDate = useMemo(() => {
    if (!activeSprint?.end_date) return null;
    return String(activeSprint.end_date).split("T")[0];
  }, [activeSprint?.end_date]);

  const sprintName = useMemo(() => {
    return activeSprint?.name || "Active Sprint";
  }, [activeSprint?.name]);

  const assigneeName = useMemo(() => {
    return (
      task?.assignee?.full_name ||
      task?.planned_assignee?.full_name ||
      task?.assigned_to_name ||
      "Assigned Employee"
    );
  }, [task]);

  const currentDueDateFormatted = useMemo(() => {
    if (!task?.due_date) return "Not Scheduled";
    try {
      return new Date(task.due_date).toLocaleDateString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return task.due_date;
    }
  }, [task?.due_date]);

  const requestedDueDateFormatted = useMemo(() => {
    if (!task?.extension_requested_date) return "Not Specified";
    try {
      return new Date(task.extension_requested_date).toLocaleDateString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return task.extension_requested_date;
    }
  }, [task?.extension_requested_date]);

  const daysDifference = useMemo(() => {
    if (!task?.extension_requested_date || !task?.due_date) return null;
    try {
      const current = new Date(task.due_date);
      const requested = new Date(task.extension_requested_date);
      const diffTime = requested.getTime() - current.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    } catch {
      return null;
    }
  }, [task?.extension_requested_date, task?.due_date]);

  if (!isOpen || !task) return null;

  const handleDecision = async (decision) => {
    setIsSubmitting(true);
    setErrorMsg("");

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers = {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      const res = await fetch(`/api/projects/tasks/${task.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          action: "decide_extension",
          decision,
          decision_note: decisionNote.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to submit extension decision.");
      }

      if (onDecisionMade) {
        onDecisionMade(decision, data.task, decisionNote.trim());
      }

      window.dispatchEvent(
        new CustomEvent("project-task-updated", {
          detail: data.task || {
            id: task.id,
            extension_status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
            due_date: decision === "APPROVE" ? (data.task?.due_date || task.extension_requested_date) : task.due_date,
          },
        })
      );

      onClose();
    } catch (err) {
      setErrorMsg(err.message || "Network error submitting decision.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-fadeIn">
      <div className="relative w-full max-w-lg bg-white rounded-lg shadow-2xl border border-slate-300 overflow-hidden my-8">
        {/* Header matching Create Sprint Theme */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              Review Due Date Extension Request
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Review requested extension details and decide to approve or reject.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded flex items-center justify-center font-bold text-xs shadow-2xs transition cursor-pointer"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between animate-fadeIn">
            <span>⚠️ {errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg("")}
              className="text-rose-500 hover:text-rose-700 font-bold ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        <div className="p-6 space-y-4">
          {/* Row: Task Name & Assignee */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
              Deliverable Task
            </label>
            <div className="flex-1 min-w-0">
              <input
                type="text"
                readOnly
                disabled
                value={task.title || "Untitled Task"}
                className="w-full border-b border-slate-200 pb-1 text-sm bg-slate-50/60 text-slate-800 font-semibold cursor-not-allowed select-none truncate"
              />
              <span className="text-[10px] text-slate-400 font-mono">
                Code: {task.task_code || `TASK-${task.id?.slice(0, 5)}`} · Assignee: {assigneeName}
              </span>
            </div>
          </div>

          {/* Row: Sprint Info */}
          {activeSprint && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                Sprint Deadline
              </label>
              <div className="flex-1 flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded border border-slate-200">
                  🏁 {sprintName}: {sprintEndDate || "No end date"}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  (Extensions constrained to sprint)
                </span>
              </div>
            </div>
          )}

          {/* Row: Date Comparison Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-0.5">
                Current Due Date
              </span>
              <span className="font-mono text-sm font-semibold text-slate-800">
                📅 {currentDueDateFormatted}
              </span>
            </div>
            <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-200">
              <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider block mb-0.5">
                Requested New Date
              </span>
              <span className="font-mono text-sm font-bold text-blue-700 flex items-center gap-1.5">
                <span>📅 {requestedDueDateFormatted}</span>
                {daysDifference !== null && (
                  <span className="text-xs font-bold text-blue-600 bg-blue-100/80 px-1.5 py-0.5 rounded">
                    +{daysDifference} {daysDifference === 1 ? "day" : "days"}
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Row: Reason for Delay from Employee */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1">
            <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0 pt-1">
              Reason for Delay
            </label>
            <div className="flex-1">
              <div className="p-3 bg-slate-50 rounded-md border border-slate-200 text-xs text-slate-800 leading-relaxed italic">
                "{task.extension_reason || "No explicit reason provided."}"
              </div>
            </div>
          </div>

          {/* Row: Lead Decision Note / Remarks */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1">
            <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0 pt-1">
              Decision Remarks
            </label>
            <div className="flex-1 space-y-1">
              <textarea
                rows={2}
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder="Optional guidance or remarks for the employee (e.g., Approved, please ensure QA verification)..."
                className="w-full border border-slate-300 rounded-md p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none resize-none leading-relaxed"
              />
              <p className="text-[11px] text-slate-400">
                This note will be recorded and notified to the employee.
              </p>
            </div>
          </div>

          {/* Bottom Action Buttons matching Create Sprint Theme */}
          <div className="pt-4 pb-1 flex items-center justify-between gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-200 transition cursor-pointer"
            >
              Cancel
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleDecision("REJECT")}
                className="px-3.5 py-1.5 rounded text-xs font-semibold bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-300 hover:border-rose-300 transition cursor-pointer disabled:opacity-50"
              >
                Reject Request
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleDecision("APPROVE")}
                className="px-4 py-1.5 rounded text-xs font-semibold bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-2xs transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Processing…</span>
                  </>
                ) : (
                  <>
                    <span>✓ Approve Extension</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
