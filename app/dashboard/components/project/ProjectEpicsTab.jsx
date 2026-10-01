"use client";

import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { authFetch } from "@/lib/api/authFetch";
import TaskDetailModal from "./TaskDetailModal";
import EpicDetailModal from "./EpicDetailModal";

const EPIC_COLORS = ["#3b82f6", "#6366f1", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4"];

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
  const [color, setColor] = useState("#3b82f6");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("IN_PROGRESS");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Project date boundaries
  const projectStartDate = project?.start_date ? String(project.start_date).split("T")[0] : "";
  const projectEndDate = project?.end_date ? String(project.end_date).split("T")[0] : "";

  // Real-time Duration
  const durationDays = useMemo(() => {
    if (!startDate || !endDate) return null;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diff = end - start;
    if (isNaN(diff) || diff < 0) return null;
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
  }, [startDate, endDate]);

  // Client-side date validation against project boundaries
  const dateValidationError = useMemo(() => {
    if (startDate && endDate && endDate < startDate) {
      return "Epic end date cannot be earlier than start date.";
    }
    if (projectEndDate && endDate && endDate > projectEndDate) {
      return `Epic end date (${endDate}) cannot exceed project end date (${projectEndDate}).`;
    }
    if (projectStartDate && startDate && startDate < projectStartDate) {
      return `Epic start date (${startDate}) cannot be earlier than project start date (${projectStartDate}).`;
    }
    return "";
  }, [startDate, endDate, projectStartDate, projectEndDate]);

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

    if (dateValidationError) {
      setFormError(dateValidationError);
      return;
    }

    setIsSubmitting(true);
    setFormError("");

    try {
      const res = await authFetch(`/api/projects/${project.id}/epics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
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
      <div className="flex items-center justify-between p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-slate-900">Project Epics</h3>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold">
            {epics.length} total
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            setFormError("");
            setIsCreateModalOpen(true);
          }}
          className="px-4 py-2 rounded-xl bg-brand-gradient hover:opacity-95 text-white font-semibold text-xs transition cursor-pointer shadow-xs shadow-[#1f6fb2]/20 flex items-center gap-1.5"
        >
          <span>+</span>
          <span>Create Epic</span>
        </button>
      </div>

      {/* Clean Epics List */}
      {epics.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-2">
          <p className="text-xs font-semibold text-slate-700">No epics created yet</p>
          <p className="text-[11px] text-slate-400">
            Click &quot;+ Create Epic&quot; to organize features, initiatives, and milestone deliverables.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="divide-y divide-slate-100">
            {epics.map((epic) => {
              const taskCount = epicTasksMap.get(epic.id) || 0;
              const statusUpper = (epic.status || "IN_PROGRESS").toUpperCase();

              return (
                <div
                  key={epic.id}
                  onClick={() => setSelectedEpicForModal(epic)}
                  className="px-5 py-3.5 hover:bg-slate-50/80 transition flex items-center justify-between gap-3 cursor-pointer group"
                >
                  {/* Left: Color Dot & Epic Name & Description / Date */}
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs"
                      style={{ backgroundColor: epic.color || "#3b82f6" }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-900 group-hover:text-[#1f6fb2] transition truncate block">
                          {epic.name}
                        </span>
                        <span className="text-[10px] text-slate-400 group-hover:text-slate-600 font-medium">
                          ✎ Edit
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
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
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border uppercase tracking-wider ${
                        statusUpper === "COMPLETED"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : statusUpper === "IN_PROGRESS"
                          ? "bg-sky-50 text-sky-700 border-sky-200"
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

      {/* Epic Detail & Edit Modal */}
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
          onEpicUpdated={() => {
            if (onEpicsUpdated) onEpicsUpdated();
            setSelectedEpicForModal(null);
          }}
        />
      )}

      {/* Create Epic Modal matching exact Configure Hours popup theme */}
      {isCreateModalOpen &&
        mounted &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget && !isSubmitting)
                setIsCreateModalOpen(false);
            }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto animate-fadeIn"
          >
            <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col m-auto my-auto animate-scaleIn">
              {/* Top Header */}
              <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/60">
                <div className="flex items-center gap-1.5 font-sans">
                  <span className="font-bold text-slate-900 text-sm sm:text-base">Create:</span>
                  <span className="text-[#1f6fb2] font-bold text-sm sm:text-base">
                    New Epic Initiative
                  </span>
                </div>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsCreateModalOpen(false)}
                  className="w-7 h-7 border border-slate-200 hover:border-slate-300 text-slate-400 hover:text-slate-700 rounded-lg flex items-center justify-center text-xs transition cursor-pointer disabled:opacity-50 shadow-2xs"
                  title="Close"
                >
                  ✕
                </button>
              </div>

              {/* Error Alert */}
              {(formError || dateValidationError) && (
                <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 shrink-0">
                  <span className="font-bold">⚠️</span>
                  <span>{formError || dateValidationError}</span>
                </div>
              )}

              {/* Form Body */}
              <form
                onSubmit={handleCreateEpic}
                className="p-6 space-y-4 max-h-[80vh] overflow-y-auto"
              >
                {/* Section 1: Epic Overview */}
                <div className="space-y-3">
                  <span className="text-[11px] font-bold text-[#1f6fb2] uppercase tracking-wider block">
                    Epic Overview
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-xs font-semibold text-slate-700 block">
                        Epic Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        autoFocus
                        placeholder="e.g. Auth & Role-Based Access Control"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition font-medium"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 block">
                        Status <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition font-medium cursor-pointer"
                      >
                        {EPIC_STATUSES.map((st) => (
                          <option key={st.id} value={st.id}>
                            {st.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Epic Color */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Epic Color
                    </label>
                    <div className="flex items-center gap-2 pt-0.5">
                      {EPIC_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setColor(c)}
                          className={`w-6 h-6 rounded-full cursor-pointer transition transform ${
                            color === c
                              ? "ring-2 ring-offset-2 ring-[#1f6fb2] scale-110 shadow-xs"
                              : "hover:scale-105 opacity-80 hover:opacity-100"
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Description - clearly visible with 3 rows */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Description
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Objectives, deliverables, milestones…"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2.5 text-xs bg-white text-slate-900 outline-none shadow-2xs transition font-medium resize-none leading-relaxed"
                    />
                  </div>
                </div>

                {/* Separation Divider */}
                <div className="border-t border-slate-100" />

                {/* Section 2: Schedule & Dates */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#1f6fb2] uppercase tracking-wider block">
                      Schedule &amp; Project Timeline
                    </span>
                    {projectEndDate && (
                      <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded-md">
                        Project Deadline: <strong className="text-slate-800">{projectEndDate}</strong>
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 block">
                        Start Date
                      </label>
                      <input
                        type="date"
                        min={projectStartDate || undefined}
                        max={projectEndDate || undefined}
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 font-mono outline-none shadow-2xs transition"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-700 block">
                          End Date <span className="text-slate-400 font-normal">(Target)</span>
                        </label>
                        {durationDays && (
                          <span className="text-[11px] font-semibold text-[#1f6fb2]">
                            {durationDays} days duration
                          </span>
                        )}
                      </div>
                      <input
                        type="date"
                        min={startDate || projectStartDate || undefined}
                        max={projectEndDate || undefined}
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className={`w-full border rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 font-mono outline-none shadow-2xs transition ${
                          projectEndDate && endDate && endDate > projectEndDate
                            ? "border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 bg-rose-50/30"
                            : "border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20"
                        }`}
                      />
                    </div>
                  </div>
                </div>

                {/* Bottom Action Footer */}
                <div className="pt-4 border-t border-slate-100 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={isSubmitting || !name.trim() || Boolean(dateValidationError)}
                    className="px-4 py-2 rounded-xl bg-brand-gradient hover:opacity-95 text-white font-semibold text-xs transition cursor-pointer disabled:opacity-50 shadow-xs shadow-[#1f6fb2]/20 flex items-center gap-1.5"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Creating…</span>
                      </>
                    ) : (
                      <span>Create Epic</span>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition cursor-pointer disabled:opacity-50"
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
