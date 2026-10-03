"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { authFetch } from "@/lib/api/authFetch";

export default function ProjectConfigModal({
  isOpen,
  onClose,
  project,
  onProjectUpdated,
  departmentEmployees = [],
  teamLeads = [],
  allEmployees = [],
  userRole,
  employeeProfile,
}) {
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [department, setDepartment] = useState("");
  const [projectType, setProjectType] = useState("SCRUM");
  const [projectGroup, setProjectGroup] = useState("");
  const [teamLeadId, setTeamLeadId] = useState("");
  const [status, setStatus] = useState("PLANNING");
  const [priority, setPriority] = useState("MEDIUM");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const cleanRole = String(userRole || employeeProfile?.role || "").toLowerCase().replace(/[\s_-]+/g, "");
  const isOwnerOrAdmin = cleanRole.includes("admin") || cleanRole.includes("owner") || cleanRole.includes("hr");
  const isProjectCreator = project?.created_by === employeeProfile?.id || project?.owner_id === employeeProfile?.id;
  const isManager = cleanRole.includes("manager") || cleanRole.includes("lead") || isOwnerOrAdmin || isProjectCreator;
  const canEdit = isManager;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync state when project changes or modal opens
  useEffect(() => {
    if (project && isOpen) {
      setName(project.name || "");
      setDescription(project.description || "");
      setDepartment(project.department || "");
      setProjectType(String(project.project_type || "SCRUM").toUpperCase());
      setProjectGroup(project.project_group || "");
      setTeamLeadId(project.team_lead_id || project.teamLead?.id || "");
      setStatus(String(project.status || "PLANNING").toUpperCase());
      setPriority(String(project.priority || "MEDIUM").toUpperCase());
      setStartDate(project.start_date ? project.start_date.split("T")[0] : "");
      setEndDate(project.end_date ? project.end_date.split("T")[0] : "");
      setErrorMsg("");
      setSuccessMsg("");
    }
  }, [project, isOpen]);

  // Combined pool of assignable team leads and managers
  const eligibleTeamLeads = useMemo(() => {
    const map = new Map();
    const sourcePool = [...(teamLeads || []), ...(departmentEmployees || []), ...(allEmployees || [])];

    sourcePool.forEach((emp) => {
      if (emp?.id && !map.has(emp.id)) {
        const empRole = (emp.role || "").toLowerCase();
        const empDesig = (emp.designation || "").toLowerCase();
        const isLeadCandidate =
          empRole.includes("lead") ||
          empRole.includes("manager") ||
          empRole.includes("admin") ||
          empDesig.includes("lead") ||
          empDesig.includes("manager") ||
          empDesig.includes("head") ||
          emp.id === project?.team_lead_id;

        if (isLeadCandidate) {
          map.set(emp.id, emp);
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
  }, [teamLeads, departmentEmployees, allEmployees, project?.team_lead_id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!project?.id) return;
    if (!name.trim()) {
      setErrorMsg("Project name is required.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        department: department.trim(),
        project_type: projectType,
        project_group: projectGroup.trim() || null,
        team_lead_id: teamLeadId || null,
        status,
        priority,
        start_date: startDate || null,
        end_date: endDate || null,
      };

      const res = await authFetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && data.project) {
        setSuccessMsg("Project configuration saved successfully.");
        onProjectUpdated?.(data.project);
        setTimeout(() => {
          onClose();
        }, 800);
      } else {
        throw new Error(data.message || "Failed to update project configuration.");
      }
    } catch (err) {
      console.error("Project configuration update error:", err);
      setErrorMsg(err.message || "Failed to save configuration.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!mounted || !isOpen || !project) return null;

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn overflow-y-auto"
    >
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[88vh] animate-scaleIn m-auto">
        {/* Top Header matching exact product theme format */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/60 shrink-0">
          <div className="flex items-center gap-1.5 font-sans">
            <span className="font-bold text-slate-900 text-sm sm:text-base">Configure:</span>
            <span className="text-[#1f6fb2] font-bold text-sm sm:text-base">
              Project Details
            </span>
          </div>

          {/* Close button */}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="w-7 h-7 border border-slate-200 hover:border-slate-300 text-slate-400 hover:text-slate-700 rounded-lg flex items-center justify-center text-xs transition cursor-pointer disabled:opacity-50 shadow-2xs"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4.5 overflow-y-auto flex-1 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-medium">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium">
              {successMsg}
            </div>
          )}

          {/* Row 1: Project Name & Key */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Project Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canEdit || isSubmitting}
                required
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1f6fb2]/20 focus:border-[#1f6fb2] text-xs font-semibold text-slate-900 transition disabled:bg-slate-50 disabled:text-slate-500 shadow-2xs"
                placeholder="e.g. Human Resource Management System"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Project Key</label>
              <input
                type="text"
                value={project.key || project.project_code || "HRMS"}
                disabled
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 font-mono font-bold text-xs uppercase cursor-not-allowed shadow-2xs"
              />
            </div>
          </div>

          {/* Row 2: Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!canEdit || isSubmitting}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1f6fb2]/20 focus:border-[#1f6fb2] text-xs text-slate-800 transition disabled:bg-slate-50 shadow-2xs resize-none"
              placeholder="Brief summary of product deliverables and objectives..."
            />
          </div>

          {/* Row 3: Methodology & Squad Group */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Methodology / Framework</label>
              <select
                value={projectType}
                onChange={(e) => setProjectType(e.target.value)}
                disabled={!canEdit || isSubmitting}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-[#1f6fb2] text-xs font-semibold text-slate-800 transition disabled:bg-slate-50 cursor-pointer shadow-2xs bg-white"
              >
                <option value="SCRUM">Scrum (Sprints &amp; Backlog)</option>
                <option value="KANBAN">Kanban (Continuous Flow)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Squad Group / Tag</label>
              <input
                type="text"
                value={projectGroup}
                onChange={(e) => setProjectGroup(e.target.value)}
                disabled={!canEdit || isSubmitting}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-[#1f6fb2] text-xs text-slate-800 transition disabled:bg-slate-50 shadow-2xs"
                placeholder="e.g. Core Engineering, Squad A"
              />
            </div>
          </div>

          {/* Row 4: Team Lead & Department */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Assigned Team Lead</label>
              <select
                value={teamLeadId}
                onChange={(e) => setTeamLeadId(e.target.value)}
                disabled={!canEdit || isSubmitting}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-[#1f6fb2] text-xs font-semibold text-slate-800 transition disabled:bg-slate-50 cursor-pointer shadow-2xs bg-white"
              >
                <option value="">Unassigned</option>
                {eligibleTeamLeads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.full_name} {lead.designation ? `(${lead.designation})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Department</label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                disabled={!canEdit || isSubmitting}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-[#1f6fb2] text-xs text-slate-800 transition disabled:bg-slate-50 shadow-2xs"
                placeholder="e.g. Engineering, Product"
              />
            </div>
          </div>

          {/* Row 5: Status & Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Project Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={!canEdit || isSubmitting}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-[#1f6fb2] text-xs font-semibold text-slate-800 transition disabled:bg-slate-50 cursor-pointer shadow-2xs bg-white"
              >
                <option value="PLANNING">Planning</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="ON_HOLD">On Hold</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Priority Level</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                disabled={!canEdit || isSubmitting}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-[#1f6fb2] text-xs font-semibold text-slate-800 transition disabled:bg-slate-50 cursor-pointer shadow-2xs bg-white"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
          </div>

          {/* Row 6: Timelines */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={!canEdit || isSubmitting}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-[#1f6fb2] text-xs font-mono text-slate-800 transition disabled:bg-slate-50 shadow-2xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Target Completion Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={!canEdit || isSubmitting}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-[#1f6fb2] text-xs font-mono text-slate-800 transition disabled:bg-slate-50 shadow-2xs"
              />
            </div>
          </div>

          {/* Owner attribution metadata */}
          {project.creator && (
            <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 text-slate-600 flex items-center justify-between text-[11px]">
              <span>Project Owner: <strong className="text-slate-800">{project.creator.full_name || project.creator.email}</strong></span>
              {project.created_at && (
                <span className="text-slate-400 font-mono">
                  Created {new Date(project.created_at).toLocaleDateString()}
                </span>
              )}
            </div>
          )}

          {/* Modal Footer */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition cursor-pointer shadow-2xs"
            >
              Cancel
            </button>

            {canEdit && (
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-brand-gradient hover:opacity-95 text-white font-semibold text-xs transition cursor-pointer shadow-xs shadow-[#1f6fb2]/20 flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving…</span>
                  </>
                ) : (
                  <span>Save Configuration</span>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
