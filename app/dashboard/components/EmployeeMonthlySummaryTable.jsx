"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";

function formatDurationHMS(totalSeconds) {
  if (!totalSeconds || isNaN(totalSeconds) || totalSeconds <= 0) return "00h 00m 00s";
  const sec = Math.round(totalSeconds);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (num) => String(num).padStart(2, "0");
  return `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
}

export default function EmployeeMonthlySummaryTable() {
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
  const [modalLoading, setModalLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

    // Real-time 2-second polling ticker & postgres update event listener
    const interval = setInterval(() => {
      fetchMonthlySummary(selectedMonth, true);
    }, 2000);

    const handleUpdate = () => fetchMonthlySummary(selectedMonth, true);
    if (typeof window !== "undefined") {
      window.addEventListener("attendance-updated", handleUpdate);
    }

    return () => {
      clearInterval(interval);
      if (typeof window !== "undefined") {
        window.removeEventListener("attendance-updated", handleUpdate);
      }
    };
  }, [selectedMonth]);

  // Open individual employee detail daily record breakdown
  const handleOpenBreakdownModal = async (emp) => {
    setActiveModalEmp(emp);
    setModalLoading(true);
    setEmpDailyBreakdown([]);
    try {
      const res = await fetch(
        `/api/attendance/monthly-summary?month=${selectedMonth}&employeeId=${emp.employeeId}`
      );
      if (res.ok) {
        const data = await res.json();
        setEmpDailyBreakdown(data.dailyBreakdown || []);
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
      "HR Company Holidays",
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
      emp.companyHolidaysCount || 0,
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

  return (
    <div className="space-y-6">
      {/* --- HEADER CONTROLS & METRICS --- */}
      <div className="bg-white border border-sky-100 rounded-2xl p-6 shadow-2xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-sky-100 pb-5">
          <div>
            <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
              Employee Monthly Summary
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Working days, required hours, worked hours, shortfalls, Loss of Pay (LOP), and HR holidays.
            </p>
          </div>

          {/* Month Selector & Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-sky-50/50 border border-sky-200 rounded-xl px-3 py-2">
              <span className="text-slate-500 text-xs">📅</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-xs font-mono text-slate-800 focus:outline-none cursor-pointer"
              />
            </div>

            <button
              onClick={() => fetchMonthlySummary(selectedMonth, false)}
              className="p-2.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
              title="Refresh / Recalculate"
            >
              <span>🔄</span>
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              onClick={exportToCSV}
              disabled={filteredStaff.length === 0}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-2 shadow-md shadow-emerald-500/20 cursor-pointer"
            >
              <span>📥</span>
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1 w-full">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by employee name, email, department or designation..."
              className="w-full bg-sky-50/40 border border-sky-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-800 placeholder-sky-400 focus:outline-none focus:border-sky-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Department Filter */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs text-slate-500 shrink-0">Dept:</span>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="w-full sm:w-48 bg-white border border-sky-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-sky-500 cursor-pointer"
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
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center justify-between">
          <span>⚠️ {errorNotice}</span>
          <button onClick={() => setErrorNotice("")} className="hover:text-slate-900">✕</button>
        </div>
      )}


      {/* --- EMPLOYEE MONTHLY SUMMARY TABLE --- */}
      <div className="bg-white border border-sky-100 rounded-2xl overflow-hidden shadow-2xs">
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-500 font-medium">
              Evaluating real-time working hours, attendance &amp; overtime...
            </p>
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <div className="text-3xl">📂</div>
            <p className="text-sm font-semibold text-slate-800">No Employee Records Found</p>
            <p className="text-xs text-slate-500">
              No matching employee monthly summary records for {selectedMonth}.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[850px]">
              <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3.5 px-4">Employee</th>
                  <th className="py-3.5 px-4">Department &amp; Role</th>
                  <th className="py-3.5 px-4 text-center">Working Days</th>
                  <th className="py-3.5 px-4 text-right">Required Hours</th>
                  <th className="py-3.5 px-4 text-right">Worked Hours</th>
                  <th className="py-3.5 px-4 text-right">Overtime (+OT)</th>
                  <th className="py-3.5 px-4 text-center">Attendance Fulfillment</th>
                  <th className="py-3.5 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredStaff.map((emp) => {
                  const initial = emp.fullName ? emp.fullName.charAt(0).toUpperCase() : "?";
                  const reqHours = emp.requiredHours ?? emp.expectedMonthlyHours ?? summaryData.expectedMonthlyHours ?? 0;
                  const workedHrs = emp.workedHours ?? emp.totalWorkingHours ?? 0;
                  const completionPct = reqHours > 0 ? Math.min(Math.round((workedHrs / reqHours) * 100), 100) : 100;

                  return (
                    <tr
                      key={emp.employeeId}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      {/* Employee Profile */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-sky-100/80 border border-sky-200 text-sky-800 flex items-center justify-center font-extrabold shadow-2xs text-xs shrink-0">
                            {initial}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-xs group-hover:text-sky-600 transition">
                              {emp.fullName}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {emp.email}
                            </div>
                            {emp.designation && (
                              <div className="text-[10px] text-slate-400">
                                {emp.designation}
                              </div>
                            )}
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
                          {emp.companyHolidaysCount > 0 ? `, +${emp.companyHolidaysCount}d holiday` : ""}
                        </div>
                      </td>

                      {/* Required Hours */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-700">
                        {reqHours.toFixed(1)} hrs
                      </td>

                      {/* Worked Hours */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="font-mono font-bold text-emerald-700 text-xs">
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
                              <div className="text-[9px] text-amber-700 font-bold flex items-center justify-end gap-0.5">
                                <span>🔥</span>
                                <span>Burnout Risk</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">0.0 hrs</span>
                        )}
                      </td>

                      {/* Attendance Fulfillment */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="inline-flex flex-col items-center gap-1">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                              completionPct >= 100
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : completionPct >= 85
                                ? "bg-sky-50 text-sky-700 border-sky-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}
                          >
                            <span>{completionPct >= 100 ? "✓" : "⏱"}</span>
                            <span>{completionPct}% Fulfilled</span>
                          </span>
                          {emp.totalLopShortageHours > 0 && (
                            <span className="text-[10px] text-rose-600 font-semibold">
                              -{emp.totalLopShortageHours.toFixed(1)}h Shortfall
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <button
                          onClick={() => handleOpenBreakdownModal(emp)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-sky-50 text-sky-700 hover:text-sky-800 border border-slate-200 hover:border-sky-200 text-xs font-semibold transition cursor-pointer shadow-2xs mx-auto"
                          title={`View monthly summary report for ${emp.fullName}`}
                        >
                          <svg className="w-3.5 h-3.5 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
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
      {mounted && activeModalEmp && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[99999] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
          onClick={() => setActiveModalEmp(null)}
        >
          <div
            className="relative w-full max-w-4xl bg-white border border-sky-100 rounded-2xl p-5 sm:p-6 space-y-5 shadow-2xl max-h-[90vh] flex flex-col my-auto animate-scaleUp"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-sky-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-sky-600 flex items-center justify-center font-extrabold text-white text-lg shadow-md shadow-sky-500/20 shrink-0">
                  {activeModalEmp.fullName?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 text-[10px] font-bold uppercase tracking-wider border border-sky-200 mb-1">
                    <span>📊</span> Monthly Summary Report
                  </div>
                  <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                    {activeModalEmp.fullName} — Daily Shift Records ({selectedMonth})
                  </h3>
                  <p className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                    <span>{activeModalEmp.department || "General"}</span>
                    <span>•</span>
                    <span>{activeModalEmp.email}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveModalEmp(null)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition cursor-pointer text-sm font-bold shrink-0"
                title="Close (Esc)"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {/* Daily Records Summary Chips */}
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 bg-sky-50/50 p-3.5 rounded-xl border border-sky-100 text-xs">
              <div>
                <div className="text-slate-500 text-[10px] uppercase font-bold">Working Days</div>
                <div className="font-bold text-slate-900 text-sm font-mono">
                  {activeModalEmp.totalWorkingDays || activeModalEmp.attendanceWorkedDays || 0}d / {summaryData.expectedWorkDaysInMonth}d
                </div>
                <div className="text-[9px] text-slate-500">
                  {activeModalEmp.attendanceWorkedDays ?? activeModalEmp.totalWorkingDays ?? 0} worked
                </div>
              </div>
              <div>
                <div className="text-slate-500 text-[10px] uppercase font-bold">Required Target</div>
                <div className="font-bold text-slate-900 text-sm font-mono">
                  {activeModalEmp.requiredHours || summaryData.expectedMonthlyHours} hrs
                </div>
              </div>
              <div>
                <div className="text-slate-500 text-[10px] uppercase font-bold">Total Worked</div>
                <div className="font-bold text-emerald-700 text-sm font-mono">
                  {activeModalEmp.workedHours || activeModalEmp.totalWorkingHours} hrs
                </div>
              </div>
              <div>
                <div className="text-amber-700 text-[10px] uppercase font-bold">Shortfall Deficit</div>
                <div className={`font-bold text-sm font-mono ${(activeModalEmp.shortfallHours || 0) > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                  {(activeModalEmp.shortfallHours || 0) > 0 ? `-${activeModalEmp.shortfallHours.toFixed(1)} hrs` : "0.0 hrs"}
                </div>
              </div>
              <div>
                <div className="text-slate-500 text-[10px] uppercase font-bold">Overtime (+OT)</div>
                <div className="font-bold text-emerald-700 text-sm font-mono">
                  +{activeModalEmp.overtimeHours || 0} hrs
                </div>
              </div>
              <div>
                <div className="text-slate-500 text-[10px] uppercase font-bold">Leave Credit</div>
                <div className="font-bold text-sky-700 text-sm font-mono">
                  +{activeModalEmp.approvedLeaveHours || 0} hrs ({activeModalEmp.approvedLeaveDays || 0}d)
                </div>
              </div>
            </div>

            {/* Daily Records Table */}
            <div className="flex-1 overflow-y-auto pr-1">
              {modalLoading ? (
                <div className="py-12 text-center text-xs text-slate-500 space-y-2">
                  <div className="w-6 h-6 border-2 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p>Fetching real-time shift records for {activeModalEmp.fullName}...</p>
                </div>
              ) : empDailyBreakdown.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  No individual daily attendance logs found for this month.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-sky-50/50 text-sky-900 text-[10px] uppercase font-bold sticky top-0 backdrop-blur-xs">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Check In — Check Out</th>
                        <th className="py-2.5 px-3 text-right">Required</th>
                        <th className="py-2.5 px-3 text-right">Worked</th>
                        <th className="py-2.5 px-3 text-right">Shortfall</th>
                        <th className="py-2.5 px-3 text-right">Overtime</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sky-100">
                      {empDailyBreakdown.map((log) => {
                        const inTime = log.checkIn ? new Date(log.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—";
                        const outTime = log.checkOut ? new Date(log.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : log.status === "CHECKED_IN" ? "On Duty" : "—";

                        return (
                          <tr key={log.id} className="hover:bg-sky-50/50 transition duration-150">
                            <td className="py-2.5 px-3 font-mono text-slate-800 font-bold">
                              {log.workDate || "—"}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-600">
                              {inTime} — {outTime}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-600 text-right">
                              8.0 hrs
                            </td>
                            <td className="py-2.5 px-3 font-mono text-right">
                              <span className="font-bold text-emerald-700 block">
                                {formatDurationHMS(log.netWorkingSeconds || Math.round((log.workedHours || log.workingHours || 0) * 3600))}
                              </span>
                              <span className="text-[10px] text-slate-500 font-sans block">
                                ({log.workedHours ? log.workedHours.toFixed(2) : "0.00"} hrs)
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              {log.shortfallHours > 0 || log.timeGapHours > 0 ? (
                                <span className="text-amber-700 font-bold">
                                  -{(log.shortfallHours || log.timeGapHours || 0).toFixed(1)}h
                                </span>
                              ) : (
                                <span className="text-slate-400">0.0h</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              {log.overtimeHours > 0 ? (
                                <span className="text-emerald-700 font-bold">
                                  +{log.overtimeHours.toFixed(1)}h
                                </span>
                              ) : (
                                <span className="text-slate-400">0.0h</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                {log.status === "CHECKED_IN" ? "On Duty" : log.status === "CHECKED_OUT" ? "Completed" : log.status || "Logged"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-sky-100 pt-3 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Press <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 font-mono text-[10px]">Esc</kbd> or click outside to close
              </span>
              <button
                onClick={() => setActiveModalEmp(null)}
                className="px-4 py-2 rounded-xl bg-sky-100 hover:bg-sky-200 text-slate-700 text-xs font-semibold cursor-pointer transition"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
