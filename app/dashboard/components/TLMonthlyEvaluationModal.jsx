"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { authFetch } from "@/lib/api/authFetch";
import { computeFinalTLEvaluation } from "@/lib/teamLeadEvaluationUtils";

/**
 * TLMonthlyEvaluationModal Component
 * Implements the exact same clean design, layout, theme, and process as HRMonthlyEvaluationModal:
 * - Clean white card with red square close button (✕)
 * - Header: Evaluate: Team Lead Monthly Performance
 * - Clean underline label fields (border-b-2 border-rose-500 / border-slate-300)
 * - Blue section dividers
 * - Automatic Task & Deadline Calculation (Task Completion /25, Deadline Punctuality /15 = 40 pts)
 * - Manual Qualitative Skills (Learning /20, Innovation /20, Collaboration /20 = 60 pts)
 * - Feedback Remarks Textarea
 * - Blue Save Evaluation and Cancel action buttons
 */
export default function TLMonthlyEvaluationModal({ isOpen, onClose, onSaved, initialEmployeeId = null, projectEmployees = [] }) {
  const [mounted, setMounted] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [loading, setLoading] = useState(true);
  const [summaryData, setSummaryData] = useState(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(initialEmployeeId || "");

  // Team Lead Manual Qualitative Ratings (1.0 to 10.0 scale)
  const [learningRating, setLearningRating] = useState(8.0);
  const [innovationRating, setInnovationRating] = useState(8.0);
  const [collaborationRating, setCollaborationRating] = useState(8.0);
  const [tlFeedback, setTlFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync initialEmployeeId when changed or modal opened
  useEffect(() => {
    if (initialEmployeeId) {
      setSelectedEmployeeId(initialEmployeeId);
    }
  }, [initialEmployeeId]);

  // Lock body scroll on modal open
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && !isSubmitting) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose, isSubmitting]);

  // Last 12 months options
  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const val = `${y}-${m}`;
      const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      options.push({ value: val, label });
    }
    return options;
  }, []);

  // Fetch employees and their monthly task calculations
  const fetchMonthlySummary = useCallback(
    async (monthStr, preserveEmpId = null) => {
      setLoading(true);
      setFormError("");
      setFormSuccess("");
      try {
        const targetEmpId = preserveEmpId || selectedEmployeeId || initialEmployeeId;
        const url = targetEmpId 
          ? `/api/performance/monthly-tl/summary?month=${monthStr}&employee_id=${targetEmpId}`
          : `/api/performance/monthly-tl/summary?month=${monthStr}`;
        const res = await authFetch(url);
        if (res.ok) {
          const json = await res.json();
          setSummaryData(json);

          const list = json.employees || [];
          if (list.length > 0) {
            const targetId = targetEmpId || list[0].employee?.id;
            const found = list.find((e) => e.employee?.id === targetId) || list[0];
            setSelectedEmployeeId(found.employee?.id || "");
            applyEmployeeData(found);
          } else {
            setSelectedEmployeeId("");
          }
        } else {
          const err = await res.json().catch(() => ({}));
          setFormError(err.message || "Failed to load employee list.");
        }
      } catch (err) {
        console.error("Failed to fetch monthly TL evaluations:", err);
        setFormError("Network error loading monthly evaluations.");
      } finally {
        setLoading(false);
      }
    },
    [selectedEmployeeId, initialEmployeeId]
  );

  useEffect(() => {
    if (isOpen) {
      const targetEmp = initialEmployeeId || selectedEmployeeId;
      fetchMonthlySummary(selectedMonth, targetEmp);
    }
  }, [isOpen, selectedMonth, initialEmployeeId]);

  const handleMonthChange = (newMonth) => {
    setSelectedMonth(newMonth);
    fetchMonthlySummary(newMonth, selectedEmployeeId);
  };

  const applyEmployeeData = (empItem) => {
    if (!empItem) return;
    setFormError("");
    setFormSuccess("");
    if (empItem.isEvaluated && empItem.evaluation) {
      setLearningRating(Number(empItem.evaluation.learningRating) || 8.0);
      setInnovationRating(Number(empItem.evaluation.innovationRating) || 8.0);
      setCollaborationRating(Number(empItem.evaluation.collaborationRating) || 8.0);
      setTlFeedback(empItem.evaluation.tlFeedback || "");
    } else {
      setLearningRating(8.0);
      setInnovationRating(8.0);
      setCollaborationRating(8.0);
      setTlFeedback("");
    }
  };

  const rawEmployees = summaryData?.employees || [];
  const employees = useMemo(() => {
    return rawEmployees.filter((item) => {
      const r = (item.employee?.role || "employee").toLowerCase().trim();
      return r === "employee";
    });
  }, [rawEmployees]);

  const handleSelectEmployeeById = (empId) => {
    setSelectedEmployeeId(empId);
    const found = employees.find((e) => e.employee?.id === empId);
    applyEmployeeData(found);
  };

  const activeEmpItem = employees.find((e) => e.employee?.id === selectedEmployeeId) || null;
  const activeEmp = activeEmpItem?.employee || {};
  const activeMetrics = activeEmpItem?.metrics || {};
  const activeScores = activeEmpItem?.scores || {};

  const livePreview = computeFinalTLEvaluation(
    activeScores.autoTaskScore || 40.0,
    learningRating,
    innovationRating,
    collaborationRating
  );

  const evaluatedCount = employees.filter((e) => e.isEvaluated).length;
  const currentIndex = employees.findIndex((e) => e.employee?.id === selectedEmployeeId);

  const handlePrevEmployee = () => {
    if (currentIndex > 0) {
      const prevEmp = employees[currentIndex - 1];
      handleSelectEmployeeById(prevEmp.employee?.id);
    }
  };

  const handleNextEmployee = () => {
    if (currentIndex >= 0 && currentIndex < employees.length - 1) {
      const nextEmp = employees[currentIndex + 1];
      handleSelectEmployeeById(nextEmp.employee?.id);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    if (!selectedEmployeeId || !activeEmp.id) {
      setFormError("Please select an employee to evaluate.");
      return;
    }

    if (activeEmpItem?.isEvaluated) {
      setFormError("Team Lead / Manager evaluation for this employee has already been submitted for this month and cannot be modified.");
      return;
    }

    if (!tlFeedback.trim()) {
      setFormError("Feedback Remarks are required.");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        employeeId: activeEmp.id,
        evaluationMonth: selectedMonth,
        learningRating: Number(learningRating),
        innovationRating: Number(innovationRating),
        collaborationRating: Number(collaborationRating),
        tlFeedback: tlFeedback.trim(),
        strengths: "",
        areasForImprovement: "",
        metrics: activeMetrics,
      };

      const res = await authFetch("/api/performance/monthly-tl/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.message || "Failed to save monthly evaluation.");
      } else {
        const empName = activeEmp.full_name || "Employee";
        setFormSuccess(`Evaluation saved successfully for ${empName}!`);
        if (onSaved) {
          onSaved(empName, selectedMonth);
        } else if (onClose) {
          onClose();
        }
      }
    } catch (err) {
      console.error("Save TL evaluation error:", err);
      setFormError("Network error. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto animate-fadeIn"
    >
      <div
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col m-auto my-auto animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-1.5 font-sans">
            <span className="font-bold text-slate-900 text-sm sm:text-base">Evaluate:</span>
            <span className="text-[#1f6fb2] font-bold text-sm sm:text-base">
              Manager Monthly Evaluation
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

        {/* Form Body layout */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {formError && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {formError}
            </div>
          )}
          {formSuccess && (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
              {formSuccess}
            </div>
          )}

          {/* Section 1: Selection */}
          <div className="space-y-3">
            <span className="text-[11px] font-bold text-[#1f6fb2] uppercase tracking-wider block">
              Evaluation Target
            </span>

            {/* Row: Month Selection */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="sm:w-36 text-xs font-semibold text-slate-700 shrink-0">
                Evaluation Month
              </label>
              <div className="flex-1">
                <select
                  value={selectedMonth}
                  onChange={(e) => handleMonthChange(e.target.value)}
                  className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition cursor-pointer"
                >
                  {monthOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row: Employee Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="sm:w-36 text-xs font-semibold text-slate-700 shrink-0">
                Select Employee
              </label>
              <div className="flex-1">
                <select
                  required
                  value={selectedEmployeeId}
                  onChange={(e) => handleSelectEmployeeById(e.target.value)}
                  className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition cursor-pointer"
                >
                  <option value="">
                    {loading ? "Loading staff..." : "-- Select Employee --"}
                  </option>
                  {employees.map((item) => {
                    const emp = item.employee || {};
                    const isEval = item.isEvaluated;
                    return (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name} ({emp.designation || "Staff"} · {emp.department || "General"}) {isEval ? `[${item.evaluation?.finalScore}/100]` : "[Pending]"}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </div>

          {/* Small separation divider */}
          <div className="border-t border-slate-100" />

          {/* If No Employee Selected */}
          {!activeEmpItem && !loading && (
            <div className="py-8 text-center text-xs text-slate-400">
              Please select a team member from the dropdown to review their monthly task execution calculations.
            </div>
          )}

          {/* Active Employee Details & Calculation */}
          {activeEmpItem && (
            <>
              {/* Section 2: Task Execution Analysis */}
              <div className="space-y-3">
                <span className="text-[11px] font-bold text-[#1f6fb2] uppercase tracking-wider block">
                  Task &amp; Deadline Execution Analysis (40 pts)
                </span>

                {/* Row 1: Task Completion */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="sm:w-36 text-xs font-semibold text-slate-700 shrink-0">
                    Task Completion
                  </label>
                  <div className="flex-1 flex items-center justify-between border border-slate-200 text-xs bg-slate-50/80 px-3.5 py-2 rounded-xl shadow-2xs cursor-not-allowed">
                    <span className="text-slate-700 font-medium">
                      {activeMetrics.completed_tasks || 0} / {activeMetrics.total_tasks || 0} Tasks Completed ({activeScores.completionRate || 100}% delivery rate)
                    </span>
                    <span className="font-bold text-[#1f6fb2] font-mono">
                      {(Number(activeScores.taskCompletionScore) || 0).toFixed(1)} / 25 pts
                    </span>
                  </div>
                </div>

                {/* Row 2: Deadline Punctuality */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="sm:w-36 text-xs font-semibold text-slate-700 shrink-0">
                    Deadline Punctuality
                  </label>
                  <div className="flex-1 flex items-center justify-between border border-slate-200 text-xs bg-slate-50/80 px-3.5 py-2 rounded-xl shadow-2xs cursor-not-allowed">
                    <span className="text-slate-700 font-medium">
                      {activeMetrics.on_time_tasks || 0} On-Time {Number(activeMetrics.delayed_tasks) > 0 ? `(⚠️ ${activeMetrics.delayed_tasks} delayed · ${activeMetrics.total_delay_days}d total delay)` : "(✓ 100% on-schedule)"}
                    </span>
                    <span className="font-bold text-[#1f6fb2] font-mono">
                      {(Number(activeScores.deadlinePunctualityScore) || 0).toFixed(1)} / 15 pts
                    </span>
                  </div>
                </div>
              </div>

              {/* Small separation divider */}
              <div className="border-t border-slate-100" />

              {/* Section 3: Manager Qualitative & Skills Review */}
              <div className="space-y-3">
                <span className="text-[11px] font-bold text-[#1f6fb2] uppercase tracking-wider block">
                  Manager Qualitative &amp; Skills Review (60 pts)
                </span>

                {/* Notice when already evaluated */}
                {activeEmpItem?.isEvaluated && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between animate-fadeIn">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-emerald-600 text-sm">✓</span>
                      <span>
                        <strong>Finalized:</strong> Manager evaluation for <strong>{activeEmp.full_name || "this employee"}</strong> has already been submitted for this month ({activeEmpItem?.evaluation?.finalScore} pts). Evaluations can only be submitted once per month.
                      </span>
                    </div>
                  </div>
                )}

                {/* Row 1: Learning Skills (1 - 10) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="sm:w-36 text-xs font-semibold text-slate-700 shrink-0">
                    Learning Skills
                  </label>
                  <div className="flex-1 flex items-center gap-3">
                    <input
                      type="range"
                      min="1.0"
                      max="10.0"
                      step="0.5"
                      value={learningRating}
                      disabled={isSubmitting || activeEmpItem?.isEvaluated}
                      onChange={(e) => setLearningRating(parseFloat(e.target.value))}
                      className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1f6fb2] disabled:opacity-50"
                    />
                    <span className="w-24 text-center font-bold text-xs bg-sky-50 text-[#1f6fb2] py-1.5 px-2.5 rounded-xl border border-sky-200/80 shrink-0 font-mono">
                      {Number(learningRating).toFixed(1)} ({livePreview.learningScore} / 20)
                    </span>
                  </div>
                </div>

                {/* Row 2: Innovation (1 - 10) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="sm:w-36 text-xs font-semibold text-slate-700 shrink-0">
                    Innovation
                  </label>
                  <div className="flex-1 flex items-center gap-3">
                    <input
                      type="range"
                      min="1.0"
                      max="10.0"
                      step="0.5"
                      value={innovationRating}
                      disabled={isSubmitting || activeEmpItem?.isEvaluated}
                      onChange={(e) => setInnovationRating(parseFloat(e.target.value))}
                      className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1f6fb2] disabled:opacity-50"
                    />
                    <span className="w-24 text-center font-bold text-xs bg-sky-50 text-[#1f6fb2] py-1.5 px-2.5 rounded-xl border border-sky-200/80 shrink-0 font-mono">
                      {Number(innovationRating).toFixed(1)} ({livePreview.innovationScore} / 20)
                    </span>
                  </div>
                </div>

                {/* Row 3: Team Collaboration (1 - 10) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="sm:w-36 text-xs font-semibold text-slate-700 shrink-0">
                    Team Collaboration
                  </label>
                  <div className="flex-1 flex items-center gap-3">
                    <input
                      type="range"
                      min="1.0"
                      max="10.0"
                      step="0.5"
                      value={collaborationRating}
                      disabled={isSubmitting || activeEmpItem?.isEvaluated}
                      onChange={(e) => setCollaborationRating(parseFloat(e.target.value))}
                      className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1f6fb2] disabled:opacity-50"
                    />
                    <span className="w-24 text-center font-bold text-xs bg-sky-50 text-[#1f6fb2] py-1.5 px-2.5 rounded-xl border border-sky-200/80 shrink-0 font-mono">
                      {Number(collaborationRating).toFixed(1)} ({livePreview.collaborationScore} / 20)
                    </span>
                  </div>
                </div>

                {/* Row 4: Feedback Remarks */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <label className="sm:w-36 text-xs font-semibold text-slate-700 shrink-0 pt-1">
                    Feedback Remarks
                  </label>
                  <div className="flex-1">
                    <textarea
                      rows={3}
                      required
                      disabled={isSubmitting || activeEmpItem?.isEvaluated}
                      placeholder="Enter qualitative feedback remarks on technical output, problem solving, innovation & collaboration..."
                      value={tlFeedback}
                      onChange={(e) => setTlFeedback(e.target.value)}
                      className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 resize-none transition placeholder:text-slate-400 outline-none shadow-2xs disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Live Preview Score Banner */}
                <div className="p-3.5 rounded-xl bg-sky-50/60 border border-sky-200/80 flex items-center justify-between text-xs animate-fadeIn">
                  <div>
                    <span className="text-slate-600 font-medium">Monthly Performance Score:</span>
                    <span className="ml-2 font-black text-[#1f6fb2] font-mono text-sm">
                      {(Number(livePreview.finalScore) || 0).toFixed(1)} / 100
                    </span>
                    <span className="ml-2 text-[10px] text-slate-500">
                      (Auto {activeScores.autoTaskScore || 40} + Skills {livePreview.manualSkillsScore})
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 font-medium">Badge:</span>
                    <span className="px-3 py-1 rounded-lg font-bold text-white bg-brand-gradient text-[11px] shadow-xs shadow-[#1f6fb2]/20">
                      {livePreview.performanceBadge}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Bottom Action Buttons */}
          <div className="pt-4 border-t border-slate-100 flex items-center gap-3">
            <button
              type="submit"
              disabled={isSubmitting || !selectedEmployeeId || !tlFeedback.trim() || activeEmpItem?.isEvaluated}
              className="px-4 py-2 rounded-xl bg-brand-gradient hover:opacity-95 text-white font-semibold text-xs transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs shadow-[#1f6fb2]/20"
            >
              {activeEmpItem?.isEvaluated ? "✓ Already Evaluated" : isSubmitting ? "Saving…" : "Save Evaluation"}
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

  return mounted && typeof document !== "undefined" ? createPortal(modalContent, document.body) : null;
}
