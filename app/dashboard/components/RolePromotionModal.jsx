"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const ROLE_DEFINITIONS = [
  {
    role: "team_lead",
    label: "Team Lead",
    icon: "👑",
    badgeColor: "bg-cyan-50 text-cyan-700 border-cyan-200",
    summary: "Project Leadership & Deliverable Reviewer",
    description:
      "Can be assigned to lead projects, manage sprints & backlog items, assign subtasks, and review employee task deliverables.",
    recommendedFor: "Technical leads, Scrum masters, and Project coordinators",
  },
  {
    role: "manager",
    label: "Department Manager",
    icon: "🏢",
    badgeColor: "bg-teal-50 text-teal-700 border-teal-200",
    summary: "Department Operations & Project Creator",
    description:
      "Can create new projects, oversee department-wide sprints, reassign leads, and inspect performance analytics.",
    recommendedFor: "Engineering managers, department heads, and directors",
  },
  {
    role: "employee",
    label: "Individual Contributor (Employee)",
    icon: "💼",
    badgeColor: "bg-slate-100 text-slate-700 border-slate-200",
    summary: "Task Execution & Deliverable Submissions",
    description:
      "Standard team member with access to assigned projects, active sprints, task execution, and progress updates.",
    recommendedFor: "Software developers, designers, analysts, and associates",
  },
  {
    role: "hr_executive",
    label: "HR Executive",
    icon: "📋",
    badgeColor: "bg-sky-50 text-sky-700 border-sky-200",
    summary: "HR Operations & Attendance",
    description:
      "Handles employee invitations, daily shift attendance verification, and employee leave requests.",
    recommendedFor: "Human Resources specialists and onboarding coordinators",
  },
  {
    role: "hr_manager",
    label: "HR Manager",
    icon: "🛡️",
    badgeColor: "bg-indigo-50 text-indigo-700 border-indigo-200",
    summary: "Full HR Authority & Workforce Management",
    description:
      "Full HR administration including role updates, leave approvals, policy enforcement, and employee records.",
    recommendedFor: "HR Directors, People Operations Leads, and HR Managers",
  },
];

export default function RolePromotionModal({
  isOpen,
  onClose,
  employee,
  onRoleUpdated,
  currentUserRole = "ADMIN",
}) {
  const [selectedRole, setSelectedRole] = useState("employee");
  const [designation, setDesignation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (employee) {
      setSelectedRole(employee.role || "employee");
      setDesignation(employee.designation || "");
      setErrorMsg("");
    }
  }, [employee]);

  if (!isOpen || !employee) return null;

  const initial = employee.full_name ? employee.full_name.charAt(0).toUpperCase() : "?";
  const isCurrentlyLead = (employee.role || "").toLowerCase() === "team_lead";
  const isPromotingToLead = selectedRole === "team_lead" && !isCurrentlyLead;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      let { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        await new Promise((r) => setTimeout(r, 200));
        const retry = await supabase.auth.getSession();
        session = retry.data?.session || null;
      }

      const headers = {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      const res = await fetch(`/api/employees/${employee.id}/role`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          role: selectedRole,
          designation: designation.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.message || "Failed to update employee role.");
      } else {
        if (onRoleUpdated) {
          onRoleUpdated(data.employee || { ...employee, role: selectedRole, designation });
        }
        onClose();
      }
    } catch (err) {
      console.error("Role update submission error:", err);
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
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-fadeIn"
    >
      <div
        className="relative w-full max-w-xl bg-white rounded-2xl border border-slate-200/80 shadow-2xl overflow-hidden flex flex-col m-auto my-auto"
        style={{ maxHeight: "calc(100vh - 48px)" }}
      >
        {/* Top Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 via-white to-sky-50/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center font-bold text-sm shadow-2xs">
              {initial}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <span>Manage Role &amp; Permissions</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {employee.full_name} · <span className="font-mono">{employee.email}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer text-sm"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Error Notification */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 shrink-0">
            <span className="font-bold">⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Modal Form Body */}
        <form
          id="role-promotion-form"
          onSubmit={handleSubmit}
          className="p-6 overflow-y-auto space-y-5 text-xs flex-1"
        >
          {/* Promotion Highlight Alert */}
          {isPromotingToLead && (
            <div className="p-3.5 rounded-xl bg-cyan-50/80 border border-cyan-200 text-cyan-900 flex items-start gap-2.5">
              <span className="text-base">🎉</span>
              <div className="space-y-0.5">
                <p className="font-bold text-xs">Elevating to Team Lead</p>
                <p className="text-[11px] text-cyan-800 leading-relaxed">
                  This employee will be granted project leadership privileges, allowing them to be appointed as Lead for company projects and review task submissions. An in-app notification will be sent immediately.
                </p>
              </div>
            </div>
          )}

          {/* Role Selection Options */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold text-slate-800 block">
              Select Workspace Role <span className="text-rose-500">*</span>
            </label>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {ROLE_DEFINITIONS.map((r) => {
                const isSelected = selectedRole === r.role;
                return (
                  <label
                    key={r.role}
                    onClick={() => setSelectedRole(r.role)}
                    className={`block p-3.5 rounded-xl border transition-all cursor-pointer text-left ${
                      isSelected
                        ? "bg-sky-50/60 border-sky-500 ring-1 ring-sky-500 shadow-xs"
                        : "bg-white hover:bg-slate-50/70 border-slate-200/80"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <span className="text-lg leading-none mt-0.5">{r.icon}</span>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-900">{r.label}</span>
                            <span className={`text-[10px] px-2 py-0.2 rounded-full font-semibold border ${r.badgeColor}`}>
                              {r.summary}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 leading-relaxed">
                            {r.description}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 pt-0.5">
                        <input
                          type="radio"
                          name="selected_role"
                          checked={isSelected}
                          onChange={() => setSelectedRole(r.role)}
                          className="w-4 h-4 text-sky-600 focus:ring-sky-500 cursor-pointer"
                        />
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Official Designation / Title Input */}
          <div className="space-y-1.5 pt-1 border-t border-slate-100">
            <label className="text-xs font-bold text-slate-800 block">
              Job Designation / Title <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              placeholder={
                selectedRole === "team_lead"
                  ? "e.g., Tech Lead, Senior Team Lead, Scrum Master"
                  : selectedRole === "manager"
                  ? "e.g., Engineering Manager, Operations Head"
                  : "e.g., Senior Full Stack Developer, Product Designer"
              }
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              className="w-full h-9 px-3.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs focus:outline-none focus:border-sky-600 focus:ring-1 focus:ring-sky-600 placeholder-slate-400 shadow-2xs"
            />
            <p className="text-[11px] text-slate-500">
              Department: <span className="font-semibold text-slate-700">{employee.department || "General"}</span>
            </p>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 border-t border-slate-200/80 bg-slate-50/80 flex items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Multi-tenant verified update</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-300 transition cursor-pointer shadow-2xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="role-promotion-form"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer shadow-xs shadow-sky-600/20 flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Updating Role…</span>
                </>
              ) : (
                <span>Confirm Role Change</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
