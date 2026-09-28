"use client";

import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { authFetch } from "@/lib/api/authFetch";
import TaskDetailModal from "./TaskDetailModal";
import EpicDetailModal from "./EpicDetailModal";

const EPIC_COLORS = ["#3b82f6", "#6366f1", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6"];

const EPIC_STATUSES = [
  { id: "PLANNING", label: "Planning" },
  { id: "IN_PROGRESS", label: "In Progress" },
  { id: "COMPLETED", label: "Completed" },
  { id: "ON_HOLD", label: "On Hold" },
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
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedEpicForModal, setSelectedEpicForModal] = useState(null);
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState(null);
  const [mounted, setMounted] = useState(false);

  // Create Epic Form States
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creatorNote, setCreatorNote] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("IN_PROGRESS");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Map epic task counts
  const epicTasksMap = useMemo(() => {
    const map = new Map();
    (tasks || []).forEach((t) => {
      if (t.epic_id) {
        map.set(t.epic_id, (map.get(t.epic_id) || 0) + 1);
      }
    });
    return map;
  }, [tasks]);

  const handleCreateEpic = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    setFormError("");

    try {
      const res = await authFetch(`/api/projects/${project.id}/epics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        setIsCreateModalOpen(false);
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

  return (
    <div className="space-y-4 animate-fadeIn text-xs text-slate-800">
      {/* Action Header */}
      <div className="flex items-center justify-between p-3.5 rounded-lg bg-white border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-slate-900">Project Epics</h3>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold">
            {epics.length} total
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="px-4 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs"
        >
          <span>+</span>
          <span>Create Epic</span>
        </button>
      </div>

      {/* Clean Epics List */}
      {epics.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-lg border border-slate-200 shadow-2xs space-y-2">
          <p className="text-xs font-semibold text-slate-700">No epics created yet</p>
          <p className="text-[11px] text-slate-400">
            Click &quot;+ Create Epic&quot; to organize features and initiatives.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
          <div className="divide-y divide-slate-100">
            {epics.map((epic) => {
              const taskCount = epicTasksMap.get(epic.id) || 0;
              const statusUpper = (epic.status || "IN_PROGRESS").toUpperCase();

              return (
                <div
                  key={epic.id}
                  onClick={() => setSelectedEpicForModal(epic)}
                  className="px-4 py-3.5 hover:bg-slate-50/80 transition flex items-center justify-between gap-3 cursor-pointer group"
                >
                  {/* Left: Color Dot & Epic Name & Description / Date */}
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0"
                      style={{ backgroundColor: epic.color || "#3b82f6" }}
                    />
                    <div className="min-w-0">
                      <span className="font-semibold text-sm text-slate-900 group-hover:text-blue-600 transition truncate block">
                        {epic.name}
                      </span>
                      <p className="text-xs text-slate-500 truncate">
                        {epic.description
                          ? epic.description
                          : epic.start_date || epic.end_date
                          ? `${epic.start_date ? epic.start_date.split("T")[0] : "Start"} → ${epic.end_date ? epic.end_date.split("T")[0] : "Target"}`
                          : "No description provided"}
                      </p>
                    </div>
                  </div>

                  {/* Right: Task Count & Status Pill */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-slate-500 font-mono">
                      {taskCount} {taskCount === 1 ? "task" : "tasks"}
                    </span>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                        statusUpper === "COMPLETED"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : statusUpper === "IN_PROGRESS"
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "bg-slate-100 text-slate-700 border-slate-200"
                      }`}
                    >
                      {statusUpper === "IN_PROGRESS"
                        ? "In Progress"
                        : statusUpper === "COMPLETED"
                        ? "Completed"
                        : statusUpper === "ON_HOLD"
                        ? "On Hold"
                        : "Planning"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Epic Detail Modal (Popup on click) */}
      {selectedEpicForModal && (
        <EpicDetailModal
          epic={selectedEpicForModal}
          project={project}
          tasks={tasks}
          sprints={sprints}
          isOpen={Boolean(selectedEpicForModal)}
          onClose={() => setSelectedEpicForModal(null)}
          onSelectTask={(task) => {
            setSelectedTaskForDetail(task);
          }}
        />
      )}

      {/* Create Epic Modal with createPortal */}
      {isCreateModalOpen &&
        mounted &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget && !isSubmitting)
                setIsCreateModalOpen(false);
            }}
            className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs overflow-y-auto text-slate-800"
          >
            <div className="relative w-full max-w-xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[88vh] animate-scaleUp">
              {/* Top Header */}
              <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 bg-white shrink-0">
                <div className="flex items-center gap-2.5 text-base">
                  <span className="font-bold text-slate-900">Create:</span>
                  <span className="text-blue-600 font-semibold border-b-2 border-blue-600 pb-0.5 text-sm">
                    Epic
                  </span>
                </div>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsCreateModalOpen(false)}
                  className="w-7 h-7 border border-rose-300 hover:border-rose-400 text-rose-400 hover:text-rose-600 rounded-md flex items-center justify-center text-xs transition cursor-pointer disabled:opacity-50"
                  title="Close"
                >
                  ✕
                </button>
              </div>

              {/* Form Body */}
              <form
                onSubmit={handleCreateEpic}
                className="px-6 py-4 space-y-4 overflow-y-auto flex-1"
              >
                {formError && (
                  <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                    {formError}
                  </div>
                )}

                {/* Row: Epic Name */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
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
                <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1">
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
                <div className="text-blue-600 font-semibold border-b border-blue-500 pb-1 text-sm pt-2">
                  Default Section
                </div>

                {/* Row: Owner */}
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

                {/* Row: Status */}
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

                {/* Bottom Action Buttons */}
                <div className="pt-4 pb-1 flex items-center gap-3 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={isSubmitting || !name.trim()}
                    className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs transition cursor-pointer disabled:opacity-50 shadow-xs"
                  >
                    {isSubmitting ? "Creating…" : "Create"}
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-4 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-xs transition cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Task Detail Modal */}
      {selectedTaskForDetail && (
        <TaskDetailModal
          task={
            selectedTaskForDetail
              ? tasks.find((t) => t.id === selectedTaskForDetail.id) ||
                selectedTaskForDetail
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
      )}
    </div>
  );
}
