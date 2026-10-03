"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api/authFetch";

const GROUP_SUGGESTIONS = [
  "Frontend Squad",
  "Core Platform",
  "Backend Services",
  "Mobile App",
  "QA & Testing",
  "DevOps & Reliability",
];

export default function ProjectTeamModal({
  isOpen,
  onClose,
  project,
  tasks = [],
  departmentEmployees = [],
  teamLeads = [],
  onProjectUpdated,
}) {
  const [projectGroup, setProjectGroup] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [fetchedEmployees, setFetchedEmployees] = useState([]);
  const dropdownRef = useRef(null);

  // Sync state whenever project changes or modal opens
  useEffect(() => {
    if (project && isOpen) {
      setProjectGroup(project.project_group || "");
      const ids = new Set();
      if (Array.isArray(project.team_members)) {
        project.team_members.forEach((m) => {
          if (typeof m === "string" && m.trim()) ids.add(m.trim());
          else if (m && typeof m === "object" && m.id) ids.add(m.id);
        });
      }
      if (Array.isArray(project.teamMembers)) {
        project.teamMembers.forEach((m) => {
          if (typeof m === "string" && m.trim()) ids.add(m.trim());
          else if (m && typeof m === "object" && m.id) ids.add(m.id);
        });
      }
      setSelectedMemberIds(Array.from(ids));
      setMemberSearch("");
      setShowDropdown(false);
      setErrorMsg("");
      setSuccessMsg("");
    }
  }, [project, isOpen]);

  // Always fetch fresh company employees on modal open to ensure all eligible staff can be assigned
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
          console.warn("ProjectTeamModal load employees warning:", err);
        }
      })();
    }
  }, [isOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Combine fetched employees, department employees, and team leads for available pool
  const allEmployeesPool = useMemo(() => {
    const map = new Map();
    (fetchedEmployees || []).forEach((e) => {
      if (e?.id) map.set(e.id, e);
    });
    (departmentEmployees || []).forEach((e) => {
      if (e?.id && !map.has(e.id)) map.set(e.id, e);
    });
    (teamLeads || []).forEach((l) => {
      if (l?.id && !map.has(l.id)) map.set(l.id, l);
    });
    (project?.teamMembers || []).forEach((m) => {
      if (m?.id && !map.has(m.id)) map.set(m.id, m);
    });
    return Array.from(map.values()).sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
  }, [fetchedEmployees, departmentEmployees, teamLeads, project]);

  // Resolved list of selected team member objects
  const selectedMembers = useMemo(() => {
    return selectedMemberIds
      .map((id) => allEmployeesPool.find((e) => e.id === id))
      .filter(Boolean);
  }, [selectedMemberIds, allEmployeesPool]);

  // Available employees for adding (not in selected, not lead, not creator)
  const availableToAdd = useMemo(() => {
    const q = memberSearch.toLowerCase().trim();
    return allEmployeesPool.filter((emp) => {
      if (selectedMemberIds.includes(emp.id)) return false;
      if (emp.id === project?.team_lead_id) return false;
      if (!q) return true;
      return (
        emp.full_name?.toLowerCase().includes(q) ||
        emp.email?.toLowerCase().includes(q) ||
        emp.department?.toLowerCase().includes(q) ||
        emp.designation?.toLowerCase().includes(q)
      );
    });
  }, [allEmployeesPool, selectedMemberIds, project, memberSearch]);

  if (!isOpen || !project) return null;

  const handleAddMember = (empId) => {
    if (!selectedMemberIds.includes(empId)) {
      setSelectedMemberIds((prev) => [...prev, empId]);
      setMemberSearch("");
      setShowDropdown(false);
    }
  };

  const handleRemoveMember = (empId) => {
    setSelectedMemberIds((prev) => prev.filter((id) => id !== empId));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setIsSubmitting(true);

    try {
      const res = await authFetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_group: projectGroup.trim() || null,
          team_members: selectedMemberIds,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.message || "Failed to update project team.");
      } else {
        setSuccessMsg("Team members updated successfully.");
        const enrichedMembers = selectedMemberIds
          .map((id) => allEmployeesPool.find((e) => e.id === id))
          .filter(Boolean);

        const finalUpdatedProject = {
          ...project,
          ...(data.project || {}),
          project_group: (data.project?.project_group !== undefined ? data.project.project_group : projectGroup.trim()) || null,
          team_members: (data.project?.team_members && data.project.team_members.length > 0)
            ? data.project.team_members
            : selectedMemberIds,
          teamMembers: (data.project?.teamMembers && data.project.teamMembers.length > 0)
            ? data.project.teamMembers
            : enrichedMembers,
        };

        if (onProjectUpdated) {
          onProjectUpdated(finalUpdatedProject);
        }
        window.dispatchEvent(new CustomEvent("project-updated", { detail: finalUpdatedProject }));
        setTimeout(() => {
          onClose();
        }, 500);
      }
    } catch (err) {
      console.error("Update project team error:", err);
      setErrorMsg("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || typeof document === "undefined") return null;

  const modalContent = (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto animate-fadeIn"
    >
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[88vh] animate-scaleIn m-auto">
        {/* Top Header matching exact product theme format */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/60 shrink-0">
          <div className="flex items-center gap-1.5 font-sans">
            <span className="font-bold text-slate-900 text-sm sm:text-base">Manage:</span>
            <span className="text-[#1f6fb2] font-bold text-sm sm:text-base">
              Project Team
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto text-xs">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-medium">
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium">
              ✓ {successMsg}
            </div>
          )}

          {/* Section 1: Squad Group Identification */}
          <div className="space-y-2.5">
            <span className="text-[11px] font-bold text-[#1f6fb2] uppercase tracking-wider block">
              Squad Identification
            </span>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">
                Squad / Group Name
              </label>
              <input
                type="text"
                placeholder="e.g. Frontend Squad, Core Platform"
                value={projectGroup}
                onChange={(e) => setProjectGroup(e.target.value)}
                className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition font-medium"
              />
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {GROUP_SUGGESTIONS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setProjectGroup(preset)}
                    className={`text-[10px] px-2.5 py-1 rounded-lg transition cursor-pointer border font-medium ${
                      projectGroup === preset
                        ? "bg-brand-gradient text-white border-transparent shadow-xs shadow-[#1f6fb2]/20 font-semibold"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section 2: Assign Team Members */}
          <div className="space-y-3 pt-2" ref={dropdownRef}>
            <span className="text-[11px] font-bold text-[#1f6fb2] uppercase tracking-wider block">
              Assign Team Members
            </span>

            <div className="space-y-1 relative">
              <label className="text-xs font-semibold text-slate-700 block">
                Search Employee to Add
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by name, designation, or department…"
                  value={memberSearch}
                  onFocus={() => setShowDropdown(true)}
                  onChange={(e) => {
                    setMemberSearch(e.target.value);
                    setShowDropdown(true);
                  }}
                  className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition font-medium pr-8"
                />
                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400 text-xs">
                  🔍
                </div>
              </div>

              {/* Search Dropdown list */}
              {showDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto z-50 divide-y divide-slate-100">
                  {availableToAdd.length === 0 ? (
                    <div className="p-3 text-center text-slate-400 text-xs">
                      {memberSearch ? "No matching employees found" : "All eligible employees are assigned"}
                    </div>
                  ) : (
                    availableToAdd.map((emp) => (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => handleAddMember(emp.id)}
                        className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 transition flex items-center justify-between gap-2 cursor-pointer group text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold text-slate-900 group-hover:text-[#1f6fb2] block truncate">
                            {emp.full_name}
                          </span>
                          <span className="text-[10px] text-slate-500 block truncate">
                            {emp.designation || emp.role || "Employee"} • {emp.department || "General"}
                          </span>
                        </div>
                        <span className="text-xs text-[#1f6fb2] font-bold shrink-0 bg-blue-50 px-2 py-0.5 rounded-md group-hover:bg-blue-100 transition">
                          + Add
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Assigned Team Members List */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">
                  Assigned Squad Members
                </label>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {selectedMembers.length} members
                </span>
              </div>

              {selectedMembers.length === 0 ? (
                <div className="p-4 text-center rounded-xl bg-slate-50 border border-dashed border-slate-200 text-slate-400 text-xs">
                  No squad members assigned yet. Use the search field above to add employees.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-slate-50/70 border border-slate-200/80 max-h-36 overflow-y-auto">
                  {selectedMembers.map((member) => (
                    <div
                      key={member.id}
                      className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-white border border-slate-200 shadow-2xs text-xs text-slate-800"
                    >
                      <span className="font-semibold">{member.full_name}</span>
                      {member.designation && (
                        <span className="text-[10px] text-slate-400 font-normal">({member.designation})</span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(member.id)}
                        className="w-4 h-4 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center text-[10px] transition cursor-pointer ml-0.5"
                        title="Remove member"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Bottom Action Buttons */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition cursor-pointer disabled:opacity-50 shadow-2xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-brand-gradient hover:opacity-95 text-white font-semibold text-xs transition cursor-pointer disabled:opacity-50 shadow-xs shadow-[#1f6fb2]/20 flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving…</span>
                </>
              ) : (
                <span>Save Team Roster</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
