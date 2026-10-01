"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import DepartmentSummary from "./DepartmentSummary";
import HRUsersCard from "./HRUsersCard";
import HRAttendanceTracker from "./HRAttendanceTracker";
import DepartmentManagementModal from "./DepartmentManagementModal";
import RolePromotionModal from "./RolePromotionModal";
import ExecutivePerformanceMatrix from "./ExecutivePerformanceMatrix";

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
  onEmployeeUpdated,
  renderRoleBadge,
  renderStatusBadge,
}) {
  const [viewTab, setViewTab] = useState("directory"); // "directory" | "departments" | "hr_team" | "live_attendance" | "company"
  const [searchTerm, setSearchTerm] = useState("");
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [selectedEmpForRoleModal, setSelectedEmpForRoleModal] = useState(null);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
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
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-50 to-teal-50 text-[#1f6fb2] flex items-center justify-center border border-sky-200/60 shadow-2xs">
                <svg className="w-5 h-5 text-[#1f6fb2]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                  Company Overview &amp; Management
                </h2>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={onOpenInviteModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-gradient hover:opacity-95 text-white text-xs font-semibold transition-all shadow-xs shadow-[#1f6fb2]/20 cursor-pointer"
            >
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.375 21c-2.331 0-4.512-.645-6.374-1.765z" />
              </svg>
              <span>Invite Member</span>
            </button>

            <button
              onClick={() => setIsDeptModalOpen(true)}
              className="inline-flex items-center gap-1.5 p-2 px-3 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25V15.75z" />
              </svg>
              <span>Departments</span>
            </button>
          </div>
        </div>

        {/* Unified Horizontal Navigation Bar Track (Segmented Control, Proportional & No scrollbar) */}
        <nav className="flex items-center gap-1 p-1 bg-slate-100/90 border border-slate-200/70 rounded-xl overflow-x-auto no-scrollbar w-full">
          <button
            type="button"
            onClick={(e) => handleTabClick("directory", e)}
            className={`flex-1 min-w-[130px] py-2.5 px-3 rounded-lg text-xs font-semibold tracking-tight transition-all flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap text-center ${
              viewTab === "directory"
                ? "bg-white text-slate-900 shadow-xs border border-slate-200/60 font-bold"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
            }`}
          >
            <span>Staff Directory</span>
            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${
              viewTab === "directory" ? "bg-slate-100 text-slate-900 border border-slate-200/60" : "bg-slate-200/60 text-slate-600"
            }`}>
              {employees.length}
            </span>
          </button>

          <button
            type="button"
            onClick={(e) => handleTabClick("departments", e)}
            className={`flex-1 min-w-[160px] py-2.5 px-3 rounded-lg text-xs font-semibold tracking-tight transition-all flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap text-center ${
              viewTab === "departments"
                ? "bg-white text-slate-900 shadow-xs border border-slate-200/60 font-bold"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
            }`}
          >
            <span>Department Structure</span>
            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${
              viewTab === "departments" ? "bg-slate-100 text-slate-900 border border-slate-200/60" : "bg-slate-200/60 text-slate-600"
            }`}>
              {activeDepartmentsCount}
            </span>
          </button>

          <button
            type="button"
            onClick={(e) => handleTabClick("hr_team", e)}
            className={`flex-1 min-w-[140px] py-2.5 px-3 rounded-lg text-xs font-semibold tracking-tight transition-all flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap text-center ${
              viewTab === "hr_team"
                ? "bg-white text-slate-900 shadow-xs border border-slate-200/60 font-bold"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
            }`}
          >
            <span>HR Management</span>
            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${
              viewTab === "hr_team" ? "bg-slate-100 text-slate-900 border border-slate-200/60" : "bg-slate-200/60 text-slate-600"
            }`}>
              {hrCount}
            </span>
          </button>

          <button
            type="button"
            onClick={(e) => handleTabClick("live_attendance", e)}
            className={`flex-1 min-w-[160px] py-2.5 px-3 rounded-lg text-xs font-semibold tracking-tight transition-all flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap text-center ${
              viewTab === "live_attendance"
                ? "bg-white text-slate-900 shadow-xs border border-slate-200/60 font-bold"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
            }`}
          >
            <span>Live Attendance &amp; Shifts</span>
          </button>

          <button
            type="button"
            onClick={(e) => handleTabClick("performance_matrix", e)}
            className={`flex-1 min-w-[150px] py-2.5 px-3 rounded-lg text-xs font-semibold tracking-tight transition-all flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap text-center ${
              viewTab === "performance_matrix"
                ? "bg-white text-slate-900 shadow-xs border border-slate-200/60 font-bold"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
            }`}
          >
            <span>Executive Appraisals</span>
          </button>

          <button
            type="button"
            onClick={(e) => handleTabClick("company", e)}
            className={`flex-1 min-w-[130px] py-2.5 px-3 rounded-lg text-xs font-semibold tracking-tight transition-all flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap text-center ${
              viewTab === "company"
                ? "bg-white text-slate-900 shadow-xs border border-slate-200/60 font-bold"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
            }`}
          >
            <span>Company Profile</span>
          </button>
        </nav>

        {/* 4 Summary Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="p-4 rounded-xl bg-white border border-slate-200/80 space-y-2 hover:border-slate-300 transition shadow-2xs group">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Registered Staff</span>
              <div className="w-8 h-8 rounded-lg bg-sky-50 text-[#1f6fb2] flex items-center justify-center border border-sky-100 group-hover:scale-105 transition-transform">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                </svg>
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 tracking-tight">{totalStaff}</div>
            <span className="text-xs text-slate-500 font-medium">1 Owner · {employees.length} Members</span>
          </div>

          <div className="p-4 rounded-xl bg-white border border-slate-200/80 space-y-2 hover:border-slate-300 transition shadow-2xs group">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Active Departments</span>
              <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100 group-hover:scale-105 transition-transform">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25V15.75z" />
                </svg>
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 tracking-tight">{activeDepartmentsCount}</div>
            <span className="text-xs text-slate-500 font-medium">Organizational divisions</span>
          </div>

          <div className="p-4 rounded-xl bg-white border border-slate-200/80 space-y-2 hover:border-slate-300 transition shadow-2xs group">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">HR Management</span>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 group-hover:scale-105 transition-transform">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
                </svg>
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 tracking-tight">{hrCount}</div>
            <span className="text-xs text-slate-500 font-medium">Assigned HR personnel</span>
          </div>

          <div className="p-4 rounded-xl bg-white border border-slate-200/80 space-y-2 hover:border-slate-300 transition shadow-2xs group">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Admin Access Tier</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 group-hover:scale-105 transition-transform">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 tracking-tight">Owner Root</div>
            <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
              Full Permissions
            </span>
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
                className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-[#1f6fb2] transition shadow-2xs"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs cursor-pointer"
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
                      <th className="py-3 px-5">Member</th>
                      <th className="py-3 px-5">Role</th>
                      <th className="py-3 px-5">Department</th>
                      <th className="py-3 px-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredEmployees.map((emp) => {
                      const initial = emp.full_name ? emp.full_name.charAt(0).toUpperCase() : "?";

                      return (
                        <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                          {/* Employee info with avatar */}
                          <td className="py-3.5 px-5">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs overflow-hidden">
                                {emp.avatar_url ? (
                                  <img
                                    src={emp.avatar_url}
                                    alt={emp.full_name || "Employee"}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      e.currentTarget.style.display = "none";
                                    }}
                                  />
                                ) : (
                                  initial
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-900 text-xs truncate max-w-xs">{emp.full_name}</div>
                                <div className="text-[11px] text-slate-500 font-mono truncate max-w-xs mt-0.5">{emp.email}</div>
                              </div>
                            </div>
                          </td>

                          {/* Role Assigned */}
                          <td className="py-3.5 px-5">
                            {renderRoleBadge(emp.role)}
                          </td>

                          {/* Department & Designation */}
                          <td className="py-3.5 px-5">
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                {emp.department || "General"}
                              </span>
                              {emp.designation && (
                                <p className="text-[11px] text-slate-500 mt-0.5">{emp.designation}</p>
                              )}
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-5 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedEmpForRoleModal(emp);
                                setIsRoleModalOpen(true);
                              }}
                              className="px-3 py-1 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 text-xs font-semibold transition cursor-pointer shadow-2xs"
                              title="Promote or Change Role"
                            >
                              Edit Role
                            </button>
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
          <HRAttendanceTracker embedded={false} userRole="ADMIN" />
        </div>
      )}

      {/* --- SUB-VIEW 5: PERFORMANCE & APPRAISALS MATRIX --- */}
      {viewTab === "performance_matrix" && (
        <div className="space-y-6">
          <ExecutivePerformanceMatrix />
        </div>
      )}

      {/* --- SUB-VIEW 6: COMPANY PROFILE --- */}
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

      {/* Role Promotion & Management Modal */}
      <RolePromotionModal
        isOpen={isRoleModalOpen}
        onClose={() => {
          setIsRoleModalOpen(false);
          setSelectedEmpForRoleModal(null);
        }}
        employee={selectedEmpForRoleModal}
        currentUserRole="ADMIN"
        onRoleUpdated={(updated) => {
          if (onEmployeeUpdated) onEmployeeUpdated(updated);
        }}
      />
    </div>
  );
}
