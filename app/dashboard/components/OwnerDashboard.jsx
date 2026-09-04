"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import DepartmentSummary from "./DepartmentSummary";
import HRUsersCard from "./HRUsersCard";
import HRAttendanceTracker from "./HRAttendanceTracker";
import DepartmentManagementModal from "./DepartmentManagementModal";

/**
 * OwnerDashboard Component
 * Dedicated executive portal copying the exact structure, theme, and tab design of EmployeeDocumentManager.
 */
export default function OwnerDashboard({
  company,
  employees = [],
  userSession,
  employeeProfile,
  onOpenInviteModal,
  renderRoleBadge,
  renderStatusBadge,
}) {
  const [viewTab, setViewTab] = useState("directory"); // "directory" | "departments" | "hr_team" | "live_attendance" | "company"
  const [searchTerm, setSearchTerm] = useState("");
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const totalStaff = employees.length + 1; // 1 Owner + employees

  // HR users count
  const hrCount = employees.filter(
    (e) => e.role === "hr_manager" || e.role === "hr_executive"
  ).length;

  // Active departments count
  const activeDepartmentsCount = new Set(
    employees.map((e) => e.department).filter(Boolean)
  ).size || 1;

  // Filter employees by search term
  const filteredEmployees = employees.filter((emp) => {
    const q = searchTerm.toLowerCase();
    return (
      emp.full_name?.toLowerCase().includes(q) ||
      emp.email?.toLowerCase().includes(q) ||
      emp.department?.toLowerCase().includes(q) ||
      emp.role?.toLowerCase().includes(q)
    );
  });

  const handleTabClick = (tabKey, e) => {
    setViewTab(tabKey);
    if (e?.currentTarget) {
      e.currentTarget.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* --- TOP BANNER & METRICS CARD --- */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center border border-sky-200/60">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                Company Overview &amp; Management
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              Oversee company workforce directory, department divisions, active staff accounts, and workspace operations.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={onOpenInviteModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold transition-colors shadow-xs shadow-sky-600/20 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              <span>Invite Member</span>
            </button>

            <button
              onClick={() => setIsDeptModalOpen(true)}
              className="p-2 px-3 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>Departments</span>
            </button>
          </div>
        </div>

        {/* Unified Horizontal Navigation Bar Track (One Div) */}
        <nav className="flex items-center gap-1.5 p-1.5 bg-[#f1f5f9] border border-slate-200/70 rounded-2xl shadow-2xs overflow-x-auto scroll-smooth custom-scroll w-full">
          <button
            type="button"
            onClick={(e) => handleTabClick("directory", e)}
            className={`flex-1 min-w-max py-3 px-5 sm:px-6 rounded-xl font-['Manrope'] font-bold text-xs sm:text-sm tracking-normal transition-all duration-300 ease-out flex items-center justify-center gap-2.5 cursor-pointer whitespace-nowrap active:scale-95 ${
              viewTab === "directory"
                ? "bg-sky-600 text-white shadow-md shadow-sky-600/30 scale-[1.01]"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            }`}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span>Staff Directory ({employees.length})</span>
          </button>

          <button
            type="button"
            onClick={(e) => handleTabClick("departments", e)}
            className={`flex-1 min-w-max py-3 px-5 sm:px-6 rounded-xl font-['Manrope'] font-bold text-xs sm:text-sm tracking-normal transition-all duration-300 ease-out flex items-center justify-center gap-2.5 cursor-pointer whitespace-nowrap active:scale-95 ${
              viewTab === "departments"
                ? "bg-sky-600 text-white shadow-md shadow-sky-600/30 scale-[1.01]"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            }`}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <span>Department Structure ({activeDepartmentsCount})</span>
          </button>

          <button
            type="button"
            onClick={(e) => handleTabClick("hr_team", e)}
            className={`flex-1 min-w-max py-3 px-5 sm:px-6 rounded-xl font-['Manrope'] font-bold text-xs sm:text-sm tracking-normal transition-all duration-300 ease-out flex items-center justify-center gap-2.5 cursor-pointer whitespace-nowrap active:scale-95 ${
              viewTab === "hr_team"
                ? "bg-sky-600 text-white shadow-md shadow-sky-600/30 scale-[1.01]"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            }`}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span>HR Management ({hrCount})</span>
          </button>

          <button
            type="button"
            onClick={(e) => handleTabClick("live_attendance", e)}
            className={`flex-1 min-w-max py-3 px-5 sm:px-6 rounded-xl font-['Manrope'] font-bold text-xs sm:text-sm tracking-normal transition-all duration-300 ease-out flex items-center justify-center gap-2.5 cursor-pointer whitespace-nowrap active:scale-95 ${
              viewTab === "live_attendance"
                ? "bg-sky-600 text-white shadow-md shadow-sky-600/30 scale-[1.01]"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            }`}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Live Attendance &amp; Shifts</span>
          </button>

          <button
            type="button"
            onClick={(e) => handleTabClick("company", e)}
            className={`flex-1 min-w-max py-3 px-5 sm:px-6 rounded-xl font-['Manrope'] font-bold text-xs sm:text-sm tracking-normal transition-all duration-300 ease-out flex items-center justify-center gap-2.5 cursor-pointer whitespace-nowrap active:scale-95 ${
              viewTab === "company"
                ? "bg-sky-600 text-white shadow-md shadow-sky-600/30 scale-[1.01]"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            }`}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Company Profile</span>
          </button>
        </nav>

        {/* 4 Summary Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Registered Staff</span>
            <div className="text-xl font-bold text-slate-900">{totalStaff}</div>
            <span className="text-[11px] text-slate-500">1 Owner + {employees.length} Members</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Active Departments</span>
            <div className="text-xl font-bold text-slate-900">{activeDepartmentsCount}</div>
            <span className="text-[11px] text-slate-500">Organizational divisions</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">HR Management</span>
            <div className="text-xl font-bold text-slate-900">{hrCount}</div>
            <span className="text-[11px] text-slate-500">Assigned HR personnel</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Admin Access Tier</span>
            <div className="text-xl font-bold text-slate-900">Owner Root</div>
            <span className="text-[11px] text-slate-500 font-mono">Full Permissions</span>
          </div>
        </div>
      </div>

      {/* --- SUB-VIEW 1: STAFF DIRECTORY --- */}
      {viewTab === "directory" && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Company Staff Directory
              </h3>
            </div>

            {/* Search Box */}
            <div className="relative w-full sm:w-72">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="Search staff name, email, department..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-sky-500 transition shadow-2xs"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {filteredEmployees.length === 0 ? (
            <div className="py-16 text-center space-y-2 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
              <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <p className="text-xs font-bold text-slate-800">
                {employees.length === 0 ? "No Staff Members Added Yet" : "No Matching Staff Members Found"}
              </p>
              <p className="text-xs text-slate-400">
                {employees.length === 0
                  ? "Invite your first HR manager or team employee to begin building your team."
                  : `No employees match "${searchTerm}". Try a different search term.`}
              </p>
            </div>
          ) : (
            <div className="border border-slate-200/80 rounded-xl overflow-hidden shadow-2xs bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[700px]">
                  <thead className="bg-slate-50/90 border-b border-slate-200/80 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3 px-5">Employee Name &amp; Email</th>
                      <th className="py-3 px-5">Department &amp; Designation</th>
                      <th className="py-3 px-5">Role Assigned</th>
                      <th className="py-3 px-5">Username</th>
                      <th className="py-3 px-5 text-right">Account Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredEmployees.map((emp) => {
                      const initial = emp.full_name ? emp.full_name.charAt(0).toUpperCase() : "?";

                      return (
                        <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                          {/* Employee info with initial avatar */}
                          <td className="py-3.5 px-5">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-lg bg-sky-50 border border-sky-200/80 text-sky-700 flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                                {initial}
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-900 text-xs truncate max-w-xs">{emp.full_name}</div>
                                <div className="text-[11px] text-slate-500 font-mono truncate max-w-xs mt-0.5">{emp.email}</div>
                              </div>
                            </div>
                          </td>

                          {/* Department & Designation */}
                          <td className="py-4 px-5 whitespace-nowrap">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {emp.department || "General"}
                            </span>
                            <div className="text-[11px] text-slate-500 capitalize mt-1 font-medium">
                              {emp.designation || "-"}
                            </div>
                          </td>

                          {/* Role Assigned */}
                          <td className="py-4 px-5 whitespace-nowrap">
                            {renderRoleBadge(emp.role)}
                          </td>

                          {/* Generated Username */}
                          <td className="py-4 px-5 whitespace-nowrap font-mono text-sky-700 font-semibold text-[11px]">
                            {emp.username ? (
                              `@${emp.username}`
                            ) : (
                              <span className="text-slate-400 font-sans italic text-[11px]">Pending Acceptance</span>
                            )}
                          </td>

                          {/* Status Badge */}
                          <td className="py-3.5 px-5 text-right whitespace-nowrap">
                            {renderStatusBadge(emp.status)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- SUB-VIEW 2: DEPARTMENTS --- */}
      {viewTab === "departments" && (
        <DepartmentSummary
          employees={employees}
          onManageDepartments={() => setIsDeptModalOpen(true)}
        />
      )}

      {/* --- SUB-VIEW 3: HR MANAGEMENT TEAM --- */}
      {viewTab === "hr_team" && (
        <HRUsersCard employees={employees} onOpenInviteModal={onOpenInviteModal} />
      )}

      {/* --- SUB-VIEW 4: LIVE ATTENDANCE SUMMARY --- */}
      {viewTab === "live_attendance" && (
        <div className="space-y-6">
          <HRAttendanceTracker embedded={false} />
        </div>
      )}

      {/* --- SUB-VIEW 5: COMPANY PROFILE --- */}
      {viewTab === "company" && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center border border-sky-200/60">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">Company Entity &amp; Legal Profile</h3>
                <p className="text-[11px] text-slate-500">System verified organization details &amp; credentials</p>
              </div>
            </div>

            <Link
              href="/company-wizard"
              className="px-3.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition shadow-2xs flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              <span>Edit Company Profile</span>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 text-xs">
            <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/70 space-y-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Company Name</span>
              <p className="text-sm font-semibold text-slate-900">{company?.name || "N/A"}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/70 space-y-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Legal Entity Name</span>
              <p className="text-sm font-semibold text-slate-900">{company?.legal_name || company?.name || "N/A"}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/70 space-y-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Official Work Email</span>
              <p className="text-sm font-semibold text-slate-900 font-mono">{company?.email || "N/A"}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/70 space-y-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Contact Phone</span>
              <p className="text-sm font-semibold text-slate-900">{company?.phone || "N/A"}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/70 space-y-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Country &amp; Location</span>
              <p className="text-sm font-semibold text-slate-900">
                {company?.country ? `${company.country}${company.state ? `, ${company.state}` : ""}` : "N/A"}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/70 space-y-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Industry Sector</span>
              <p className="text-sm font-semibold text-slate-900">{company?.industry || "Software & Tech"}</p>
            </div>
          </div>
        </div>
      )}

      {/* Department CRUD Management Modal */}
      <DepartmentManagementModal
        isOpen={isDeptModalOpen}
        onClose={() => setIsDeptModalOpen(false)}
      />
    </div>
  );
}
