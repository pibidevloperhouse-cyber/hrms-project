"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import TLMonthlyEvaluationModal from "./TLMonthlyEvaluationModal";

export default function TLMonthlyEvaluationTab() {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [summaryData, setSummaryData] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);

  const showNotificationToast = (message, type = "info") => {
    setToastMsg({ message, type });
  };

  useEffect(() => {
    if (toastMsg) {
      const timer = setTimeout(() => setToastMsg(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toastMsg]);

  // Generate last 24 months for dropdown
  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      options.push({ value: val, label });
    }
    return options;
  }, []);

  const fetchMonthlySummary = useCallback(async (monthStr) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/performance/monthly-tl/summary?month=${monthStr}`);
      if (res.ok) {
        const json = await res.json();
        setSummaryData(json);
      }
    } catch (err) {
      console.error("Failed to fetch monthly TL evaluations:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMonthlySummary(selectedMonth);
  }, [selectedMonth, fetchMonthlySummary]);

  const employees = summaryData?.employees || [];

  // Unique departments for filter
  const departments = useMemo(() => {
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
      <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 rounded-3xl p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">Monthly Evaluation</h1>
              <p className="text-xs text-slate-300">
                Task deadline completion calculation combined with Learning, Innovation, and Collaboration ratings.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls & Month Selector */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white/10 px-3.5 py-2 rounded-2xl border border-white/10 backdrop-blur-xs">
            <svg className="w-4 h-4 text-sky-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-all shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <span>Monthly Evaluation</span>
          </button>
        </div>
      </div>

      {/* Stats KPI Ribbon */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Team</div>
          <div className="text-2xl font-black text-slate-800 mt-1">{totalEmployees}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Active team members</div>
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
          <div className="text-[11px] text-amber-700/80 mt-0.5">Awaiting TL appraisal</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-sky-600">Average Final Score</div>
          <div className="text-2xl font-black text-sky-600 mt-1">
            {avgScore} <span className="text-xs font-normal text-slate-400">/ 100</span>
          </div>
          <div className="text-[11px] text-sky-700/80 mt-0.5">Across evaluated members</div>
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
            placeholder="Search team member, role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Department:</span>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 bg-slate-50 focus:outline-none focus:border-sky-500 cursor-pointer"
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
            <svg className="animate-spin w-6 h-6 text-sky-600" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span>Loading monthly task execution &amp; evaluation records...</span>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            No team members found matching the filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-4">Team Member</th>
                  <th className="py-3.5 px-3">Tasks (25 pts)</th>
                  <th className="py-3.5 px-3">Deadline (15 pts)</th>
                  <th className="py-3.5 px-3 text-center">Auto Task (40)</th>
                  <th className="py-3.5 px-3 text-center">Learning (20)</th>
                  <th className="py-3.5 px-3 text-center">Innovate (20)</th>
                  <th className="py-3.5 px-3 text-center">Collab (20)</th>
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
                      {/* Member Info */}
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
                              {emp.designation || "Developer"} · {emp.department || "General"}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 1. Task Completion */}
                      <td className="py-3.5 px-3">
                        <div className="font-semibold text-slate-800">
                          {m.completed_tasks || 0}/{m.total_tasks || 0} Done
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {(Number(scores.taskCompletionScore) || 0).toFixed(1)}/25 pts
                        </div>
                      </td>

                      {/* 2. Deadline Punctuality */}
                      <td className="py-3.5 px-3">
                        <div className="font-semibold text-slate-800">
                          {m.on_time_tasks || 0} On-Time {m.delayed_tasks > 0 && <span className="text-rose-500 font-bold">(-{m.delayed_tasks})</span>}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {(Number(scores.deadlinePunctualityScore) || 0).toFixed(1)}/15 pts
                        </div>
                      </td>

                      {/* 3. Auto Task Score (40) */}
                      <td className="py-3.5 px-3 text-center">
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-bold font-mono text-xs">
                          {(Number(scores.autoTaskScore) || 0).toFixed(1)}/40
                        </span>
                      </td>

                      {/* 4. Learning Skills */}
                      <td className="py-3.5 px-3 text-center">
                        {isEval ? (
                          <span className="font-semibold text-indigo-700 font-mono">
                            {evalData.learningScore}/20
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">Pending</span>
                        )}
                      </td>

                      {/* 5. Innovation */}
                      <td className="py-3.5 px-3 text-center">
                        {isEval ? (
                          <span className="font-semibold text-indigo-700 font-mono">
                            {evalData.innovationScore}/20
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">Pending</span>
                        )}
                      </td>

                      {/* 6. Collaboration */}
                      <td className="py-3.5 px-3 text-center">
                        {isEval ? (
                          <span className="font-semibold text-indigo-700 font-mono">
                            {evalData.collaborationScore}/20
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">Pending</span>
                        )}
                      </td>

                      {/* Final Score */}
                      <td className="py-3.5 px-3 text-center">
                        {isEval ? (
                          <div className="space-y-1">
                            <span className="font-black text-slate-900 text-sm font-mono block">
                              {evalData.finalScore}/100
                            </span>
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${getBadgeStyle(evalData.performanceBadge)}`}>
                              {evalData.performanceBadge}
                            </span>
                          </div>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            Draft ({scores.autoTaskScore}/40)
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setIsModalOpen(true)}
                          className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer shadow-2xs ${
                            isEval
                              ? "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                              : "bg-sky-600 hover:bg-sky-500 text-white"
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

      {/* Toast Notification Banner */}
      {toastMsg && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[300] pointer-events-auto animate-scaleIn">
          <div className="relative pt-2.5">
            <div className="absolute top-0 left-4 z-10">
              <span
                className={`px-3 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider text-white shadow-xs ${
                  toastMsg.type === "warning"
                    ? "bg-amber-500"
                    : toastMsg.type === "error"
                    ? "bg-rose-500"
                    : toastMsg.type === "info"
                    ? "bg-sky-500"
                    : "bg-emerald-500"
                }`}
              >
                {toastMsg.type === "warning"
                  ? "WARNING"
                  : toastMsg.type === "error"
                  ? "ERROR"
                  : toastMsg.type === "info"
                  ? "INFO"
                  : "SUCCESS"}
              </span>
            </div>

            <div
              className={`bg-white rounded-2xl border-2 px-4 py-3 shadow-xl flex items-center gap-3 min-w-[280px] sm:min-w-[320px] max-w-md ${
                toastMsg.type === "warning"
                  ? "border-amber-500 shadow-amber-500/10"
                  : toastMsg.type === "error"
                  ? "border-rose-500 shadow-rose-500/10"
                  : toastMsg.type === "info"
                  ? "border-sky-500 shadow-sky-500/10"
                  : "border-emerald-500 shadow-emerald-500/10"
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-black shrink-0 ${
                  toastMsg.type === "warning"
                    ? "border-amber-500 text-amber-500"
                    : toastMsg.type === "error"
                    ? "border-rose-500 text-rose-500"
                    : toastMsg.type === "info"
                    ? "border-sky-500 text-sky-500"
                    : "border-emerald-500 text-emerald-500"
                }`}
              >
                {toastMsg.type === "warning"
                  ? "!"
                  : toastMsg.type === "error"
                  ? "✕"
                  : toastMsg.type === "info"
                  ? "ℹ"
                  : "✓"}
              </div>

              <span className="flex-1 text-sm font-bold text-slate-900 tracking-tight leading-snug">
                {toastMsg.message}
              </span>

              <button
                type="button"
                onClick={() => setToastMsg(null)}
                className="text-slate-400 hover:text-slate-700 shrink-0 text-xs font-bold cursor-pointer p-1 rounded-full hover:bg-slate-100 transition"
                title="Close"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Popup */}
      <TLMonthlyEvaluationModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          fetchMonthlySummary(selectedMonth);
        }}
        onSaved={(empName) => {
          setIsModalOpen(false);
          fetchMonthlySummary(selectedMonth);
          showNotificationToast(`Monthly evaluation saved successfully for ${empName || "employee"}.`, "success");
        }}
      />
    </div>
  );
}
