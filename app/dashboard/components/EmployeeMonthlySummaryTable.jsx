"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import {
  CalendarIcon,
  RefreshCwIcon,
  SearchIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  BarChartIcon,
  FileTextIcon,
  UsersIcon,
} from "./AttendanceIcons";
import HRMonthlyEvaluationModal from "./HRMonthlyEvaluationModal";

function formatDurationHMS(totalSeconds) {
  if (!totalSeconds || isNaN(totalSeconds) || totalSeconds <= 0) return "00h 00m 00s";
  const sec = Math.round(totalSeconds);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (num) => String(num).padStart(2, "0");
  return `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
}

export default function EmployeeMonthlySummaryTable({ embedded = false, userRole = "" }) {
  const isHRRole = String(userRole || "").toLowerCase().includes("hr");
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7) // 'YYYY-MM'
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [summaryData, setSummaryData] = useState({
    staffSummaryTable: [],
    expectedWorkDaysInMonth: 22,
    expectedMonthlyHours: 176,
    dailyTargetHours: 8.0,
  });
  const [loading, setLoading] = useState(true);
  const [errorNotice, setErrorNotice] = useState("");

  // Modal for individual employee daily shift breakdown
  const [activeModalEmp, setActiveModalEmp] = useState(null);
  const [empDailyBreakdown, setEmpDailyBreakdown] = useState([]);
  const [modalFilter, setModalFilter] = useState("WORKED");
  const [modalLoading, setModalLoading] = useState(false);
  const [showMonthlyEvalModal, setShowMonthlyEvalModal] = useState(false);

  // Lock body scroll and handle Escape key when modal is open
  useEffect(() => {
    if (!activeModalEmp) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setActiveModalEmp(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [activeModalEmp]);

  const fetchMonthlySummary = async (monthStr, isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      setErrorNotice("");
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
      const res = await fetch(`/api/attendance/monthly-summary?month=${monthStr}`, { headers });
      if (res.status === 401) {
        return;
      }
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setErrorNotice(errJson.message || "Failed to load monthly summary data.");
      } else {
        const data = await res.json();
        setSummaryData({
          staffSummaryTable: data.staffSummaryTable || [],
          expectedWorkDaysInMonth: data.expectedWorkDaysInMonth || 22,
          expectedMonthlyHours: data.expectedMonthlyHours || 176,
          dailyTargetHours: data.dailyTargetHours || 8.0,
        });
      }
    } catch (err) {
      console.error("Error fetching monthly summary:", err);
      setErrorNotice("Network error loading employee monthly summary.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initMonthly = async () => {
      await fetchMonthlySummary(selectedMonth, true);
    };
    initMonthly();

    // Periodic fallback sync (every 2 minutes) with background pause
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      fetchMonthlySummary(selectedMonth, true);
    }, 120000);

    const handleUpdate = () => fetchMonthlySummary(selectedMonth, true);
    const handleVisibility = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        fetchMonthlySummary(selectedMonth, true);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("attendance-updated", handleUpdate);
      document.addEventListener("visibilitychange", handleVisibility);
    }

    return () => {
      clearInterval(interval);
      if (typeof window !== "undefined") {
        window.removeEventListener("attendance-updated", handleUpdate);
        document.removeEventListener("visibilitychange", handleVisibility);
      }
    };
  }, [selectedMonth]);

  // Open individual employee detail daily record breakdown
  const handleOpenBreakdownModal = async (emp) => {
    setActiveModalEmp(emp);
    setModalFilter("WORKED");
    setModalLoading(true);
    setEmpDailyBreakdown([]);
    try {
      const res = await fetch(
        `/api/attendance/monthly-summary?month=${selectedMonth}&employeeId=${emp.employeeId}`
      );
      if (res.ok) {
        const data = await res.json();
        setEmpDailyBreakdown(data.dailyBreakdown || []);
        if (data.summary) {
          setActiveModalEmp((prev) => ({ ...prev, ...data.summary }));
        }
      }
    } catch (err) {
      console.error("Error loading employee daily breakdown:", err);
    } finally {
      setModalLoading(false);
    }
  };

  // Export Table to Clean, Professional Excel/CSV
  const exportToCSV = () => {
    if (!summaryData.staffSummaryTable || summaryData.staffSummaryTable.length === 0) return;

    const headers = [
      "Employee ID",
      "Full Name",
      "Email",
      "Department",
      "Designation",
      "Attendance Status",
      "Total Effective Working Days",
      "Shift Days Worked",
      "Approved Leave Days",
      "Expected Work Days",
      "Required Monthly Hours (hrs)",
      "Real-Time Worked Hours (hrs)",
      "Approved Leave Credit Hours (hrs)",
      "Loss of Pay (LOP) Shortage Hours (hrs)",
      "Overtime (+OT) Hours (hrs)",
      "Completion Rate (%)",
      "Burnout Risk Level",
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = filteredStaff.map((emp) => [
      escapeCsv(emp.employeeId || ""),
      escapeCsv(emp.fullName || ""),
      escapeCsv(emp.email || ""),
      escapeCsv(emp.department || "General"),
      escapeCsv(emp.designation || ""),
      escapeCsv((emp.evaluationBadge || "Satisfactory").replace(/[\u{1F300}-\u{1F9FF}]/gu, "").trim()),
      emp.totalWorkingDays || 0,
      emp.attendanceWorkedDays || emp.totalWorkingDays || 0,
      emp.approvedLeaveDays || 0,
      summaryData.expectedWorkDaysInMonth || 0,
      Number(emp.requiredHours ?? emp.expectedMonthlyHours ?? summaryData.expectedMonthlyHours ?? 0).toFixed(1),
      Number(emp.workedHours ?? emp.actualWorkingHours ?? 0).toFixed(1),
      Number(emp.approvedLeaveHours || 0).toFixed(1),
      Number(emp.totalLopShortageHours || 0).toFixed(1),
      Number(emp.overtimeHours || 0).toFixed(1),
      `${emp.completionRate || 0}%`,
      escapeCsv(emp.burnoutRiskLevel || "LOW"),
    ]);

    // Use BOM \uFEFF for UTF-8 compatibility in Excel
    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Employee_Monthly_Summary_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Derive unique departments
  const uniqueDepartments = Array.from(
    new Set(summaryData.staffSummaryTable.map((s) => s.department || "General"))
  ).filter(Boolean);

  // Filtered staff list
  const filteredStaff = summaryData.staffSummaryTable.filter((emp) => {
    const matchesSearch =
      !searchQuery ||
      emp.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.department?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.designation?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDept =
      departmentFilter === "ALL" || (emp.department || "General") === departmentFilter;

    return matchesSearch && matchesDept;
  });

  // Modal Daily Breakdown counts and filtered items
  const breakdownCounts = {
    worked: empDailyBreakdown.filter((d) => (d.workedHours > 0 || d.status === "CHECKED_IN" || d.status === "COMPLETED" || d.status === "CHECKED_OUT" || d.status === "ON_BREAK") && d.status !== "ON_LEAVE").length,
    leave: empDailyBreakdown.filter((d) => d.status === "ON_LEAVE").length,
  };

  const filteredDailyBreakdown = empDailyBreakdown.filter((item) => {
    if (modalFilter === "LEAVE") return item.status === "ON_LEAVE";
    return (item.workedHours > 0 || item.status === "CHECKED_IN" || item.status === "COMPLETED" || item.status === "CHECKED_OUT" || item.status === "ON_BREAK") && item.status !== "ON_LEAVE";
  });

  return (
    <div className={embedded ? "space-y-6" : "space-y-6 bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-xs"}>
      {/* --- HEADER CONTROLS & METRICS --- */}
      <div className="space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg md:text-xl font-bold text-slate-900">
              Employee Monthly Summary
            </h2>
          </div>

          {/* Month Selector & Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 bg-slate-50/70 border border-slate-200/80 rounded-xl px-3 py-1.5 shadow-2xs">
              <CalendarIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-xs font-mono text-slate-800 focus:outline-none cursor-pointer font-medium"
              />
            </div>

            <button
              onClick={() => fetchMonthlySummary(selectedMonth, false)}
              className="p-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
              title="Refresh / Recalculate"
            >
              <RefreshCwIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              onClick={exportToCSV}
              disabled={filteredStaff.length === 0}
              className="px-3.5 py-2 rounded-xl bg-brand-gradient hover:opacity-95 disabled:opacity-50 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-xs shadow-[#1f6fb2]/20 cursor-pointer active:scale-[0.98]"
            >
              <FileTextIcon className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            {/* Monthly Performance Evaluation Dialog Button (HR ONLY) */}
            {isHRRole && (
              <button
                type="button"
                onClick={() => setShowMonthlyEvalModal(true)}
                className="px-3.5 py-2 rounded-xl bg-brand-gradient hover:opacity-95 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-xs shadow-[#1f6fb2]/20 cursor-pointer"
                title="Open Monthly Performance & Feedback Evaluation Dialog"
              >
                <span>Monthly Evaluation</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-50/70 p-3 rounded-xl border border-slate-200/80">
          {/* Search Box */}
          <div className="relative flex-1 w-full">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
              <SearchIcon className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by employee name, email, department or designation..."
              className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 transition shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Department Filter */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs text-slate-500 shrink-0 font-medium">Dept:</span>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="w-full sm:w-48 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-sky-500 cursor-pointer shadow-2xs font-medium"
            >
              <option value="ALL">All Departments</option>
              {uniqueDepartments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {errorNotice && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangleIcon className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorNotice}</span>
          </div>
          <button onClick={() => setErrorNotice("")} className="hover:text-slate-900 cursor-pointer">✕</button>
        </div>
      )}

      {/* --- EMPLOYEE MONTHLY SUMMARY TABLE --- */}
      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-500 font-medium">
              Evaluating real-time working hours, attendance &amp; overtime...
            </p>
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <UsersIcon className="w-10 h-10 text-slate-300 mx-auto stroke-1" />
            <p className="text-sm font-semibold text-slate-800">No Employee Records Found</p>
            <p className="text-xs text-slate-500">
              No matching employee monthly summary records for {selectedMonth}.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[750px]">
              <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3.5 px-4">Employee</th>
                  <th className="py-3.5 px-4">Department &amp; Role</th>
                  <th className="py-3.5 px-4 text-center">Working Days</th>
                  <th className="py-3.5 px-4 text-right">Required Hours</th>
                  <th className="py-3.5 px-4 text-right">Worked Hours</th>
                  <th className="py-3.5 px-4 text-right">Overtime (+OT)</th>
                  <th className="py-3.5 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredStaff.map((emp) => {
                  const initial = emp.fullName ? emp.fullName.charAt(0).toUpperCase() : "?";
                  const reqHours = emp.requiredHours ?? emp.expectedMonthlyHours ?? summaryData.expectedMonthlyHours ?? 0;
                  const workedHrs = emp.workedHours ?? emp.totalWorkingHours ?? 0;

                  return (
                    <tr
                      key={emp.employeeId}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      {/* Employee Profile */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden">
                            {emp.avatarUrl || emp.avatar_url ? (
                              <img
                                src={emp.avatarUrl || emp.avatar_url}
                                alt={emp.fullName || "Staff"}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                }}
                              />
                            ) : (
                              initial
                            )}
                          </div>
                          <div className="font-semibold text-slate-900 text-xs">
                            {emp.fullName}
                          </div>
                        </div>
                      </td>

                      {/* Department & Role */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {emp.department || "General"}
                        </span>
                        <div className="text-[10px] text-slate-500 capitalize mt-0.5 font-medium">
                          {emp.role || "Employee"}
                        </div>
                      </td>

                      {/* Working Days Breakdown */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="font-mono font-bold text-slate-900 text-xs">
                          {emp.totalWorkingDays || emp.attendanceWorkedDays || 0}d
                          <span className="text-slate-400 font-mono text-[10px]">
                            {" "}/ {summaryData.expectedWorkDaysInMonth}d
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {emp.attendanceWorkedDays ?? emp.totalWorkingDays ?? 0}d worked
                          {emp.approvedLeaveDays > 0 ? `, +${emp.approvedLeaveDays}d leave` : ""}
                        </div>
                      </td>

                      {/* Required Hours */}
                      <td className="py-3.5 px-4 text-right font-mono font-medium text-slate-900">
                        {reqHours.toFixed(1)} hrs
                      </td>

                      {/* Worked Hours */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="font-mono font-bold text-slate-900 text-xs">
                          {workedHrs.toFixed(1)} hrs
                        </div>
                        {emp.approvedLeaveHours > 0 && (
                          <div className="text-[10px] text-sky-700 font-semibold mt-0.5" title="Approved Paid Leave Credit">
                            +{emp.approvedLeaveHours.toFixed(1)}h Leave Credit
                          </div>
                        )}
                      </td>

                      {/* Overtime (+OT) & Burnout Risk */}
                      <td className="py-3.5 px-4 text-right font-mono">
                        {emp.overtimeHours > 0 ? (
                          <div className="space-y-1">
                            <span className="inline-block px-2 py-0.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              +{emp.overtimeHours.toFixed(1)} hrs
                            </span>
                            {emp.burnoutRiskLevel === "HIGH" && (
                              <div className="text-[9px] text-amber-700 font-bold flex items-center justify-end gap-1">
                                <AlertTriangleIcon className="w-3 h-3 text-amber-600" />
                                <span>High Overtime</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">0.0 hrs</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <button
                          onClick={() => handleOpenBreakdownModal(emp)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 text-xs font-semibold transition cursor-pointer shadow-2xs mx-auto active:scale-[0.98]"
                          title={`View monthly summary report for ${emp.fullName}`}
                        >
                          <FileTextIcon className="w-3.5 h-3.5 text-slate-500" />
                          <span>Monthly Report</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- INDIVIDUAL EMPLOYEE DAILY RECORD DRILL-DOWN MODAL --- */}
      {activeModalEmp && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[99999] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fadeIn"
          onClick={() => setActiveModalEmp(null)}
        >
          <div
            className="relative w-full max-w-5xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col m-auto my-auto animate-scaleIn max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Header matching Configure Hours */}
            <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-1.5 font-sans">
                <span className="font-bold text-slate-900 text-sm sm:text-base">
                  {activeModalEmp.fullName}
                </span>
                <span className="text-[#1f6fb2] font-bold text-sm sm:text-base">
                  — {selectedMonth}
                </span>
              </div>

              {/* Close button */}
              <button
                type="button"
                onClick={() => setActiveModalEmp(null)}
                className="w-7 h-7 border border-slate-200 hover:border-slate-300 text-slate-400 hover:text-slate-700 rounded-lg flex items-center justify-center text-xs transition cursor-pointer shadow-2xs"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 space-y-4 flex-1 flex flex-col overflow-hidden min-h-0">
              {/* Filter Tabs Bar: Only Worked Shifts & Approved Leaves */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
                <button
                  type="button"
                  onClick={() => setModalFilter("WORKED")}
                  className={`px-3.5 py-1.5 rounded-xl font-bold cursor-pointer transition whitespace-nowrap text-xs ${
                    modalFilter === "WORKED"
                      ? "bg-brand-gradient text-white shadow-xs shadow-[#1f6fb2]/20"
                      : "bg-slate-100 hover:bg-slate-200/70 text-slate-700"
                  }`}
                >
                  Worked Shifts ({breakdownCounts.worked})
                </button>
                <button
                  type="button"
                  onClick={() => setModalFilter("LEAVE")}
                  className={`px-3.5 py-1.5 rounded-xl font-bold cursor-pointer transition whitespace-nowrap text-xs ${
                    modalFilter === "LEAVE"
                      ? "bg-brand-gradient text-white shadow-xs shadow-[#1f6fb2]/20"
                      : "bg-slate-100 hover:bg-slate-200/70 text-slate-700"
                  }`}
                >
                  Approved Leaves ({breakdownCounts.leave})
                </button>
              </div>

              {/* Daily Records Table */}
              <div className="flex-1 overflow-y-auto pr-1 min-h-[220px]">
                {modalLoading ? (
                  <div className="py-14 text-center text-xs text-slate-500 space-y-2">
                    <div className="w-7 h-7 border-2 border-[#1f6fb2] border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="font-semibold text-slate-700">Loading shift records...</p>
                  </div>
                ) : filteredDailyBreakdown.length === 0 ? (
                  <div className="py-14 text-center text-xs text-slate-500 space-y-1">
                    <p className="font-semibold text-slate-700">No records found for {modalFilter === "WORKED" ? "worked shifts" : "approved leaves"}.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200/80 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-700 text-[10px] uppercase font-bold sticky top-0 backdrop-blur-xs border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3.5">Date &amp; Day</th>
                          <th className="py-2.5 px-3">Check In — Check Out</th>
                          <th className="py-2.5 px-3 text-right">Required</th>
                          <th className="py-2.5 px-3 text-right">Worked / Credit</th>
                          <th className="py-2.5 px-3 text-right">Shortfall</th>
                          <th className="py-2.5 px-3 text-right">Overtime</th>
                          <th className="py-2.5 px-3.5">Type &amp; Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredDailyBreakdown.map((log) => {
                          const inTime = log.checkIn ? new Date(log.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—";
                          const outTime = log.checkOut ? new Date(log.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : log.status === "CHECKED_IN" ? "On Duty" : "—";

                          const dt = log.workDate ? new Date(log.workDate + "T00:00:00Z") : null;
                          const dayName = dt ? dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }) : "";

                          const isLeave = log.status === "ON_LEAVE";
                          const isLop = log.status === "REJECTED_LOP";

                          let rowBg = "hover:bg-slate-50/80";
                          if (isLeave) rowBg = "bg-sky-50/20 hover:bg-sky-50/50";
                          else if (isLop) rowBg = "bg-rose-50/20 hover:bg-rose-50/50";

                          return (
                            <tr key={log.id} className={`transition duration-150 ${rowBg}`}>
                              {/* Date & Weekday */}
                              <td className="py-2.5 px-3.5 whitespace-nowrap">
                                <div className="flex items-center gap-1.5 font-mono font-bold text-slate-900">
                                  <span>{log.workDate || "—"}</span>
                                  {dayName && (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-sans font-semibold">
                                      {dayName}
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Check In / Out */}
                              <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                                {inTime} — {outTime}
                              </td>

                              {/* Required Target Hours */}
                              <td className="py-2.5 px-3 font-mono text-slate-600 text-right whitespace-nowrap">
                                {log.requiredHours !== undefined && log.requiredHours !== null
                                  ? `${Number(log.requiredHours).toFixed(1)} hrs`
                                  : isLeave ? "0.0 hrs" : "8.0 hrs"}
                              </td>

                              {/* Worked or Credited Hours */}
                              <td className="py-2.5 px-3 font-mono text-right whitespace-nowrap">
                                {isLeave ? (
                                  <div>
                                    <span className="font-bold text-[#1f6fb2] block">
                                      +{Number(log.leaveCreditHours || log.workedHours || 8).toFixed(1)} hrs
                                    </span>
                                    <span className="text-[10px] text-slate-500 font-sans font-semibold block">
                                      Paid Leave
                                    </span>
                                  </div>
                                ) : (
                                  <div>
                                    <span className="font-bold text-slate-900 block">
                                      {formatDurationHMS(log.totalBreakSeconds !== undefined && log.checkIn && log.checkOut ? Math.round((log.workedHours || log.workingHours || 0) * 3600) : Math.round((log.workedHours || log.workingHours || 0) * 3600))}
                                    </span>
                                    <span className="text-[10px] text-slate-500 font-sans block">
                                      ({Number(log.workedHours || log.workingHours || 0).toFixed(2)} hrs)
                                    </span>
                                  </div>
                                )}
                              </td>

                              {/* Shortfall / Deficit */}
                              <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                                {log.shortfallHours > 0 || log.timeGapHours > 0 ? (
                                  <span className="text-rose-600 font-semibold">
                                    -{(log.shortfallHours || log.timeGapHours || 0).toFixed(1)}h
                                  </span>
                                ) : (
                                  <span className="text-slate-400">0.0h</span>
                                )}
                              </td>

                              {/* Overtime */}
                              <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                                {log.overtimeHours > 0 ? (
                                  <span className="text-emerald-700 font-semibold">
                                    +{Number(log.overtimeHours).toFixed(1)}h
                                  </span>
                                ) : (
                                  <span className="text-slate-400">0.0h</span>
                                )}
                              </td>

                              {/* Type, Status & HR Remarks */}
                              <td className="py-2.5 px-3.5 whitespace-nowrap">
                                <div className="space-y-1">
                                  {isLeave ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200/70">
                                      Approved Leave ({log.leaveType || "Casual"})
                                    </span>
                                  ) : isLop ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/70">
                                      Loss of Pay (LOP)
                                    </span>
                                  ) : (
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                                      log.status === "CHECKED_IN"
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200/70"
                                        : log.status === "ON_BREAK"
                                        ? "bg-amber-50 text-amber-700 border-amber-200/70"
                                        : "bg-slate-100 text-slate-700 border-slate-200/80"
                                    }`}>
                                      {log.status === "CHECKED_IN" ? "On Duty" : log.status === "ON_BREAK" ? "On Break" : "Completed"}
                                    </span>
                                  )}

                                  {log.hrRemarks && (
                                    <div className="text-[10px] text-slate-500 font-medium max-w-xs truncate">
                                      {log.hrRemarks}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setActiveModalEmp(null)}
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 text-xs font-semibold cursor-pointer shadow-2xs transition"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ⭐ Monthly Performance Evaluation Popup Modal */}
      {showMonthlyEvalModal && (
        <HRMonthlyEvaluationModal
          isOpen={showMonthlyEvalModal}
          onClose={() => setShowMonthlyEvalModal(false)}
          onSaved={() => {
            setShowMonthlyEvalModal(false);
            fetchMonthlySummary(selectedMonth, false);
          }}
        />
      )}
    </div>
  );
}
