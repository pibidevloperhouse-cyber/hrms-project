"use client";

import React, { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import TaskDetailModal from "./TaskDetailModal";

const EPIC_COLORS = ["#3b82f6", "#6366f1", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6"];

const EPIC_STATUSES = [
  { id: "PLANNING", label: "Planning", bg: "bg-slate-100 text-slate-700" },
  { id: "IN_PROGRESS", label: "In Progress", bg: "bg-blue-50 text-blue-700 border border-blue-200" },
  { id: "COMPLETED", label: "Completed", bg: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  { id: "ON_HOLD", label: "On Hold", bg: "bg-amber-50 text-amber-700 border border-amber-200" },
];

export default function ProjectEpicsTab({
  project,
  epics = [],
  tasks = [],
  sprints = [],
  departmentEmployees = [],
  teamLeads = [],
  employeeProfile = null,
  currentUserId,
  onEpicsUpdated,
  onTasksUpdated,
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState(null);
  const [expandedEpics, setExpandedEpics] = useState({});
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creatorNote, setCreatorNote] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("IN_PROGRESS");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [updatingEpicId, setUpdatingEpicId] = useState(null);

  const toggleExpandEpic = (epicId) => {
    setExpandedEpics((prev) => ({
      ...prev,
      [epicId]: !prev[epicId],
    }));
  };

  const handleCreateEpic = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    setFormError("");

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      const res = await fetch(`/api/projects/${project.id}/epics`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          creator_note: creatorNote.trim(),
          color,
          status,
          start_date: startDate || null,
          end_date: endDate || null,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setName("");
        setDescription("");
        setCreatorNote("");
        setColor("#3b82f6");
        setStatus("IN_PROGRESS");
        setStartDate("");
        setEndDate("");
        setIsModalOpen(false);
        if (onEpicsUpdated) onEpicsUpdated();
      } else {
        setFormError(data.message || "Failed to create epic.");
      }
    } catch (err) {
      setFormError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (epicId, newStatus) => {
    setUpdatingEpicId(epicId);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      const res = await fetch(`/api/projects/${project.id}/epics`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          epic_id: epicId,
          status: newStatus,
        }),
      });

      if (res.ok && onEpicsUpdated) {
        onEpicsUpdated();
      }
    } catch (err) {
      console.error("Failed to update epic status:", err);
    } finally {
      setUpdatingEpicId(null);
    }
  };

  return (
    <div className="space-y-4 text-xs text-slate-800">
      {/* Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">Project Epics</h3>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold">
              {epics.length} total
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            High-level initiatives and strategic deliverables. Creator attribution is automatically recorded.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="h-8.5 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
        >
          <span>+</span>
          <span>Create Epic</span>
        </button>
      </div>

      {/* Epics Grid */}
      {epics.length === 0 ? (
        <div className="p-8 rounded-xl bg-white border border-slate-200 text-center text-slate-400 italic">
          No epics created for this project yet. Click &quot;+ Create Epic&quot; to organize features and record creator notes.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {epics.map((epic) => {
            const epicTasks = tasks.filter((t) => t.epic_id === epic.id);
            const total = epicTasks.length;
            const completed = epicTasks.filter((t) => t.status === "COMPLETED").length;
            const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

            // Creator details fallback
            const creatorName =
              epic.creator?.full_name ||
              (epic.created_by ? "Team Member" : project?.creator?.full_name || "Workspace Member");
            const creatorRole =
              epic.creator?.designation ||
              epic.creator?.department ||
              "Contributor";
            const createdDateFormatted = epic.created_at
              ? new Date(epic.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : null;

            return (
              <div
                key={epic.id}
                className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3.5 hover:border-slate-300 transition"
              >
                {/* Title & Status Row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: epic.color || "#3b82f6" }}
                      />
                      <h4 className="font-bold text-slate-900 text-sm truncate">{epic.name}</h4>
                    </div>
                    {epic.description && (
                      <p className="text-slate-600 text-[11px] line-clamp-2 leading-relaxed">
                        {epic.description}
                      </p>
                    )}
                  </div>

                  {/* Status Dropdown */}
                  <select
                    value={epic.status || "IN_PROGRESS"}
                    disabled={updatingEpicId === epic.id}
                    onChange={(e) => handleStatusChange(epic.id, e.target.value)}
                    className="text-[10px] font-bold px-2 py-1 rounded uppercase font-mono bg-slate-50 border border-slate-200 text-slate-700 shrink-0 cursor-pointer focus:outline-none focus:border-blue-600"
                  >
                    {EPIC_STATUSES.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Creator Note Callout (if any note was added) */}
                {epic.creator_note && (
                  <div className="p-2.5 rounded-lg bg-amber-50/80 border border-amber-200/80 text-[11px] text-amber-900 flex items-start gap-2">
                    <span className="shrink-0 text-amber-600 font-semibold text-xs">📝 Note:</span>
                    <span className="leading-snug italic">{epic.creator_note}</span>
                  </div>
                )}

                {/* Progress Bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      {completed} of {total} deliverables done
                    </span>
                    <span className="font-bold text-blue-600">{progress}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-1.5 rounded-full transition-all duration-300"
                      style={{
                        width: `${progress}%`,
                        backgroundColor: epic.color || "#3b82f6",
                      }}
                    />
                  </div>
                </div>

                {/* Date & Deliverables count with toggle button */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                  <span>
                    📅 {epic.start_date || "Start"} → {epic.end_date || "Target"}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleExpandEpic(epic.id)}
                    className="text-blue-600 hover:text-blue-800 font-semibold cursor-pointer flex items-center gap-1 hover:underline"
                  >
                    <span>{expandedEpics[epic.id] ? "Hide Deliverables ▲" : `View ${total} Deliverables ▼`}</span>
                  </button>
                </div>

                {/* Expandable Deliverables List */}
                {expandedEpics[epic.id] && (
                  <div className="p-2.5 rounded-lg bg-slate-50/90 border border-slate-200 space-y-2 animate-fadeIn">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase font-bold tracking-wider px-1">
                      <span>Tasks in this Epic ({total})</span>
                      <span>Status</span>
                    </div>

                    {epicTasks.length === 0 ? (
                      <div className="py-3 text-center text-slate-400 italic text-[11px]">
                        No deliverables linked yet. Assign tasks to this Epic from the Backlog or Sprints tab.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-200/60 bg-white rounded-md border border-slate-200/80">
                        {epicTasks.map((t) => {
                          const sprintName = sprints.find((s) => s.id === t.sprint_id)?.name || (t.sprint?.name ? t.sprint.name : "Backlog");
                          const assigneeName = t.assignee?.full_name || t.planned_assignee?.full_name || "Unassigned";

                          return (
                            <div
                              key={t.id}
                              onClick={() => setSelectedTaskForDetail(t)}
                              className="p-2 hover:bg-slate-50 flex items-center justify-between gap-2 cursor-pointer group transition"
                              title="Click to view or edit task"
                            >
                              <div className="min-w-0 flex-1 flex items-center gap-2">
                                <span
                                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                    t.status === "COMPLETED"
                                      ? "bg-emerald-500"
                                      : t.status === "IN_PROGRESS"
                                      ? "bg-sky-500"
                                      : "bg-slate-400"
                                  }`}
                                />
                                <span className="font-semibold text-slate-900 group-hover:text-blue-600 truncate text-[11px]">
                                  {t.title}
                                </span>
                                <span className="text-[9px] font-mono px-1 rounded bg-slate-100 text-slate-500 shrink-0">
                                  {t.story_points || 1} pts
                                </span>
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0 font-medium">
                                  {sprintName}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] text-slate-500">{assigneeName}</span>
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase font-mono ${
                                    t.status === "COMPLETED"
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : t.status === "IN_PROGRESS"
                                      ? "bg-sky-50 text-sky-700 border border-sky-200"
                                      : "bg-slate-100 text-slate-600"
                                  }`}
                                >
                                  {t.status}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Creator Attribution Note Footer */}
                <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {epic.creator?.avatar_url ? (
                      <img
                        src={epic.creator.avatar_url}
                        alt={creatorName}
                        className="w-5.5 h-5.5 rounded-full object-cover border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="w-5.5 h-5.5 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-[10px] shrink-0 border border-slate-200">
                        {creatorName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 leading-tight">
                      <div className="text-[10px] text-slate-400">Created by</div>
                      <div className="text-xs font-semibold text-slate-800 truncate">
                        {creatorName}
                        <span className="text-slate-400 font-normal ml-1">
                          ({creatorRole})
                        </span>
                      </div>
                    </div>
                  </div>

                  {createdDateFormatted && (
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">
                      {createdDateFormatted}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Epic Modal */}
      {isModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmitting) setIsModalOpen(false);
          }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto animate-fadeIn"
        >
          <div className="relative w-full max-w-xl bg-white rounded-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col m-auto my-auto animate-scaleIn">
            {/* Top Header matching reference format */}
            <div className="px-6 pt-5 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-3 text-base">
                <span className="font-bold text-slate-900">Create:</span>
                <span className="text-blue-600 font-semibold border-b-2 border-blue-600 pb-0.5 text-sm">
                  Epic
                </span>
              </div>

              {/* Red square close button */}
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setIsModalOpen(false)}
                className="w-6 h-6 border border-rose-300 hover:border-rose-400 text-rose-400 hover:text-rose-600 rounded flex items-center justify-center text-xs transition cursor-pointer disabled:opacity-50"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleCreateEpic} className="px-6 py-4 space-y-4 max-h-[80vh] overflow-y-auto">
              {formError && (
                <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                  {formError}
                </div>
              )}

              {/* Row: Epic Name with red underline indicator */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                  <span className="border-b-2 border-rose-500 pb-0.5">
                    Epic Name
                  </span>
                </label>
                <div className="flex-1">
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g., Auth & Role-Based Access Control"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-1 text-sm bg-transparent text-slate-900 transition-colors placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Row: Description */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-2">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0 pt-1">
                  Description
                </label>
                <div className="flex-1">
                  <textarea
                    rows={2}
                    placeholder="Objectives, deliverables, milestones…"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-1 text-sm bg-transparent text-slate-900 resize-none transition-colors placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Section Divider: Default Section */}
              <div className="text-blue-600 font-semibold border-b border-blue-500 pb-1 text-sm pt-3">
                Default Section
              </div>

              {/* Row: Owner (Recorded Creator) */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                  Owner
                </label>
                <div className="flex-1 flex items-center justify-between border-b border-slate-300 pb-1 text-sm">
                  <span className="font-semibold text-slate-800 text-xs truncate">
                    {employeeProfile?.full_name || "Current User"}{" "}
                    <span className="text-slate-400 font-normal">
                      ({employeeProfile?.designation || employeeProfile?.department || "Member"})
                    </span>
                  </span>
                  <div className="text-blue-600 text-xs">▼</div>
                </div>
              </div>

              {/* Row: Epic Color */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                  Epic Color
                </label>
                <div className="flex-1 flex items-center gap-2 border-b border-slate-300 pb-1.5">
                  {EPIC_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-5 h-5 rounded-full cursor-pointer transition ${
                        color === c ? "ring-2 ring-offset-1 ring-blue-600 scale-110" : ""
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Row: Initial Status */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                  Status
                </label>
                <div className="flex-1 relative">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-1 text-sm bg-transparent text-slate-900 appearance-none pr-6 cursor-pointer"
                  >
                    {EPIC_STATUSES.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.label}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center text-blue-600 text-xs">
                    ▼
                  </div>
                </div>
              </div>

              {/* Row: Start Date */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                  Start Date
                </label>
                <div className="flex-1">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-1 text-sm bg-transparent text-slate-900"
                  />
                </div>
              </div>

              {/* Row: End Date */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                  End Date
                </label>
                <div className="flex-1">
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-1 text-sm bg-transparent text-slate-900"
                  />
                </div>
              </div>

              {/* Row: Creator Note */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                  Creator Note
                </label>
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="e.g., Created for Q4 sprint kickoff; approved by stakeholders"
                    value={creatorNote}
                    onChange={(e) => setCreatorNote(e.target.value)}
                    className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-1 text-sm bg-transparent text-slate-900 placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Bottom Action Buttons: Blue Create & Clean Cancel */}
              <div className="pt-6 pb-2 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={isSubmitting || !name.trim()}
                  className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition cursor-pointer disabled:opacity-50 shadow-xs"
                >
                  {isSubmitting ? "Creating…" : "Create"}
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-sm transition cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detailed Task Properties Modal */}
      <TaskDetailModal
        task={
          selectedTaskForDetail
            ? tasks.find((t) => t.id === selectedTaskForDetail.id) || selectedTaskForDetail
            : null
        }
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
    </div>
  );
}
