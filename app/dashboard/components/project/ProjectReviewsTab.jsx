/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import TaskDetailModal from "./TaskDetailModal";

export default function ProjectReviewsTab({
  project,
  tasks = [],
  sprints = [],
  epics = [],
  departmentEmployees = [],
  teamLeads = [],
  employeeProfile,
  currentUserId,
  onTasksUpdated,
}) {
  const [filterMode, setFilterMode] = useState("pending"); // "pending" | "history" | "all"
  const [selectedSprintFilter, setSelectedSprintFilter] = useState("all");
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState("all");
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState(null);
  const [activeScreenshotModal, setActiveScreenshotModal] = useState(null);

  // Suggestion Mode per-task: taskId | null
  const [suggestingTaskId, setSuggestingTaskId] = useState(null);
  const [suggestionNotes, setSuggestionNotes] = useState("");
  const [suggestionTitle, setSuggestionTitle] = useState("");
  const [suggestionPriority, setSuggestionPriority] = useState("MEDIUM");
  const [suggestionAssigneeId, setSuggestionAssigneeId] = useState("");

  const [isProcessing, setIsProcessing] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);

  const cleanRole = (employeeProfile?.role || "").toLowerCase().replace(/[\s_-]+/g, "");
  const isOwnerOrAdmin = cleanRole.includes("admin") || cleanRole.includes("owner") || cleanRole.includes("hr");
  const isProjectOwnerOrCreator = project?.owner_id === employeeProfile?.id || project?.created_by === employeeProfile?.id;
  const isAssignedLead = project?.team_lead_id === employeeProfile?.id;
  const isManagerRole = cleanRole.includes("manager") || cleanRole.includes("lead");
  const canReview = isOwnerOrAdmin || isProjectOwnerOrCreator || isAssignedLead || isManagerRole;

  const allEmployees = useMemo(() => {
    const map = new Map();
    if (project?.teamLead?.id) {
      map.set(project.teamLead.id, { ...project.teamLead, roleTag: "Team Lead" });
    } else if (project?.team_lead_id) {
      const lead = (teamLeads || []).find((l) => l.id === project.team_lead_id) || (departmentEmployees || []).find((e) => e.id === project.team_lead_id);
      if (lead) map.set(lead.id, { ...lead, roleTag: "Team Lead" });
    }
    if (project?.creator?.id) {
      map.set(project.creator.id, { ...project.creator, roleTag: "Project Owner" });
    } else if (project?.created_by || project?.owner_id) {
      const creatorId = project.created_by || project.owner_id;
      const creator = (departmentEmployees || []).find((e) => e.id === creatorId) || (teamLeads || []).find((l) => l.id === creatorId);
      if (creator) map.set(creator.id, { ...creator, roleTag: "Project Owner" });
    }
    if (Array.isArray(project?.teamMembers)) {
      project.teamMembers.forEach((m) => {
        if (m?.id && !map.has(m.id)) {
          map.set(m.id, { ...m, roleTag: m.designation || m.role || "Member" });
        }
      });
    }
    if (Array.isArray(project?.team_members)) {
      project.team_members.forEach((id) => {
        const cleanId = typeof id === "object" ? id?.id : id;
        if (cleanId && !map.has(cleanId)) {
          const emp = (typeof id === "object" ? id : null) || (departmentEmployees || []).find((e) => e.id === cleanId) || (teamLeads || []).find((l) => l.id === cleanId);
          if (emp) map.set(cleanId, { ...emp, roleTag: emp.designation || emp.role || "Member" });
        }
      });
    }
    [...(departmentEmployees || []), ...(teamLeads || [])].forEach((emp) => {
      if (emp?.id && !map.has(emp.id)) {
        map.set(emp.id, { ...emp, roleTag: emp.designation || emp.role || "Employee" });
      }
    });
    return Array.from(map.values()).sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
  }, [project, departmentEmployees, teamLeads]);

  // Real-time listener for tasks updated
  useEffect(() => {
    const handleTaskUpdated = () => {
      if (onTasksUpdated) onTasksUpdated();
    };
    window.addEventListener("project-task-updated", handleTaskUpdated);
    return () => window.removeEventListener("project-task-updated", handleTaskUpdated);
  }, [onTasksUpdated]);

  // All reviewable tasks (either currently in REVIEW, or have review submission metadata)
  const reviewTasks = useMemo(() => {
    return tasks.filter((t) => {
      const isReviewStatus = t.status === "REVIEW";
      let atts = t.review_attachments;
      if (typeof atts === "string") {
        try {
          atts = JSON.parse(atts);
        } catch {
          atts = [];
        }
      }
      const hasReviewMeta = Boolean(
        t.review_comments ||
        (Array.isArray(atts) && atts.length > 0) ||
        t.review_submitted_at
      );
      return isReviewStatus || hasReviewMeta;
    });
  }, [tasks]);

  const pendingReviewTasks = useMemo(() => {
    return tasks.filter((t) => t.status === "REVIEW");
  }, [tasks]);

  const approvedReviewTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (t.status !== "COMPLETED") return false;
      let atts = t.review_attachments;
      if (typeof atts === "string") {
        try {
          atts = JSON.parse(atts);
        } catch {
          atts = [];
        }
      }
      return Boolean(
        t.review_comments ||
        (Array.isArray(atts) && atts.length > 0) ||
        t.review_submitted_at
      );
    });
  }, [tasks]);

  // Filtered items based on user selection
  const filteredTasks = useMemo(() => {
    return reviewTasks.filter((t) => {
      if (filterMode === "pending" && t.status !== "REVIEW") return false;
      if (filterMode === "history" && t.status !== "COMPLETED") return false;

      if (selectedSprintFilter !== "all" && t.sprint_id !== selectedSprintFilter) {
        return false;
      }

      if (selectedEmployeeFilter !== "all") {
        const assigneeId = t.assigned_to || t.planned_assignee_id || t.assignee_id;
        if (assigneeId !== selectedEmployeeFilter) return false;
      }

      return true;
    }).sort((a, b) => {
      // Sort pending first, then by submitted timestamp descending
      if (a.status === "REVIEW" && b.status !== "REVIEW") return -1;
      if (b.status === "REVIEW" && a.status !== "REVIEW") return 1;
      const dateA = new Date(a.review_submitted_at || a.updated_at || 0).getTime();
      const dateB = new Date(b.review_submitted_at || b.updated_at || 0).getTime();
      return dateB - dateA;
    });
  }, [reviewTasks, filterMode, selectedSprintFilter, selectedEmployeeFilter]);

  // Helper to format relative submission time
  const getRelativeTime = useCallback((timestamp) => {
    if (!timestamp) return "Recently";
    try {
      const diffMs = Date.now() - new Date(timestamp).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      return `${diffDays}d ago`;
    } catch {
      return "Recently";
    }
  }, []);

  // Team Lead Action: Approve deliverable and mark COMPLETED 100%
  const handleApprove = async (taskId) => {
    setIsProcessing(true);
    setActionMsg(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      const res = await fetch(`/api/projects/tasks/${taskId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          status: "COMPLETED",
          progress: 100,
          comments: "Approved and verified by Team Lead",
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setActionMsg({
          text: "Deliverable approved! Task marked Completed (100%).",
          type: "success",
        });
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("project-task-updated", {
              detail: { new: data.task, project_id: project?.id },
            })
          );
        }
        if (onTasksUpdated) onTasksUpdated();
      } else {
        setActionMsg({
          text: data.message || "Failed to approve deliverable.",
          type: "error",
        });
      }
    } catch (err) {
      console.error("Approve review error:", err);
      setActionMsg({ text: "Network error approving task.", type: "error" });
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (actionMsg) {
      const timer = setTimeout(() => setActionMsg(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [actionMsg]);

  // Open Suggestions Form Mode
  const handleOpenSuggestionsForm = (task) => {
    setSuggestingTaskId(task.id);
    setSuggestionTitle(task.title || "");
    setSuggestionPriority(task.priority || "MEDIUM");
    setSuggestionNotes("");
    setSuggestionAssigneeId(task.assigned_to || task.planned_assignee_id || task.assignee_id || "");
  };

  // Team Lead Action: Submit Suggestions and move task to TO DO
  const handleSubmitSuggestions = async (task) => {
    if (!suggestionNotes.trim()) {
      setActionMsg({
        text: "Please provide suggestions or instructions for the employee.",
        type: "warning",
      });
      return;
    }

    setIsProcessing(true);
    setActionMsg(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      const payload = {
        status: "TODO",
        progress: 0,
        title: suggestionTitle.trim() || task.title,
        priority: suggestionPriority || "MEDIUM",
        assigned_to: suggestionAssigneeId || task.assigned_to || null,
        assignee_id: suggestionAssigneeId || task.assigned_to || null,
        review_feedback: suggestionNotes.trim(),
        comments: `[Team Lead Suggestions]: ${suggestionNotes.trim()}`,
      };

      const res = await fetch(`/api/projects/tasks/${task.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        setActionMsg({
          text: "Suggestions submitted! Task moved to To Do (0% progress).",
          type: "success",
        });
        setSuggestingTaskId(null);
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("project-task-updated", {
              detail: { new: data.task, project_id: project?.id },
            })
          );
        }
        if (onTasksUpdated) onTasksUpdated();
      } else {
        setActionMsg({
          text: data.message || "Failed to submit suggestions.",
          type: "error",
        });
      }
    } catch (err) {
      console.error("Suggestions submit error:", err);
      setActionMsg({ text: "Network error submitting suggestions.", type: "error" });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-5 text-xs text-slate-800 animate-fadeIn">
      {/* Top Banner & Review Metrics Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Metric 1: Pending Reviews */}
        <div
          onClick={() => setFilterMode("pending")}
          className={`p-4 rounded-xl border transition cursor-pointer ${
            filterMode === "pending"
              ? "bg-purple-50/80 border-purple-300 ring-2 ring-purple-400/20 shadow-xs"
              : "bg-white border-slate-200 hover:border-purple-200 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-800">
              Pending Deliverable Reviews
            </span>
            <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" />
          </div>
          <div className="text-2xl font-extrabold text-purple-950 font-mono mt-1">
            {pendingReviewTasks.length}
          </div>
          <p className="text-[11px] text-purple-700 mt-0.5">
            Deliverables waiting for Team Lead / PM verification
          </p>
        </div>

        {/* Metric 2: Approved & Completed Deliverables */}
        <div
          onClick={() => setFilterMode("history")}
          className={`p-4 rounded-xl border transition cursor-pointer ${
            filterMode === "history"
              ? "bg-emerald-50/80 border-emerald-300 ring-2 ring-emerald-400/20 shadow-xs"
              : "bg-white border-slate-200 hover:border-emerald-200 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
              Approved &amp; Verified
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-950 font-mono mt-1">
            {approvedReviewTasks.length}
          </div>
          <p className="text-[11px] text-emerald-700 mt-0.5">
            Deliverables approved to 100% completion
          </p>
        </div>

        {/* Metric 3: Total Deliverable Submissions */}
        <div
          onClick={() => setFilterMode("all")}
          className={`p-4 rounded-xl border transition cursor-pointer ${
            filterMode === "all"
              ? "bg-blue-50/80 border-blue-300 ring-2 ring-blue-400/20 shadow-xs"
              : "bg-white border-slate-200 hover:border-blue-200 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800">
              Total Deliverables
            </span>
            <span className="text-sm">📋</span>
          </div>
          <div className="text-2xl font-extrabold text-blue-950 font-mono mt-1">
            {reviewTasks.length}
          </div>
          <p className="text-[11px] text-blue-700 mt-0.5">
            All submitted task deliverables in this project
          </p>
        </div>
      </div>

      {/* Action Notification Alert */}
      {actionMsg && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between shadow-xs animate-fadeIn ${
            actionMsg.type === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : actionMsg.type === "warning"
              ? "bg-amber-50 border border-amber-200 text-amber-800"
              : "bg-rose-50 border border-rose-200 text-rose-800"
          }`}
        >
          <div className="flex items-center gap-2">
            <span>{actionMsg.type === "success" ? "✓" : "⚠️"}</span>
            <span>{actionMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionMsg(null)}
            className="text-xs font-bold hover:opacity-75 cursor-pointer px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-white border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setFilterMode("pending")}
            className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
              filterMode === "pending"
                ? "bg-white text-purple-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Pending Review ({pendingReviewTasks.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode("history")}
            className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
              filterMode === "history"
                ? "bg-white text-emerald-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Approved History ({approvedReviewTasks.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode("all")}
            className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
              filterMode === "all"
                ? "bg-white text-blue-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            All Submissions ({reviewTasks.length})
          </button>
        </div>

        {/* Dropdown Filters */}
        <div className="flex items-center gap-2">
          {/* Sprint Filter */}
          <select
            value={selectedSprintFilter}
            onChange={(e) => setSelectedSprintFilter(e.target.value)}
            className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 font-medium focus:outline-none focus:border-blue-600 cursor-pointer"
          >
            <option value="all">All Sprints</option>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.status})
              </option>
            ))}
          </select>

          {/* Submitter Filter */}
          <select
            value={selectedEmployeeFilter}
            onChange={(e) => setSelectedEmployeeFilter(e.target.value)}
            className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 font-medium focus:outline-none focus:border-blue-600 cursor-pointer"
          >
            <option value="all">All Employees</option>
            {[...(departmentEmployees || []), ...(teamLeads || [])]
              .filter((e, idx, self) => e?.id && self.findIndex((m) => m.id === e.id) === idx)
              .map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name}
                </option>
              ))}
          </select>
        </div>
      </div>

      {/* Review Cards Feed */}
      {filteredTasks.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white border border-dashed border-slate-300 text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center text-xl mx-auto font-bold">
            🔍
          </div>
          <h4 className="text-sm font-bold text-slate-800">
            {filterMode === "pending"
              ? "All Caught Up! No Deliverables Pending Review"
              : filterMode === "history"
              ? "No Approved Deliverables Yet"
              : "No Review Submissions Found"}
          </h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {filterMode === "pending"
              ? "When team members transition tasks to Review with screenshots and completion notes, they will appear here for Team Lead validation."
              : "Tasks that were approved and completed will appear in this history feed."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTasks.map((task) => {
            let rawAttachments = [];
            if (task.review_attachments) {
              if (Array.isArray(task.review_attachments)) {
                rawAttachments = task.review_attachments;
              } else if (typeof task.review_attachments === "string") {
                try {
                  const parsed = JSON.parse(task.review_attachments);
                  if (Array.isArray(parsed)) rawAttachments = parsed;
                } catch {}
              }
            }

            let embeddedComments = "";
            let embeddedAttachments = [];
            let embeddedSubmittedAt = null;

            const searchFields = [
              task.review_comments,
              task.comments,
              task.last_status_comment,
              task.description,
            ];

            for (const field of searchFields) {
              if (typeof field === "string" && field.includes("<!--DELIVERABLE_PAYLOAD:")) {
                try {
                  const match = field.match(/<!--DELIVERABLE_PAYLOAD:([\s\S]*?)-->/);
                  if (match && match[1]) {
                    const parsed = JSON.parse(match[1]);
                    if (parsed.comments && !embeddedComments) embeddedComments = parsed.comments;
                    if (Array.isArray(parsed.attachments) && rawAttachments.length === 0 && embeddedAttachments.length === 0) {
                      embeddedAttachments = parsed.attachments;
                    }
                    if (parsed.submitted_at && !embeddedSubmittedAt) embeddedSubmittedAt = parsed.submitted_at;
                  }
                } catch (e) {
                  console.warn("Payload parse error in Review Tab:", e);
                }
              }
            }

            if (rawAttachments.length === 0 && embeddedAttachments.length > 0) {
              rawAttachments = embeddedAttachments;
            }

            let rawDirect = task.review_comments || task.comments || task.last_status_comment || "";
            let displayComments = embeddedComments || rawDirect.replace(/<!--DELIVERABLE_PAYLOAD:[\s\S]*?-->/g, "").trim();
            if (!displayComments) displayComments = "No detailed submission comments provided.";

            const submitter = task.assignee || task.planned_assignee || null;
            const submitterName = submitter?.full_name || "Assigned Employee";
            const sprint = sprints.find((s) => s.id === task.sprint_id) || task.sprint || null;
            const isSuggesting = suggestingTaskId === task.id;
            const isPending = task.status === "REVIEW";
            const isApproved = task.status === "COMPLETED";
            const submittedTime = task.review_submitted_at || embeddedSubmittedAt || task.updated_at;

            return (
              <div
                key={task.id}
                className={`p-5 rounded-2xl border transition-all shadow-2xs space-y-3.5 ${
                  isPending
                    ? "bg-white border-purple-200 hover:border-purple-300 hover:shadow-md"
                    : "bg-slate-50/70 border-slate-200"
                }`}
              >
                {/* Header Row: Status, Submitter, Timestamp & Story Points */}
                <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    {/* Status Badge */}
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border flex items-center gap-1.5 ${
                        isPending
                          ? "bg-purple-100 text-purple-900 border-purple-300"
                          : isApproved
                          ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                          : "bg-slate-100 text-slate-700 border-slate-300"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isPending ? "bg-purple-600 animate-pulse" : "bg-emerald-600"
                        }`}
                      />
                      <span>{isPending ? "Pending Team Lead Review" : "Approved & Completed"}</span>
                    </span>

                    {/* Task Type */}
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                      {task.task_type || "TASK"}
                    </span>

                    {/* Priority */}
                    {task.priority && (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          task.priority === "URGENT"
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : task.priority === "HIGH"
                            ? "bg-orange-50 text-orange-700 border-orange-200"
                            : "bg-slate-50 text-slate-600 border-slate-200"
                        }`}
                      >
                        {task.priority}
                      </span>
                    )}

                    {/* Sprint Name */}
                    {sprint && (
                      <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        🏃 {sprint.name}
                      </span>
                    )}
                  </div>

                  {/* Right side: Timestamp & Points */}
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="font-mono text-[11px] text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 font-semibold" title={submittedTime}>
                      🕒 {getRelativeTime(submittedTime)}
                    </span>
                    {task.story_points && (
                      <span className="font-mono font-bold text-slate-700 text-xs">
                        {task.story_points} pts
                      </span>
                    )}
                  </div>
                </div>

                {/* Main Content: Title, Submitter & Employee Comments */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3
                      onClick={() => setSelectedTaskForDetail(task)}
                      className="text-sm sm:text-base font-bold text-slate-900 hover:text-blue-600 transition cursor-pointer leading-snug"
                    >
                      {task.title}
                    </h3>
                  </div>

                  {/* Submitter Card */}
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center text-[10px] font-bold">
                      {(submitterName || "E")[0].toUpperCase()}
                    </div>
                    <span className="font-semibold text-slate-800">{submitterName}</span>
                    {submitter?.designation && (
                      <span className="text-slate-400">({submitter.designation})</span>
                    )}
                  </div>

                  {/* Employee Completion Notes Box */}
                  <div className="p-3 rounded-xl bg-purple-50/60 border border-purple-100 text-xs text-slate-800 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-900 block">
                      💬 Employee Completion Notes:
                    </span>
                    <p className="whitespace-pre-wrap leading-relaxed font-sans">
                      {displayComments}
                    </p>
                  </div>
                </div>

                {/* Screenshots Gallery */}
                {rawAttachments.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                        <span>📸 Deliverable Proof Screenshots</span>
                        <span className="px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-800 text-[10px] font-bold">
                          {rawAttachments.length}
                        </span>
                      </span>
                      <span className="text-[10px] text-slate-400 italic">Click image to enlarge</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                      {rawAttachments.map((att, idx) => {
                        const imgSrc = att.dataUrl || att.url || att;
                        const imgName = att.name || `Screenshot ${idx + 1}`;
                        const keyId = att.id ? `rev-tab-att-${att.id}` : `rev-tab-att-idx-${idx}`;
                        return (
                          <div
                            key={keyId}
                            onClick={() => setActiveScreenshotModal(att)}
                            className="group relative rounded-lg border border-purple-200 bg-white overflow-hidden p-1 hover:border-purple-400 hover:shadow-md transition cursor-pointer"
                          >
                            <div className="h-16 w-full rounded overflow-hidden bg-slate-100 flex items-center justify-center relative">
                              <img
                                src={imgSrc}
                                alt={imgName}
                                className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                              />
                              <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                                <span className="px-1.5 py-0.5 rounded bg-black/80 text-white text-[9px] font-bold">
                                  🔍 View
                                </span>
                              </div>
                            </div>
                            <p className="text-[9px] font-medium text-slate-700 truncate pt-1 px-0.5" title={imgName}>
                              {imgName}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Team Lead Action Controls */}
                {canReview && isPending && (
                  <div className="pt-3 border-t border-slate-200/80 space-y-3">
                    {/* Action Bar (When no inline form is currently opened for this task) */}
                    {suggestingTaskId !== task.id && (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                          <span>👤</span>
                          <span>
                            As <strong>Team Lead</strong>, inspect the deliverable proof and choose an action:
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {/* 1. Emerald Approve Button */}
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleApprove(task.id)}
                            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                          >
                            <span>✓</span>
                            <span>Approve (100%)</span>
                          </button>

                          {/* 2. Amber Suggestions Button */}
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleOpenSuggestionsForm(task)}
                            className="px-3.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50 shadow-2xs"
                          >
                            <span>💬</span>
                            <span>Give Suggestions &amp; Move to To Do</span>
                          </button>

                          {/* 3. Full Details Modal */}
                          <button
                            type="button"
                            onClick={() => setSelectedTaskForDetail(task)}
                            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer"
                          >
                            Full Details ↗
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Dedicated Team Lead Suggestion / Feedback Form (Amber Theme) */}
                    {suggestingTaskId === task.id && (
                      <div className="p-4 rounded-xl bg-amber-50/95 border border-amber-300 shadow-xs space-y-3 animate-fadeIn text-xs">
                        <div className="flex items-center justify-between pb-2 border-b border-amber-200">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-600 animate-pulse" />
                            <span className="font-extrabold text-amber-950 text-xs">
                              💬 Give Suggestions &amp; Move Task to To Do
                            </span>
                          </div>
                          <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">
                            Status ➔ TO DO (0% Progress)
                          </span>
                        </div>

                        {/* 2-Column Grid for Task Title & Priority */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div className="sm:col-span-2 space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-amber-900 block">
                              Task Title
                            </label>
                            <input
                              type="text"
                              value={suggestionTitle}
                              onChange={(e) => setSuggestionTitle(e.target.value)}
                              placeholder="Task title"
                              className="w-full text-xs p-2 rounded-lg border border-amber-300 bg-white focus:outline-none focus:border-amber-600 text-slate-900 font-medium"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-amber-900 block">
                              Priority
                            </label>
                            <select
                              value={suggestionPriority}
                              onChange={(e) => setSuggestionPriority(e.target.value)}
                              className="w-full text-xs p-2 rounded-lg border border-amber-300 bg-white focus:outline-none focus:border-amber-600 text-slate-900 font-semibold cursor-pointer"
                            >
                              <option value="URGENT">Urgent</option>
                              <option value="HIGH">High</option>
                              <option value="MEDIUM">Medium</option>
                              <option value="LOW">Low</option>
                            </select>
                          </div>
                        </div>

                        {/* Change Instructions / Suggestions Notes */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-amber-900 block">
                            <span className="border-b-2 border-amber-500 pb-0.5">Suggestions &amp; Instructions for Employee *</span>
                          </label>
                          <textarea
                            rows={3}
                            value={suggestionNotes}
                            onChange={(e) => setSuggestionNotes(e.target.value)}
                            placeholder="Detail the improvements, missing items, or suggestions for the employee before task approval…"
                            className="w-full text-xs p-2.5 rounded-lg border border-amber-300 bg-white focus:outline-none focus:border-amber-600 resize-none text-slate-800 placeholder:text-slate-400 font-sans leading-relaxed"
                            autoFocus
                          />
                        </div>

                        {/* Reassign / Assign Task */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-amber-900 block">
                            Assign Task To
                          </label>
                          <select
                            value={suggestionAssigneeId}
                            onChange={(e) => setSuggestionAssigneeId(e.target.value)}
                            className="w-full text-xs p-2 rounded-lg border border-amber-300 bg-white focus:outline-none focus:border-amber-600 text-slate-900 cursor-pointer"
                          >
                            <option value="">Unassigned</option>
                            {allEmployees.map((emp) => (
                              <option key={emp.id} value={emp.id}>
                                {emp.roleTag ? `[${emp.roleTag}] ` : ""}{emp.full_name} {emp.designation ? `(${emp.designation})` : ""}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Suggestion Form Actions */}
                        <div className="flex items-center gap-2 pt-1 border-t border-amber-200">
                          <button
                            type="button"
                            disabled={isProcessing || !suggestionNotes.trim()}
                            onClick={() => handleSubmitSuggestions(task)}
                            className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs cursor-pointer disabled:opacity-50 transition shadow-xs flex items-center gap-1.5"
                          >
                            <span>💬</span>
                            <span>Submit Suggestions &amp; Move to To Do</span>
                          </button>
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => setSuggestingTaskId(null)}
                            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
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

      {/* Fullscreen Screenshot Lightbox Modal */}
      {activeScreenshotModal && (
        <div
          onClick={() => setActiveScreenshotModal(null)}
          className="fixed inset-0 z-[10000] bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-fadeIn cursor-zoom-out"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-700 flex flex-col cursor-default"
          >
            <div className="px-4 py-2.5 bg-slate-800 flex items-center justify-between border-b border-slate-700 text-white text-xs">
              <span className="font-semibold truncate">
                {activeScreenshotModal.name || "Screenshot Preview"}
              </span>
              <button
                type="button"
                onClick={() => setActiveScreenshotModal(null)}
                className="text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-slate-700 cursor-pointer font-bold"
              >
                ✕ Close
              </button>
            </div>
            <div className="p-2 overflow-auto max-h-[80vh] flex items-center justify-center bg-black">
              <img
                src={activeScreenshotModal.dataUrl || activeScreenshotModal.url || activeScreenshotModal}
                alt={activeScreenshotModal.name || "Screenshot"}
                className="max-w-full max-h-[75vh] object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
