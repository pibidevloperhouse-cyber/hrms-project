"use client";

import React, { useState, useEffect, useCallback } from "react";
import HREvaluationModal from "./HREvaluationModal";

export default function HRMonthlyEvaluationTab() {
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7) // 'YYYY-MM'
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [summaryData, setSummaryData] = useState(null);
  const [selectedEmpForEval, setSelectedEmpForEval] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // Generate last 24 months for dropdown
  const monthOptions = React.useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const val = `${y}-${m}`;
      const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      options.push({ value: val, label });
    }
    return options;
  }, []);

  const fetchMonthlySummary = useCallback(async (monthStr) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/performance/monthly-hr/summary?month=${monthStr}`);
      if (res.ok) {
        const json = await res.json();
        setSummaryData(json);
      }
    } catch (err) {
      console.error("Failed to fetch monthly HR evaluations:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMonthlySummary(selectedMonth);
  }, [selectedMonth, fetchMonthlySummary]);

  const employees = summaryData?.employees || [];

  // Unique departments for filter
  const departments = React.useMemo(() => {
    const depts = new Set(employees.map((e) => e.employee?.department).filter(Boolean));
    return ["ALL", ...Array.from(depts)];
  }, [employees]);

  // Filtered employees
  const filteredEmployees = employees.filter((item) => {
    const emp = item.employee || {};
    const matchesSearch =
      emp.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.designation?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = departmentFilter === "ALL" || emp.department === departmentFilter;
    return matchesSearch && matchesDept;
  });

  // Aggregated Stats
  const totalEmployees = employees.length;
  const evaluatedCount = employees.filter((e) => e.isEvaluated).length;
  const pendingCount = totalEmployees - evaluatedCount;
  const avgScore =
    evaluatedCount > 0
      ? Math.round(
          employees.reduce((acc, curr) => acc + (curr.isEvaluated ? curr.evaluation?.finalScore || 0 : 0), 0) /
            evaluatedCount
        )
      : 0;

  const handleOpenEvaluation = (empData) => {
    setSelectedEmpForEval(empData);
    setShowModal(true);
  };

  const handleSaveSuccess = (savedEval) => {
    // Refresh current month list
    fetchMonthlySummary(selectedMonth);
  };

  const getBadgeStyle = (badge) => {
    switch (badge) {
      case "Exceptional":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "High Performer":
        return "bg-indigo-50 text-indigo-700 border-indigo-200";
      case "On Track":
        return "bg-sky-50 text-sky-700 border-sky-200";
      default:
        return "bg-amber-50 text-amber-700 border-amber-200";
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">Monthly Employee Performance & HR Feedback</h1>
              <p className="text-xs text-slate-300">
                Monthly evaluation engine based exclusively on Daily Attendance, Leaves, and Working Hours.
              </p>
            </div>
          </div>
        </div>

        {/* Month Selector */}
        <div className="flex items-center gap-2 bg-white/10 px-3.5 py-2 rounded-2xl border border-white/10 backdrop-blur-xs">
          <svg className="w-4 h-4 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
          >
            {monthOptions.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-slate-900 text-white">
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats KPI Ribbon */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Staff</div>
          <div className="text-2xl font-black text-slate-800 mt-1">{totalEmployees}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Active in company</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Evaluated</div>
          <div className="text-2xl font-black text-emerald-600 mt-1">{evaluatedCount}</div>
          <div className="text-[11px] text-emerald-700/80 mt-0.5">
            {totalEmployees > 0 ? Math.round((evaluatedCount / totalEmployees) * 100) : 0}% completed
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-amber-600">Pending Review</div>
          <div className="text-2xl font-black text-amber-600 mt-1">{pendingCount}</div>
          <div className="text-[11px] text-amber-700/80 mt-0.5">Awaiting HR feedback</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Average Final Score</div>
          <div className="text-2xl font-black text-indigo-600 mt-1">{avgScore} <span className="text-xs font-normal text-slate-400">/ 100</span></div>
          <div className="text-[11px] text-indigo-700/80 mt-0.5">Across evaluated staff</div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="relative w-full sm:w-72">
          <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search employee, designation..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Department:</span>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 bg-slate-50 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Employees Evaluation Table */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
            <svg className="animate-spin w-6 h-6 text-indigo-600" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span>Loading monthly attendance & working records...</span>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            No employees found matching the filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-4">Employee</th>
                  <th className="py-3.5 px-3">1. Attendance (40 pts)</th>
                  <th className="py-3.5 px-3">2. Working Hours (40 pts)</th>
                  <th className="py-3.5 px-3">3. Leaves (20 pts)</th>
                  <th className="py-3.5 px-3 text-center">3-Pillars Auto</th>
                  <th className="py-3.5 px-3 text-center">HR Rating</th>
                  <th className="py-3.5 px-3 text-center">Final Score</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredEmployees.map((item) => {
                  const emp = item.employee || {};
                  const m = item.metrics || {};
                  const scores = item.scores || {};
                  const evalData = item.evaluation || {};
                  const isEval = item.isEvaluated;

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Employee Profile */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-600 text-xs overflow-hidden">
                            {emp.avatar_url ? (
                              <img src={emp.avatar_url} alt={emp.full_name} className="w-full h-full object-cover" />
                            ) : (
                              emp.full_name?.charAt(0) || "E"
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">{emp.full_name}</div>
                            <div className="text-[11px] text-slate-400">
                              {emp.designation || "Staff"} • {emp.department || "General"}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 1. Attendance Pillar */}
                      <td className="py-3.5 px-3">
                        <div className="font-semibold text-slate-800">
                          {m.present_days} / {m.total_working_days} days
                        </div>
                        <div className="text-[10px] text-emerald-600 font-bold">
                          {scores.attendanceScore} / 40 pts
                        </div>
                      </td>

                      {/* 2. Working Hours Pillar */}
                      <td className="py-3.5 px-3">
                        <div className="font-semibold text-slate-800">
                          {m.actual_working_hours} / {m.expected_monthly_hours}h
                        </div>
                        <div className="text-[10px] text-sky-600 font-bold">
                          {scores.hoursScore} / 40 pts ({m.completion_rate}%)
                        </div>
                      </td>

                      {/* 3. Leave & Discipline Pillar */}
                      <td className="py-3.5 px-3">
                        <div className="font-semibold text-slate-800">
                          {m.approved_leave_days}d leave / {m.absent_days}d abs
                        </div>
                        <div className="text-[10px] text-purple-600 font-bold">
                          {scores.leaveScore} / 20 pts
                        </div>
                      </td>

                      {/* Auto Base Score */}
                      <td className="py-3.5 px-3 text-center">
                        <span className="font-extrabold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                          {scores.autoBaseScore}
                        </span>
                      </td>

                      {/* HR Qualitative Rating */}
                      <td className="py-3.5 px-3 text-center">
                        {isEval ? (
                          <div className="inline-flex items-center gap-1 font-bold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-200 text-xs">
                            <span>⭐</span>
                            <span>{Number(evalData.hrRating).toFixed(1)}/10</span>
                          </div>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                            Pending
                          </span>
                        )}
                      </td>

                      {/* Final Score & Badge */}
                      <td className="py-3.5 px-3 text-center">
                        {isEval ? (
                          <div className="space-y-0.5">
                            <div className="font-black text-slate-900 text-sm">{evalData.finalScore}</div>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getBadgeStyle(evalData.performanceBadge)}`}>
                              {evalData.performanceBadge}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs italic">—</span>
                        )}
                      </td>

                      {/* Action Button */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleOpenEvaluation(item)}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow-xs ${
                            isEval
                              ? "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                              : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200"
                          }`}
                        >
                          {isEval ? "View Review" : "Evaluate"}
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

      {/* Evaluation Modal */}
      {showModal && (
        <HREvaluationModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          employeeData={selectedEmpForEval}
          month={selectedMonth}
          onSaveSuccess={handleSaveSuccess}
        />
      )}
    </div>
  );
}
