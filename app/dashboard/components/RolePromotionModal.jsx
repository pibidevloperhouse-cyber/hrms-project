"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

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
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto animate-fadeIn"
    >
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col m-auto my-auto animate-scaleIn">
        {/* Top Header matching Configure Hours */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-1.5 font-sans">
            <span className="font-bold text-slate-900 text-sm sm:text-base">Edit:</span>
            <span className="text-[#1f6fb2] font-bold text-sm sm:text-base">
              Employee Role &amp; Designation
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {errorMsg}
            </div>
          )}

          {/* Section 1: Member Information */}
          <div className="space-y-3">
            <span className="text-[11px] font-bold text-[#1f6fb2] uppercase tracking-wider block">
              Member Information
            </span>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="sm:w-36 text-xs font-semibold text-slate-700">
                Employee Name
              </label>
              <div className="flex-1">
                <input
                  type="text"
                  disabled
                  readOnly
                  value={employee.full_name || "—"}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs bg-slate-50 text-slate-800 font-medium outline-none shadow-2xs cursor-not-allowed select-none"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="sm:w-36 text-xs font-semibold text-slate-700">
                Work Email
              </label>
              <div className="flex-1">
                <input
                  type="text"
                  disabled
                  readOnly
                  value={employee.email || "—"}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs bg-slate-50 text-slate-700 font-mono outline-none shadow-2xs cursor-not-allowed select-none"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="sm:w-36 text-xs font-semibold text-slate-700">
                Department
              </label>
              <div className="flex-1">
                <input
                  type="text"
                  disabled
                  readOnly
                  value={employee.department || "General"}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs bg-slate-50 text-slate-700 font-medium outline-none shadow-2xs cursor-not-allowed select-none"
                />
              </div>
            </div>
          </div>

          {/* Small separation divider */}
          <div className="border-t border-slate-100" />

          {/* Section 2: Position & Assignment */}
          <div className="space-y-3">
            <span className="text-[11px] font-bold text-[#1f6fb2] uppercase tracking-wider block">
              Position &amp; Assignment
            </span>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="sm:w-36 text-xs font-semibold text-slate-700">
                System Role <span className="text-rose-500">*</span>
              </label>
              <div className="flex-1">
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 cursor-pointer outline-none shadow-2xs transition font-medium"
                >
                  <option value="employee">Standard Employee</option>
                  <option value="team_lead">Team Lead</option>
                  <option value="manager">Department Manager</option>
                  <option value="hr_executive">HR Executive</option>
                  <option value="hr_manager">HR Manager</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="sm:w-36 text-xs font-semibold text-slate-700">
                Job Designation
              </label>
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="e.g. Senior Software Engineer"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition placeholder:text-slate-400 font-medium"
                />
              </div>
            </div>
          </div>

          {/* Bottom Action Buttons */}
          <div className="pt-4 border-t border-slate-100 flex items-center gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-brand-gradient hover:opacity-95 text-white font-semibold text-xs transition cursor-pointer disabled:opacity-50 shadow-xs shadow-[#1f6fb2]/20 flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving Changes…</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium text-xs transition cursor-pointer disabled:opacity-50 shadow-2xs"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
