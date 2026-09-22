"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

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
          const supabase = createClient();
          let session = (await supabase.auth.getSession()).data?.session;
          const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
          const res = await fetch("/api/employees/list", { headers });
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
      const supabase = createClient();
      let session = (await supabase.auth.getSession()).data?.session;
      if (!session?.access_token) {
        for (let attempt = 0; attempt < 3 && !session?.access_token; attempt++) {
          await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
          session = (await supabase.auth.getSession()).data?.session;
        }
      }
      const headers = {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers,
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

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto animate-fadeIn"
    >
      <div className="relative w-full max-w-xl bg-white rounded-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col m-auto my-auto animate-scaleIn">
        {/* Top Header matching exact Create Sprint format */}
        <div className="px-6 pt-5 pb-3 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-3 text-base">
            <span className="font-bold text-slate-900">Add:</span>
            <span className="text-blue-600 font-semibold border-b-2 border-blue-600 pb-0.5 text-sm">
              Team Members
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4 max-h-[80vh] overflow-y-auto text-xs">
          {errorMsg && (
            <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
              ✓ {successMsg}
            </div>
          )}

          {/* Row: Project Squad / Group Name with red underline indicator */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1">
            <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0 pt-0.5">
              <span className="border-b-2 border-rose-500 pb-0.5">
                Squad Name
              </span>
            </label>
            <div className="flex-1 space-y-1.5">
              <input
                type="text"
                placeholder="e.g., Frontend Squad, Core Platform"
                value={projectGroup}
                onChange={(e) => setProjectGroup(e.target.value)}
                className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-1 text-sm bg-transparent text-slate-900 transition-colors placeholder:text-slate-400"
              />
              <div className="flex flex-wrap gap-1 pt-0.5">
                {GROUP_SUGGESTIONS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setProjectGroup(preset)}
                    className={`text-[10px] px-2 py-0.5 rounded transition cursor-pointer border ${
                      projectGroup === preset
                        ? "bg-blue-600 text-white border-blue-600 shadow-2xs font-semibold"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section Divider: Default Section */}
          <div className="text-blue-600 font-semibold border-b border-blue-500 pb-1 text-sm pt-2">
            Default Section
          </div>

          {/* Row: Search & Add Employee */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1" ref={dropdownRef}>
            <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0 pt-1">
              Add Employee
            </label>
            <div className="flex-1 relative">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search and select employee to assign…"
                  value={memberSearch}
                  onFocus={() => setShowDropdown(true)}
                  onChange={(e) => {
                    setMemberSearch(e.target.value);
                    setShowDropdown(true);
                  }}
                  className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-1 text-sm bg-transparent text-slate-900 transition-colors placeholder:text-slate-400 pr-6"
                />
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center text-blue-600 text-xs pb-1">
                  ▼
                </div>
              </div>

              {/* Search Dropdown list */}
              {showDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto z-50 divide-y divide-slate-100">
                  {availableToAdd.length === 0 ? (
                    <div className="p-3 text-center text-slate-400 text-xs">
                      {memberSearch ? "No matching employees found" : "All available employees are assigned"}
                    </div>
                  ) : (
                    availableToAdd.map((emp) => (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => handleAddMember(emp.id)}
                        className="w-full text-left px-3 py-2 hover:bg-blue-50/70 transition flex items-center justify-between gap-2 cursor-pointer group text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold text-slate-900 group-hover:text-blue-600 block truncate">
                            {emp.full_name}
                          </span>
                          <span className="text-[10px] text-slate-500 block truncate">
                            {emp.designation || emp.role || "Employee"} • {emp.department || "General"}
                          </span>
                        </div>
                        <span className="text-xs text-blue-600 font-bold shrink-0">+ Add</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Row: Assigned Team Members List */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1">
            <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0 pt-1">
              Assigned Team ({selectedMembers.length})
            </label>
            <div className="flex-1">
              {selectedMembers.length === 0 ? (
                <div className="text-slate-400 italic py-1 text-xs border-b border-slate-200 pb-2">
                  No squad members assigned yet. Use the search field above to assign employees.
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-3 pt-0.5">
                  {selectedMembers.map((member) => (
                    <div
                      key={member.id}
                      className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded bg-slate-100 border border-slate-200 text-xs text-slate-800"
                    >
                      <span className="font-semibold">{member.full_name}</span>
                      {member.designation && (
                        <span className="text-[10px] text-slate-500 font-normal">({member.designation})</span>
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

          {/* Core Leadership Attribution (Owner & Lead) */}
          <div className="pt-2 text-[11px] text-slate-500 flex flex-wrap items-center gap-4">
            {project.creator && (
              <div>
                <span className="text-slate-400">Owner:</span>{" "}
                <strong className="text-slate-700">{project.creator.full_name}</strong>
              </div>
            )}
            {project.teamLead && (
              <div>
                <span className="text-slate-400">Team Lead:</span>{" "}
                <strong className="text-slate-700">{project.teamLead.full_name}</strong>
              </div>
            )}
          </div>

          {/* Bottom Action Buttons matching Create Sprint exact format */}
          <div className="pt-4 pb-1 flex items-center gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition cursor-pointer disabled:opacity-50 shadow-xs"
            >
              {isSubmitting ? "Saving…" : "Save Team"}
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-sm transition cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
