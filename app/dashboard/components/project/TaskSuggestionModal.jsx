/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";

export default function TaskSuggestionModal({
  isOpen,
  onClose,
  task,
  project,
  teamLeads = [],
  employeeProfile,
  currentUserId,
  onTaskUpdated,
  onOpenFullDetail,
}) {
  const [mounted, setMounted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeScreenshot, setActiveScreenshot] = useState(null);
  const [feedbackError, setFeedbackError] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Keyboard shortcut Esc to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        if (activeScreenshot) {
          setActiveScreenshot(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose, activeScreenshot]);

  // Extract clean suggestion notes
  const suggestionText = useMemo(() => {
    if (!task) return "";
    if (task.review_feedback && typeof task.review_feedback === "string") {
      return task.review_feedback.trim();
    }
    const raw = task.comments || task.last_status_comment || task.review_comments || "";
    if (typeof raw === "string") {
      const clean = raw
        .replace(/\[Team Lead Suggestions\]:/g, "")
        .replace(/\[Team Lead Revision Feedback\]:/g, "")
        .replace(/\[Scope Revision Instructions\]:/g, "")
        .replace(/<!--DELIVERABLE_PAYLOAD:[\s\S]*?-->/g, "")
        .trim();
      if (clean && !clean.startsWith("Status changed to") && !clean.startsWith("Created item")) {
        return clean;
      }
    }
    return "Please review and revise the deliverable as discussed with your Team Lead.";
  }, [task]);

  // Reviewer Info
  const reviewer = useMemo(() => {
    if (!task) return null;
    if (task.review_feedback_lead) {
      return task.review_feedback_lead;
    }
    const leadId = task.review_feedback_by || project?.team_lead_id;
    const found = (teamLeads || []).find((l) => l.id === leadId);
    if (found) return found;
    if (project?.teamLead) return project.teamLead;
    return {
      full_name: project?.team_lead_name || "Team Lead",
      designation: "Project Team Lead",
    };
  }, [task, project, teamLeads]);

  // Review Timestamp
  const reviewTime = useMemo(() => {
    if (!task) return null;
    return task.review_feedback_at || task.updated_at || null;
  }, [task]);

  // Deliverable Proof & Notes submitted by employee
  const originalDeliverable = useMemo(() => {
    if (!task) return { comments: "", attachments: [] };

    let attachments = [];
    if (task.review_attachments) {
      if (Array.isArray(task.review_attachments)) {
        attachments = task.review_attachments;
      } else if (typeof task.review_attachments === "string") {
        try {
          const parsed = JSON.parse(task.review_attachments);
          if (Array.isArray(parsed)) attachments = parsed;
        } catch {}
      }
    }

    let comments = "";
    const searchFields = [task.review_comments, task.comments, task.description];
    for (const field of searchFields) {
      if (typeof field === "string" && field.includes("<!--DELIVERABLE_PAYLOAD:")) {
        try {
          const match = field.match(/<!--DELIVERABLE_PAYLOAD:([\s\S]*?)-->/);
          if (match && match[1]) {
            const parsed = JSON.parse(match[1]);
            if (parsed.comments && !comments) comments = parsed.comments;
            if (Array.isArray(parsed.attachments) && attachments.length === 0) {
              attachments = parsed.attachments;
            }
          }
        } catch {}
      }
    }

    if (!comments && task.review_comments && !task.review_comments.includes("[Team Lead")) {
      comments = task.review_comments.replace(/<!--DELIVERABLE_PAYLOAD:[\s\S]*?-->/g, "").trim();
    }

    return {
      comments: comments || "Work proof submitted previously.",
      attachments,
    };
  }, [task]);

  // Check if current user is the assigned employee
  const isAssigned = useMemo(() => {
    if (!task) return false;
    const uid = currentUserId || employeeProfile?.id;
    const authId = employeeProfile?.auth_user_id;
    return Boolean(
      (uid && (task.assigned_to === uid || task.planned_assignee_id === uid || task.assignee?.id === uid)) ||
      (authId && (task.assigned_to === authId || task.planned_assignee_id === authId))
    );
  }, [task, currentUserId, employeeProfile]);

  if (!isOpen || !task || !mounted) return null;

  // Move task to IN_PROGRESS when employee starts addressing suggestions
  const handleStartWorking = async () => {
    setIsSubmitting(true);
    setFeedbackError("");
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      const res = await fetch(`/api/projects/tasks/${task.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          status: "IN_PROGRESS",
          progress: 25,
          comments: "Started working on Team Lead suggestions",
        }),
      });

      const data = await res.json();
      if (res.ok) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("project-task-updated", {
              detail: {
                taskId: task.id,
                status: "IN_PROGRESS",
                new: data.task,
                project_id: project?.id,
              },
            })
          );
        }
        if (onTaskUpdated) onTaskUpdated();
        onClose();
      } else {
        setFeedbackError(data.message || "Failed to update task status.");
      }
    } catch (err) {
      console.error("Error starting work on suggestions:", err);
      setFeedbackError("Network error updating task status.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn overflow-y-auto"
    >
      <div className="relative w-full max-w-xl bg-white rounded-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-scaleIn m-auto">
        {/* Top Header matching exact Create Sprint format */}
        <div className="px-6 pt-5 pb-3 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-3 text-base">
            <span className="font-bold text-slate-900">Task:</span>
            <span className="text-blue-600 font-semibold border-b-2 border-blue-600 pb-0.5 text-sm">
              Review Suggestions
            </span>
          </div>

          {/* Red square close button */}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="w-6 h-6 border border-rose-300 hover:border-rose-400 text-rose-400 hover:text-rose-600 rounded flex items-center justify-center text-xs transition cursor-pointer disabled:opacity-50"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Modal Body matching Create Sprint layout */}
        <div className="px-6 py-4 space-y-4 max-h-[82vh] overflow-y-auto">
          {feedbackError && (
            <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {feedbackError}
            </div>
          )}

          {/* Row: Task Name */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
            <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
              <span className="border-b-2 border-rose-500 pb-0.5">Task Name</span>
            </label>
            <div className="flex-1 border-b border-slate-300 pb-1 text-sm font-semibold text-slate-900 truncate">
              {task.title}
            </div>
          </div>

          {/* Section Divider: Suggestions Section */}
          <div className="text-blue-600 font-semibold border-b border-blue-500 pb-1 text-sm pt-2 flex items-center justify-between">
            <span>Instructions &amp; Feedback</span>
            <span className="text-xs text-slate-500 font-normal">
              Status: To Do (Revision Required)
            </span>
          </div>

          {/* Row: Reviewed By */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
            <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
              Reviewed by
            </label>
            <div className="flex-1 flex items-center justify-between border-b border-slate-300 pb-1 text-sm text-slate-900">
              <span className="font-semibold">{reviewer?.full_name || "Team Lead"}</span>
              {reviewTime && (
                <span className="text-xs text-slate-500 font-mono">
                  {new Date(reviewTime).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>
          </div>

          {/* Row: Instructions */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1">
            <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0 pt-0.5">
              Instructions
            </label>
            <div className="flex-1">
              <div className="w-full p-2.5 rounded bg-slate-50 border border-slate-200 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed font-sans">
                {suggestionText}
              </div>
            </div>
          </div>

          {/* Section: Original Deliverable Proof (if present) */}
          {(originalDeliverable.comments || originalDeliverable.attachments.length > 0) && (
            <div className="space-y-3 pt-2">
              <div className="text-blue-600 font-semibold border-b border-blue-500 pb-1 text-sm pt-2">
                Previous Submission Reference
              </div>

              {originalDeliverable.comments && (
                <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1">
                  <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0 pt-0.5">
                    Your Notes
                  </label>
                  <div className="flex-1">
                    <div className="w-full p-2.5 rounded bg-slate-50 border border-slate-200 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed font-sans">
                      {originalDeliverable.comments}
                    </div>
                  </div>
                </div>
              )}

              {originalDeliverable.attachments.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1">
                  <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0 pt-0.5">
                    Screenshots ({originalDeliverable.attachments.length})
                  </label>
                  <div className="flex-1">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {originalDeliverable.attachments.map((att, idx) => {
                        const imgSrc = att?.dataUrl || att?.url || (typeof att === "string" ? att : "");
                        const imgName =
                          att?.name ||
                          (typeof att === "string"
                            ? att.split("/").pop()
                            : `Screenshot ${idx + 1}`);
                        const keyId = att?.id ? `sugg-att-${att.id}` : `sugg-att-idx-${idx}`;
                        return (
                          <button
                            key={keyId}
                            type="button"
                            onClick={() => setActiveScreenshot(att)}
                            className="group relative rounded border border-slate-200 bg-white overflow-hidden p-1 text-left hover:border-blue-500 hover:shadow-xs transition cursor-pointer"
                          >
                            <div className="h-20 w-full bg-slate-100 rounded overflow-hidden relative flex items-center justify-center">
                              <img
                                src={imgSrc}
                                alt={imgName}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              />
                              <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <span className="px-2 py-0.5 rounded bg-black/75 text-white text-[10px] font-semibold">
                                  Expand
                                </span>
                              </div>
                            </div>
                            <p className="text-[10px] font-medium text-slate-700 truncate pt-1 px-0.5" title={imgName}>{imgName}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Bottom Action Buttons matching Create Sprint format */}
          <div className="pt-6 pb-2 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                onClose();
                if (onOpenFullDetail) onOpenFullDetail(task);
              }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium underline cursor-pointer"
            >
              Open Full Task Details ↗
            </button>

            <div className="flex items-center gap-3">
              {isAssigned && task.status === "TODO" && (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleStartWorking}
                  className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition cursor-pointer disabled:opacity-50 shadow-xs"
                >
                  {isSubmitting ? "Starting…" : "Start Working (Move to In Progress)"}
                </button>
              )}
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onClose}
                className="px-4 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-sm transition cursor-pointer disabled:opacity-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox for enlarged screenshot proof */}
      {activeScreenshot && (
        <div
          onClick={() => setActiveScreenshot(null)}
          className="fixed inset-0 z-[10000] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn cursor-zoom-out"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-700 flex flex-col cursor-default"
          >
            <div className="px-4 py-2.5 bg-slate-800 flex items-center justify-between border-b border-slate-700 text-white text-xs">
              <span className="font-semibold truncate">
                {activeScreenshot?.name ||
                  (typeof activeScreenshot === "string"
                    ? activeScreenshot.split("/").pop()
                    : "Screenshot Preview")}
              </span>
              <button
                type="button"
                onClick={() => setActiveScreenshot(null)}
                className="text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-slate-700 cursor-pointer font-bold"
              >
                ✕ Close
              </button>
            </div>
            <div className="p-2 overflow-auto max-h-[80vh] flex items-center justify-center bg-black">
              <img
                src={
                  activeScreenshot?.dataUrl ||
                  activeScreenshot?.url ||
                  (typeof activeScreenshot === "string" ? activeScreenshot : "")
                }
                alt={
                  activeScreenshot?.name ||
                  (typeof activeScreenshot === "string"
                    ? activeScreenshot.split("/").pop()
                    : "Screenshot")
                }
                className="max-w-full max-h-[75vh] object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
