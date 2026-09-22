/* eslint-disable react-hooks/purity */
"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export default function TaskExtensionModal({
  isOpen,
  onClose,
  task,
  project,
  sprint,
  sprints = [],
  onTaskUpdated,
  onRequestSubmitted,
}) {
  const [requestedDueDate, setRequestedDueDate] = useState("");
  const [extensionDays, setExtensionDays] = useState(1);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [mounted, setMounted] = useState(false);
  const initializedTaskIdRef = useRef(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const resolvedProject = project || task?.project;
  const leadName =
    resolvedProject?.teamLead?.full_name ||
    resolvedProject?.team_lead?.full_name ||
    "Team Lead";

  // Identify active sprint details
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

  // Helper to add days to a YYYY-MM-DD or Date string safely
  const addDays = useCallback((baseDateStr, days) => {
    if (!baseDateStr) return "";
    try {
      const base = new Date(baseDateStr);
      if (isNaN(base.getTime())) return "";
      const result = new Date(base);
      result.setDate(result.getDate() + Number(days));
      const yyyy = result.getFullYear();
      const mm = String(result.getMonth() + 1).padStart(2, "0");
      const dd = String(result.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    } catch {
      return "";
    }
  }, []);

  // Compute maximum allowed days within active sprint
  const maxAllowedSprintDays = useMemo(() => {
    if (!sprintEndDate || !task?.due_date) return null;
    try {
      const current = new Date(task.due_date);
      const sprintEnd = new Date(sprintEndDate);
      const diffTime = sprintEnd.getTime() - current.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return Math.max(0, diffDays);
    } catch {
      return null;
    }
  }, [sprintEndDate, task?.due_date]);

  // One-time initialization when modal opens for a specific task
  useEffect(() => {
    if (isOpen && task && initializedTaskIdRef.current !== task.id) {
      initializedTaskIdRef.current = task.id;
      setErrorMsg("");
      setReason("");

      const baseDue = task.due_date ? String(task.due_date).split("T")[0] : new Date().toISOString().split("T")[0];
      let initialDays = 1;
      let calculatedDate = addDays(baseDue, 1);

      // If sprint boundary exists and 1 day exceeds sprint end date, clamp to sprint end
      if (sprintEndDate && calculatedDate > sprintEndDate) {
        calculatedDate = sprintEndDate;
        initialDays = maxAllowedSprintDays || 0;
      }

      setExtensionDays(Math.max(1, initialDays));
      setRequestedDueDate(calculatedDate);
    }

    if (!isOpen) {
      initializedTaskIdRef.current = null;
    }
  }, [isOpen, task, sprintEndDate, addDays, maxAllowedSprintDays]);

  const minSelectableDate = useMemo(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const maxSelectableDate = useMemo(() => {
    return sprintEndDate || undefined;
  }, [sprintEndDate]);

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

  // Calculate days delta whenever requestedDueDate changes
  const daysDifference = useMemo(() => {
    if (!requestedDueDate || !task?.due_date) return null;
    try {
      const current = new Date(task.due_date);
      const requested = new Date(requestedDueDate);
      const diffTime = requested.getTime() - current.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    } catch {
      return null;
    }
  }, [requestedDueDate, task?.due_date]);

  // Handler for direct date picker change
  const handleDateChange = (newDate) => {
    setRequestedDueDate(newDate);
    if (!newDate || !task?.due_date) return;
    try {
      const current = new Date(task.due_date);
      const requested = new Date(newDate);
      const diffTime = requested.getTime() - current.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        setExtensionDays(diffDays);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Handler for quick day extension preset buttons (+1, +2, +3, +5, +7)
  const handleApplyDaysExtension = (numDays) => {
    const baseDue = task?.due_date ? String(task.due_date).split("T")[0] : new Date().toISOString().split("T")[0];
    let targetDate = addDays(baseDue, numDays);

    if (sprintEndDate && targetDate > sprintEndDate) {
      targetDate = sprintEndDate;
    }

    setExtensionDays(numDays);
    setRequestedDueDate(targetDate);
    setErrorMsg("");
  };

  // Sprint Boundary Checks:
  const exceedsSprintDeadline = useMemo(() => {
    if (!sprintEndDate || !requestedDueDate) return false;
    return requestedDueDate > sprintEndDate;
  }, [sprintEndDate, requestedDueDate]);

  const isCurrentDueAtSprintEnd = useMemo(() => {
    if (!sprintEndDate || !task?.due_date) return false;
    const taskDueStr = String(task.due_date).split("T")[0];
    return taskDueStr >= sprintEndDate;
  }, [sprintEndDate, task?.due_date]);

  if (!isOpen || !task || !mounted) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!requestedDueDate) {
      setErrorMsg("Please select a valid requested new due date.");
      return;
    }

    if (exceedsSprintDeadline) {
      setErrorMsg(
        `Extension blocked: The requested date (${requestedDueDate}) extends beyond Sprint "${sprintName}" end date (${sprintEndDate}). Extending past the sprint boundary breaks sprint work and cannot be sent to the Team Lead.`
      );
      return;
    }

    if (isCurrentDueAtSprintEnd) {
      setErrorMsg(
        `This deliverable is already scheduled on the final date of Sprint "${sprintName}" (${sprintEndDate}). It cannot be extended further within this sprint.`
      );
      return;
    }

    if (!reason.trim() || reason.trim().length < 5) {
      setErrorMsg("Please provide a detailed reason (at least 5 characters) for the delay.");
      return;
    }

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
          action: "request_extension",
          extension_requested_date: requestedDueDate,
          extension_reason: reason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to submit extension request.");
      }

      if (onTaskUpdated && data.task) {
        onTaskUpdated(data.task);
      }
      if (onRequestSubmitted && data.task) {
        onRequestSubmitted(data.task);
      }

      window.dispatchEvent(
        new CustomEvent("project-task-updated", {
          detail: data.task || {
            id: task.id,
            extension_status: "PENDING",
            extension_requested_date: requestedDueDate,
          },
        })
      );

      onClose();
    } catch (err) {
      setErrorMsg(err.message || "Network error. Failed to submit extension request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const presetOptions = [1, 2, 3, 5, 7];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-fadeIn">
      <div className="relative w-full max-w-lg bg-white rounded-lg shadow-2xl border border-slate-300 overflow-hidden my-8">
        {/* Header matching Create Sprint Theme */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              Request Due Date Extension
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Submit a formal deadline extension request to your Team Lead with justification.
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Row: Task Name (Read-Only) */}
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
                Code: {task.task_code || `TASK-${task.id?.slice(0, 5)}`} · Lead: {leadName}
              </span>
            </div>
          </div>

          {/* Row: Sprint Info & Boundary Constraint */}
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
                  (Extensions capped at sprint end)
                </span>
              </div>
            </div>
          )}

          {/* Row: Current Due Date (Read-Only) */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
              Current Due Date
            </label>
            <div className="flex-1 flex items-center gap-2">
              <span className="text-sm font-semibold font-mono text-slate-800 bg-slate-100 px-2.5 py-1 rounded border border-slate-200">
                📅 {currentDueDateFormatted}
              </span>
              {task.extension_status === "PENDING" && (
                <span className="text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">
                  ⏳ Prior Request Pending
                </span>
              )}
            </div>
          </div>

          {/* Sprint Deadline Reached Notice */}
          {isCurrentDueAtSprintEnd && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-950 text-xs font-medium space-y-1 animate-fadeIn">
              <div className="flex items-center gap-1.5 font-bold text-amber-950">
                <span>⚠️</span>
                <span>Sprint Deadline Limit Reached</span>
              </div>
              <p>
                This task is already scheduled on the final day of <strong>{sprintName}</strong> (
                <span className="font-mono font-bold">{sprintEndDate}</span>).
              </p>
              <p className="text-[11px] text-amber-800">
                Extending past the sprint end date breaks sprint deliverables and commitments. Therefore, requests beyond this date <strong>cannot be sent to the Team Lead</strong>. Please coordinate with your Lead to move this task to a future sprint.
              </p>
            </div>
          )}

          {/* Sprint Boundary Exceeded Warning */}
          {exceedsSprintDeadline && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-rose-950 text-xs font-medium space-y-1 animate-fadeIn">
              <div className="flex items-center gap-1.5 font-bold text-rose-950">
                <span>🚫</span>
                <span>Sprint Boundary Exceeded · Request Blocked</span>
              </div>
              <p>
                The requested date (<span className="font-mono font-bold">{requestedDueDate}</span>) extends beyond the Sprint deadline (<span className="font-mono font-bold">{sprintEndDate}</span>) for <strong>{sprintName}</strong>.
              </p>
              <p className="text-[11px] text-rose-800">
                Extending past the sprint deadline breaks sprint scope commitments. To protect sprint timelines, this request <strong>will not be sent to the Team Lead</strong>.
              </p>
            </div>
          )}

          {/* Row: Quick Extension Presets (+1, +2, +3, +5, +7 Days) */}
          {!isCurrentDueAtSprintEnd && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-0.5">
              <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                Extend By
              </label>
              <div className="flex-1 flex flex-wrap items-center gap-1.5">
                {presetOptions.map((days) => {
                  const baseDue = task?.due_date ? String(task.due_date).split("T")[0] : "";
                  const targetDate = addDays(baseDue, days);
                  const isPastSprint = sprintEndDate && targetDate > sprintEndDate;
                  const isSelected = daysDifference === days;

                  return (
                    <button
                      key={`ext-day-preset-${days}`}
                      type="button"
                      disabled={isPastSprint}
                      onClick={() => handleApplyDaysExtension(days)}
                      className={`px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                        isSelected
                          ? "bg-blue-600 text-white shadow-2xs border border-blue-700"
                          : isPastSprint
                          ? "bg-slate-100 text-slate-300 border border-slate-200 cursor-not-allowed line-through"
                          : "bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300"
                      }`}
                      title={
                        isPastSprint
                          ? `+${days} days exceeds sprint end date (${sprintEndDate})`
                          : `Extend by +${days} day${days > 1 ? "s" : ""}`
                      }
                    >
                      <span>+{days} {days === 1 ? "Day" : days === 7 ? "Week" : "Days"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Row: Requested New Due Date (Date Picker) */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
            <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
              Requested Due Date <span className="text-red-500">*</span>
            </label>
            <div className="flex-1 space-y-1">
              <input
                type="date"
                required
                disabled={isCurrentDueAtSprintEnd}
                min={minSelectableDate}
                max={maxSelectableDate}
                value={requestedDueDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className={`w-full border-b outline-none pb-1 text-sm bg-transparent font-medium ${
                  isCurrentDueAtSprintEnd
                    ? "border-slate-200 text-slate-400 cursor-not-allowed"
                    : exceedsSprintDeadline
                    ? "border-rose-500 text-rose-800"
                    : "border-slate-300 focus:border-blue-600 text-slate-900"
                }`}
              />
              {daysDifference !== null && !exceedsSprintDeadline && !isCurrentDueAtSprintEnd && (
                <p className="text-xs text-blue-700 font-semibold flex items-center gap-1">
                  <span>⏱️ Extension delta:</span>
                  <span className={daysDifference > 0 ? "text-emerald-700 font-bold" : "text-amber-700"}>
                    {daysDifference > 0 ? `+${daysDifference} day(s)` : `${daysDifference} day(s)`}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Row: Reason for Delay (Text Area) */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1">
            <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0 pt-1">
              Reason for Delay <span className="text-red-500">*</span>
            </label>
            <div className="flex-1 space-y-1">
              <textarea
                required
                disabled={isCurrentDueAtSprintEnd}
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain the technical blocker, external dependency, or scope complexity requiring additional time..."
                className="w-full border border-slate-300 rounded-md p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none resize-none leading-relaxed disabled:bg-slate-50 disabled:cursor-not-allowed"
              />
              <p className="text-[11px] text-slate-400">
                This explanation will be delivered to your Team Lead (<strong className="text-slate-600">{leadName}</strong>) for review and approval.
              </p>
            </div>
          </div>

          {/* Bottom Action Buttons matching Create Sprint Theme */}
          <div className="pt-4 pb-1 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-200 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                isSubmitting ||
                !requestedDueDate ||
                !reason.trim() ||
                exceedsSprintDeadline ||
                isCurrentDueAtSprintEnd
              }
              className="px-5 py-1.5 rounded text-xs font-semibold bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-2xs transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Submitting…</span>
                </>
              ) : (
                <>
                  <span>Submit Request to Lead</span>
                  <span>→</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
