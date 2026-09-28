"use client";

import React, { useState, useEffect, useMemo } from "react";

export default function EmployeeMonthlyScorecard() {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [activeView, setActiveView] = useState("tl"); // "tl" | "hr"
  const [loading, setLoading] = useState(true);
  const [hrEvalData, setHrEvalData] = useState(null);
  const [tlEvalData, setTlEvalData] = useState(null);

  // Last 12 months options
  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      options.push({ value: val, label });
    }
    return options;
  }, []);

  useEffect(() => {
    async function fetchEvaluations() {
      setLoading(true);
      try {
        const [hrRes, tlRes] = await Promise.all([
          fetch(`/api/performance/monthly-hr/my-evaluation?month=${selectedMonth}`).catch(() => null),
          fetch(`/api/performance/monthly-tl/my-evaluation?month=${selectedMonth}`).catch(() => null),
        ]);

        if (hrRes && hrRes.ok) {
          const hrJson = await hrRes.json();
          setHrEvalData(hrJson.evaluation);
        } else {
          setHrEvalData(null);
        }

        if (tlRes && tlRes.ok) {
          const tlJson = await tlRes.json();
          setTlEvalData(tlJson.evaluation);
        } else {
          setTlEvalData(null);
        }
      } catch (err) {
        console.error("Failed to fetch my monthly evaluations:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchEvaluations();
  }, [selectedMonth]);

  const getBadgeStyle = (badge) => {
    switch (badge) {
      case "Exceptional":
        return "bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/20";
      case "High Performer":
        return "bg-indigo-50 text-indigo-700 border-indigo-200 ring-indigo-500/20";
      case "On Track":
        return "bg-sky-50 text-sky-700 border-sky-200 ring-sky-500/20";
      default:
        return "bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/20";
    }
  };

  const activeData = activeView === "tl" ? tlEvalData : hrEvalData;

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 space-y-5 shadow-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center font-bold">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">My Monthly Performance Scorecard</h3>
            <p className="text-xs text-slate-500">Dual Appraisal: Team Lead Project &amp; Technical Review + HR Attendance Review</p>
          </div>
        </div>

        {/* Month Selector */}
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50 focus:outline-none focus:border-sky-500 cursor-pointer"
        >
          {monthOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Switcher Tabs: Team Lead vs HR */}
      <div className="flex items-center gap-2 p-1 bg-slate-100/80 rounded-2xl border border-slate-200/60 max-w-md">
        <button
          type="button"
          onClick={() => setActiveView("tl")}
          className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeView === "tl"
              ? "bg-white text-sky-700 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <span>Team Lead Evaluation</span>
          {tlEvalData && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
        </button>
        <button
          type="button"
          onClick={() => setActiveView("hr")}
          className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeView === "hr"
              ? "bg-white text-indigo-700 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <span>HR Monthly Evaluation</span>
          {hrEvalData && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
          <svg className="animate-spin w-5 h-5 text-sky-600" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <span>Loading your monthly scorecard...</span>
        </div>
      ) : !activeData ? (
        <div className="py-10 px-4 text-center rounded-2xl bg-slate-50/70 border border-slate-200/60 space-y-2">
          <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center mx-auto text-sm font-bold">
            ⏳
          </div>
          <h4 className="text-xs font-bold text-slate-800">
            {activeView === "tl" ? "Team Lead Appraisal Pending" : "HR Review Pending"} for {selectedMonth}
          </h4>
          <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
            {activeView === "tl"
              ? "Your Team Lead monthly evaluation on task completion, learning skills, innovation, and collaboration will appear once published."
              : "Your monthly performance evaluation by HR based on attendance, hours, and leaves will appear once published."}
          </p>
        </div>
      ) : activeView === "tl" ? (
        /* ─── TEAM LEAD EVALUATION VIEW ─── */
        <div className="space-y-5">
          {/* Main Score Banner */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md">
            <div className="flex items-center gap-4 text-center sm:text-left">
              <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 flex flex-col items-center justify-center shadow-inner">
                <span className="text-2xl font-black text-white">{activeData.final_score}</span>
                <span className="text-[9px] font-bold text-sky-200">/ 100</span>
              </div>
              <div>
                <div className="flex items-center justify-center sm:justify-start gap-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${getBadgeStyle(activeData.performance_badge)}`}>
                    {activeData.performance_badge}
                  </span>
                  <span className="text-xs text-sky-200">
                    Auto Task: {activeData.auto_task_score}/40 · Skills: {activeData.manual_skills_score}/60
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  Evaluated on {new Date(activeData.updated_at || activeData.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div className="text-right text-xs text-sky-200 hidden sm:block">
              <div>Task Deadlines (40%)</div>
              <div>Learning, Innovation, Collab (60%)</div>
            </div>
          </div>

          {/* 4 Pillars Breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Pillar 1: Task Deadline */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">1. Tasks</span>
                <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {activeData.auto_task_score} / 40
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                {activeData.completed_tasks}/{activeData.total_tasks} done ({activeData.on_time_tasks} on-time)
              </div>
            </div>

            {/* Pillar 2: Learning */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">2. Learning</span>
                <span className="font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                  {activeData.learning_score} / 20
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                Rating: ⭐ {activeData.learning_rating}/10
              </div>
            </div>

            {/* Pillar 3: Innovation */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">3. Innovation</span>
                <span className="font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                  {activeData.innovation_score} / 20
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                Rating: ⭐ {activeData.innovation_rating}/10
              </div>
            </div>

            {/* Pillar 4: Collaboration */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">4. Teamwork</span>
                <span className="font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                  {activeData.collaboration_score} / 20
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                Rating: ⭐ {activeData.collaboration_rating}/10
              </div>
            </div>
          </div>

          {/* Team Lead Written Feedback Box */}
          <div className="p-4 rounded-2xl bg-sky-50/60 border border-sky-100 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-sky-950">
              <span>💬 Team Lead Feedback &amp; Remarks</span>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed italic bg-white/80 p-3 rounded-xl border border-sky-100/60">
              "{activeData.tl_feedback}"
            </p>
          </div>
        </div>
      ) : (
        /* ─── HR EVALUATION VIEW ─── */
        <div className="space-y-5">
          {/* Main Score Banner */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-950 text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md">
            <div className="flex items-center gap-4 text-center sm:text-left">
              <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 flex flex-col items-center justify-center shadow-inner">
                <span className="text-2xl font-black text-white">{activeData.final_score}</span>
                <span className="text-[9px] font-bold text-indigo-200">/ 100</span>
              </div>
              <div>
                <div className="flex items-center justify-center sm:justify-start gap-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${getBadgeStyle(activeData.performance_badge)}`}>
                    {activeData.performance_badge}
                  </span>
                  <span className="text-xs text-indigo-200">⭐ {activeData.hr_rating}/10 HR Rating</span>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  Evaluated on {new Date(activeData.updated_at || activeData.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div className="text-right text-xs text-indigo-200 hidden sm:block">
              <div>3 Factual Pillars (Attendance &amp; Hours)</div>
              <div>HR Qualitative Review</div>
            </div>
          </div>

          {/* 3 Pillars Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Pillar 1: Attendance */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">1. Attendance</span>
                <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {activeData.attendance_score} / 40
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                {activeData.present_days} / {activeData.total_working_days} days present
              </div>
            </div>

            {/* Pillar 2: Working Hours */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">2. Working Hours</span>
                <span className="font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                  {activeData.hours_score} / 40
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                {activeData.actual_working_hours} / {activeData.expected_monthly_hours} hrs ({activeData.completion_rate}%)
              </div>
            </div>

            {/* Pillar 3: Leave Discipline */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">3. Leave Discipline</span>
                <span className="font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                  {activeData.leave_score} / 20
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                {activeData.approved_leave_days}d leave / {activeData.absent_days}d absent
              </div>
            </div>
          </div>

          {/* HR Written Feedback Box */}
          <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-950">
              <span>💬 HR Feedback &amp; Remarks</span>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed italic bg-white/80 p-3 rounded-xl border border-indigo-100/60">
              "{activeData.hr_feedback}"
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
