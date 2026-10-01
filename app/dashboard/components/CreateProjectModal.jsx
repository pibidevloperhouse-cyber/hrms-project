"use client";

import React, { useState, useMemo, useEffect } from "react";
import { authFetch } from "@/lib/api/authFetch";

const PROJECT_TYPES = ["Scrum", "Kanban", "Custom Agile"];

const STATUS_OPTIONS = [
  { value: "PLANNING", label: "Planning" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "COMPLETED", label: "Completed" },
];

const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

export default function CreateProjectModal({
  isOpen,
  onClose,
  onProjectCreated,
  userRole,
  employeeProfile,
  teamLeads = [],
  departmentEmployees = [],
  allEmployees = [],
  onlineUserIds = new Set(),
}) {
  const isAdmin = (userRole || "").toLowerCase() === "admin";
  const defaultDept = employeeProfile?.department || "Engineering";

  // Form State
  const [name, setName] = useState("");
  const [projectType, setProjectType] = useState("Scrum");
  const [description, setDescription] = useState("");
  const [ownerId, setOwnerId] = useState(employeeProfile?.id || "");
  const [projectGroup, setProjectGroup] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [teamLeadId, setTeamLeadId] = useState(teamLeads[0]?.id || "");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("PLANNING");
  const [priority, setPriority] = useState("MEDIUM");
  const [fetchedEmployees, setFetchedEmployees] = useState([]);

  // Fetch full company employees list when modal opens
  useEffect(() => {
    if (isOpen) {
      (async () => {
        try {
          const res = await authFetch("/api/employees/list");
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.employees)) {
              setFetchedEmployees(data.employees);
            }
          }
        } catch (err) {
          console.warn("CreateProjectModal fetch employees error:", err);
        }
      })();
    }
  }, [isOpen]);

  // Combined available pool of all company employees
  const effectiveEmployeesPool = useMemo(() => {
    const map = new Map();
    (fetchedEmployees || []).forEach((e) => { if (e?.id) map.set(e.id, e); });
    (allEmployees || []).forEach((e) => { if (e?.id && !map.has(e.id)) map.set(e.id, e); });
    (departmentEmployees || []).forEach((e) => { if (e?.id && !map.has(e.id)) map.set(e.id, e); });
    (teamLeads || []).forEach((l) => { if (l?.id && !map.has(l.id)) map.set(l.id, l); });
    return Array.from(map.values()).sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
  }, [fetchedEmployees, allEmployees, departmentEmployees, teamLeads]);

  // Keep teamLeadId updated if teamLeads loads asynchronously
  useEffect(() => {
    if (!teamLeadId && teamLeads.length > 0) {
      setTeamLeadId(teamLeads[0].id);
    }
  }, [teamLeads, teamLeadId]);

  // UI state
  const [memberSearch, setMemberSearch] = useState("");
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Eligible Owners (Admins and Department Managers)
  const eligibleOwners = useMemo(() => {
    const list = effectiveEmployeesPool.filter((e) => {
      const r = (e.role || "").toLowerCase().replace(/\s+/g, "_");
      return r === "manager" || r === "admin" || e.id === employeeProfile?.id;
    });
    if (list.length === 0 && employeeProfile) return [employeeProfile];
    return list;
  }, [effectiveEmployeesPool, employeeProfile]);

  // Selected Members objects
  const selectedMembers = useMemo(() => {
    return selectedMemberIds
      .map((id) => effectiveEmployeesPool.find((e) => e.id === id))
      .filter(Boolean);
  }, [selectedMemberIds, effectiveEmployeesPool]);

  // Available members filtered by search and excluding already selected
  const availableMembers = useMemo(() => {
    const query = memberSearch.toLowerCase().trim();
    return effectiveEmployeesPool.filter((emp) => {
      if (selectedMemberIds.includes(emp.id)) return false;
      if (!query) return true;
      return (
        emp.full_name?.toLowerCase().includes(query) ||
        emp.email?.toLowerCase().includes(query) ||
        emp.designation?.toLowerCase().includes(query)
      );
    });
  }, [effectiveEmployeesPool, selectedMemberIds, memberSearch]);

  // Real-time Duration
  const durationDays = useMemo(() => {
    if (!startDate || !endDate) return null;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diff = end - start;
    if (isNaN(diff) || diff < 0) return null;
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
  }, [startDate, endDate]);

  const handleAddMember = (empId) => {
    if (!selectedMemberIds.includes(empId)) {
      setSelectedMemberIds((prev) => [...prev, empId]);
    }
  };

  const handleRemoveMember = (empId) => {
    setSelectedMemberIds((prev) => prev.filter((id) => id !== empId));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    if (!name.trim()) {
      setFormError("Project Name is required.");
      return;
    }

    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      setFormError("End date cannot be earlier than start date.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        project_type: projectType,
        description: description.trim(),
        owner_id: ownerId || employeeProfile?.id,
        project_group: projectGroup.trim() || null,
        team_members: selectedMemberIds,
        team_lead_id: teamLeadId || null,
        department: employeeProfile?.department || defaultDept,
        start_date: startDate || null,
        end_date: endDate || null,
        status,
        priority,
      };

      const res = await authFetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setFormError(data.message || "Failed to create project.");
      } else {
        if (onProjectCreated) onProjectCreated(data.project);
        onClose();
      }
    } catch (err) {
      setFormError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto animate-fadeIn"
    >
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col m-auto my-auto animate-scaleIn">
        {/* Top Header matching exact Configure Hours format */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-1.5 font-sans">
            <span className="font-bold text-slate-900 text-sm sm:text-base">Create:</span>
            <span className="text-[#1f6fb2] font-bold text-sm sm:text-base">
              New Project Workspace
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

        {/* Error Alert */}
        {formError && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 shrink-0">
            <span className="font-bold">⚠️</span>
            <span>{formError}</span>
          </div>
        )}

        {/* Form Body */}
        <form
          id="create-project-form"
          onSubmit={handleSubmit}
          className="p-6 space-y-4 max-h-[80vh] overflow-y-auto"
        >
          {/* Section 1: Project Scope & Overview */}
          <div className="space-y-3">
            <span className="text-[11px] font-bold text-[#1f6fb2] uppercase tracking-wider block">
              Project Overview
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  Project Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Customer Relationship Management"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition font-medium"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  Project Type <span className="text-rose-500">*</span>
                </label>
                <select
                  value={projectType}
                  onChange={(e) => setProjectType(e.target.value)}
                  className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition font-medium cursor-pointer"
                >
                  {PROJECT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 block">
                Project Description
              </label>
              <textarea
                rows={2}
                placeholder="Brief description of product deliverables, modules, and objectives…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition font-medium resize-none"
              />
            </div>
          </div>

          {/* Separation Divider */}
          <div className="border-t border-slate-100" />

          {/* Section 2: Leadership & Team Structure */}
          <div className="space-y-3">
            <span className="text-[11px] font-bold text-[#1f6fb2] uppercase tracking-wider block">
              Leadership &amp; Squad Assignment
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  Project Owner (Creator) <span className="text-rose-500">*</span>
                </label>
                {isAdmin ? (
                  <select
                    value={ownerId}
                    onChange={(e) => setOwnerId(e.target.value)}
                    className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition font-medium cursor-pointer"
                  >
                    {eligibleOwners.map((owner) => (
                      <option key={owner.id} value={owner.id}>
                        {owner.full_name} ({owner.role || "Manager"})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    readOnly
                    value={`${employeeProfile?.full_name || "Current User"} (Project Owner)`}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs bg-slate-50 text-slate-700 font-medium cursor-not-allowed select-none shadow-2xs"
                  />
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  Assigned Team Lead
                </label>
                <select
                  value={teamLeadId}
                  onChange={(e) => setTeamLeadId(e.target.value)}
                  className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition font-medium cursor-pointer"
                >
                  {teamLeads.length === 0 ? (
                    <option value="">No Team Leads found</option>
                  ) : (
                    teamLeads.map((lead) => (
                      <option key={lead.id} value={lead.id}>
                        {lead.full_name} ({lead.department || defaultDept})
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">
                Project Squad / Group <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Core Platform, Mobile Squad, Frontend Team"
                value={projectGroup}
                onChange={(e) => setProjectGroup(e.target.value)}
                className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition font-medium"
              />
              <div className="flex flex-wrap gap-1 pt-0.5">
                {["Core Platform", "Frontend Squad", "Mobile App", "QA & Testing", "Full Stack"].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setProjectGroup(preset)}
                    className={`text-[10px] px-2 py-0.5 rounded-lg border transition cursor-pointer ${
                      projectGroup === preset
                        ? "bg-[#1f6fb2]/10 text-[#1f6fb2] border-[#1f6fb2]/30 font-semibold"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Team Members Assignment */}
            <div className="space-y-1.5 relative">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 block">
                  Assigned Team Members <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                {selectedMembers.length > 0 && (
                  <span className="text-[11px] text-[#1f6fb2] font-semibold">
                    {selectedMembers.length} member(s) selected
                  </span>
                )}
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Search and add employees to project squad…"
                  value={memberSearch}
                  onFocus={() => setShowMemberDropdown(true)}
                  onChange={(e) => {
                    setMemberSearch(e.target.value);
                    setShowMemberDropdown(true);
                  }}
                  className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition font-medium"
                />

                {showMemberDropdown && availableMembers.length > 0 && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowMemberDropdown(false)}
                    />
                    <div className="absolute top-full left-0 right-0 z-20 mt-1 max-h-40 overflow-y-auto bg-white rounded-xl border border-slate-200 shadow-lg p-1 space-y-0.5 custom-scroll">
                      {availableMembers.map((emp) => (
                        <div
                          key={emp.id}
                          onClick={() => {
                            handleAddMember(emp.id);
                            setMemberSearch("");
                            setShowMemberDropdown(false);
                          }}
                          className="px-2.5 py-1.5 rounded-lg hover:bg-sky-50 cursor-pointer flex items-center justify-between text-xs transition"
                        >
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-800 block truncate">{emp.full_name}</span>
                            <span className="text-[10px] text-slate-500 font-mono truncate">{emp.email}</span>
                          </div>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 shrink-0 ml-2">
                            {emp.designation || emp.role || emp.department}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Selected Members Chips */}
              {selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1 max-h-24 overflow-y-auto">
                  {selectedMembers.map((m) => (
                    <span
                      key={m.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 text-[#1f6fb2] text-[11px] border border-sky-200 font-semibold"
                    >
                      <span>{m.full_name}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(m.id)}
                        className="text-sky-400 hover:text-rose-600 font-bold ml-0.5 cursor-pointer"
                        title="Remove member"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Separation Divider */}
          <div className="border-t border-slate-100" />

          {/* Section 3: Schedule, Status & Priority */}
          <div className="space-y-3">
            <span className="text-[11px] font-bold text-[#1f6fb2] uppercase tracking-wider block">
              Schedule &amp; Priority
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 font-mono outline-none shadow-2xs transition"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 block">
                    End Date
                  </label>
                  {durationDays && (
                    <span className="text-[11px] font-semibold text-[#1f6fb2]">
                      {durationDays} days duration
                    </span>
                  )}
                </div>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 font-mono outline-none shadow-2xs transition"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  Initial Status <span className="text-rose-500">*</span>
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition font-medium cursor-pointer"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  Priority <span className="text-rose-500">*</span>
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition font-medium cursor-pointer"
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Bottom Action Footer matching Configure Hours */}
          <div className="pt-4 border-t border-slate-100 flex items-center gap-3">
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="px-4 py-2 rounded-xl bg-brand-gradient hover:opacity-95 text-white font-semibold text-xs transition cursor-pointer disabled:opacity-50 shadow-xs shadow-[#1f6fb2]/20 flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Creating…</span>
                </>
              ) : (
                <span>Create Project</span>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
