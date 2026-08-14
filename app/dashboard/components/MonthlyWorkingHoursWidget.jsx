"use client";

import React, { useState, useEffect } from "react";

export default function MonthlyWorkingHoursWidget() {
  const [targetMonth, setTargetMonth] = useState(
    new Date().toISOString().slice(0, 7) // 'YYYY-MM'
  );
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = async (monthStr, isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const res = await fetch(`/api/attendance/monthly-summary?month=${monthStr}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to fetch monthly summary widget data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary(targetMonth, true);

    const interval = setInterval(() => {
      fetchSummary(targetMonth, true);
    }, 2000);

    const handleUpdate = () => fetchSummary(targetMonth, true);
    if (typeof window !== "undefined") {
      window.addEventListener("attendance-updated", handleUpdate);
    }

    return () => {
      clearInterval(interval);
      if (typeof window !== "undefined") {
        window.removeEventListener("attendance-updated", handleUpdate);
      }
    };
  }, [targetMonth]);

  const summary = data?.summary || {};
  const expectedMonthlyHours = data?.expectedMonthlyHours || 176;
  const actualWorkingHours = summary.actualWorkingHours ?? summary.workedHours ?? 0;
  const approvedLeaveHours = summary.approvedLeaveHours ?? 0;
  const approvedLeaveDays = summary.approvedLeaveDays ?? 0;
  const totalCombinedHours = actualWorkingHours + approvedLeaveHours;
  const overtimeHours = summary.totalOvertimeHours ?? summary.overtimeHours ?? 0;
  const timeDelayHours = summary.totalTimeGapHours ?? summary.timeDelayHours ?? 0;
  const completionRate = summary.completionRate ?? (expectedMonthlyHours > 0 ? Math.min(100, Math.round((totalCombinedHours / expectedMonthlyHours) * 100)) : 0);
  const absentDays = summary.absentDays ?? 0;

  return (
    <div className="bg-white border border-sky-100 rounded-2xl p-6 shadow-2xs space-y-5 flex flex-col justify-between hover:border-sky-300 transition duration-300">
      {/* Widget Header & Month Picker */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-sky-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-lg text-sky-600 shadow-2xs">
            📊
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              Monthly Working Hours
            </h3>
            <p className="text-xs text-slate-500">
              Shift hours + approved leave credit calculation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-sky-50/50 border border-sky-200 rounded-xl px-3 py-1.5 self-start sm:self-auto">
          <span className="text-slate-500 text-xs">📅</span>
          <input
            type="month"
            value={targetMonth}
            onChange={(e) => setTargetMonth(e.target.value)}
            className="bg-transparent text-xs font-mono text-slate-800 focus:outline-none cursor-pointer"
          />
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center space-y-2">
          <div className="w-6 h-6 border-2 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500">Calculating monthly working hours...</p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Main Big Metric & Progress */}
          <div className="bg-sky-50/50 border border-sky-100 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Total Monthly Hours
                </span>
                <div className="text-2xl font-black text-slate-900 font-mono mt-0.5">
                  {totalCombinedHours.toFixed(1)} / {expectedMonthlyHours.toFixed(1)} hrs
                </div>
              </div>
              <div className="text-right">
                <span className="inline-block px-3 py-1 rounded-full text-xs font-black bg-sky-100 text-sky-800 border border-sky-200 font-mono">
                  {completionRate}% Completed
                </span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-sky-100 h-2.5 rounded-full overflow-hidden border border-sky-200/60">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  completionRate >= 95
                    ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                    : completionRate >= 80
                    ? "bg-gradient-to-r from-sky-500 to-blue-500"
                    : completionRate >= 60
                    ? "bg-gradient-to-r from-amber-400 to-orange-500"
                    : "bg-gradient-to-r from-rose-500 to-red-500"
                }`}
                style={{ width: `${Math.min(100, completionRate)}%` }}
              />
            </div>
          </div>

          {/* Breakdown Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {/* Shift Hours Worked */}
            <div className="bg-sky-50/40 p-3 rounded-xl border border-sky-100 space-y-0.5">
              <span className="text-[10px] text-slate-500 font-bold uppercase block">
                Shift Worked
              </span>
              <span className="font-mono font-extrabold text-slate-900 text-sm">
                {actualWorkingHours.toFixed(1)} hrs
              </span>
            </div>

            {/* Approved Leave Credit */}
            <div className="bg-sky-50/40 p-3 rounded-xl border border-sky-200 space-y-0.5">
              <span className="text-[10px] text-sky-800 font-bold uppercase block">
                Leave Credit
              </span>
              <span className="font-mono font-extrabold text-sky-700 text-sm">
                +{approvedLeaveHours.toFixed(1)} hrs
              </span>
            </div>

            {/* Overtime (+OT) */}
            <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-200 space-y-0.5">
              <span className="text-[10px] text-emerald-800 font-bold uppercase block">
                Overtime (+OT)
              </span>
              <span className="font-mono font-extrabold text-emerald-700 text-sm">
                +{overtimeHours.toFixed(1)} hrs
              </span>
            </div>

            {/* Absent Days */}
            <div className="bg-sky-50/40 p-3 rounded-xl border border-sky-100 space-y-0.5">
              <span className="text-[10px] text-slate-500 font-bold uppercase block">
                Absent Days
              </span>
              <span className={`font-mono font-extrabold text-sm ${absentDays > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                {absentDays} Days
              </span>
            </div>
          </div>

          {/* HR Evaluation Badge Banner */}
          {summary.evaluationBadge && (
            <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-sm">🛡️</span>
                <span className="font-extrabold text-slate-900">
                  {summary.evaluationBadge}
                </span>
              </div>
              <span className="text-[10px] text-slate-600 max-w-xs truncate">
                {summary.suggestionText}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
