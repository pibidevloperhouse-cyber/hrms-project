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
export default function TLMonthlyEvaluationModal({ isOpen, onClose, onSaved }) {
  const [mounted, setMounted] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [loading, setLoading] = useState(true);
  const [summaryData, setSummaryData] = useState(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");

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
        const res = await authFetch(`/api/performance/monthly-tl/summary?month=${monthStr}`);
        if (res.ok) {
          const json = await res.json();
          setSummaryData(json);

          const list = json.employees || [];
          if (list.length > 0) {
            const targetId = preserveEmpId || selectedEmployeeId;
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
    [selectedEmployeeId]
  );

  useEffect(() => {
    if (isOpen) {
      fetchMonthlySummary(selectedMonth);
    }
  }, [isOpen, selectedMonth]);

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

  const handleSelectEmployeeById = (empId) => {
    setSelectedEmployeeId(empId);
    const list = summaryData?.employees || [];
    const found = list.find((e) => e.employee?.id === empId);
    applyEmployeeData(found);
  };

  const employees = summaryData?.employees || [];
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
        className="relative w-full max-w-2xl bg-white rounded-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col m-auto my-auto animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header format */}
        <div className="px-6 pt-5 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-3 text-base">
            <span className="font-bold text-slate-900">Evaluate:</span>
            <span className="text-blue-600 font-semibold border-b-2 border-blue-600 pb-0.5 text-sm">
              Monthly Evaluation
            </span>
            <span className="text-xs text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              {evaluatedCount}/{employees.length} Reviewed
            </span>
          </div>

          {/* Red square close button */}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="w-6 h-6 border border-rose-300 hover:border-rose-400 text-rose-400 hover:text-rose-600 rounded flex items-center justify-center text-xs transition cursor-pointer disabled:opacity-50"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Form Body layout */}
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4 max-h-[82vh] overflow-y-auto">
          {formError && (
            <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {formError}
            </div>
          )}
          {formSuccess && (
            <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
              {formSuccess}
            </div>
          )}

          {/* Row: Month Selection */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
            <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
              <span className="border-b-2 border-rose-500 pb-0.5">Evaluation Month</span>
            </label>
            <div className="flex-1">
              <select
                value={selectedMonth}
                onChange={(e) => handleMonthChange(e.target.value)}
                className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-1 text-sm bg-transparent text-slate-900 transition-colors cursor-pointer"
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
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2">
            <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
              <span className="border-b-2 border-rose-500 pb-0.5">Select Employee</span>
            </label>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <select
                  required
                  value={selectedEmployeeId}
                  onChange={(e) => handleSelectEmployeeById(e.target.value)}
                  className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-1 text-sm bg-transparent text-slate-900 transition-colors cursor-pointer"
                >
                  <option value="">
                    {loading ? "Loading team..." : `-- Choose Team Member (${employees.length} available) --`}
                  </option>
                  {employees.map((item) => {
                    const emp = item.employee || {};
                    const isEval = item.isEvaluated;
                    return (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name} ({emp.designation || "Staff"} · {emp.department || "Engineering"}){" "}
                        {isEval ? `[⭐ ${item.evaluation?.finalScore}/100]` : "[Pending]"}
                      </option>
                    );
                  })}
                </select>

                {/* Quick Prev / Next Buttons */}
                <button
                  type="button"
                  disabled={currentIndex <= 0 || isSubmitting}
                  onClick={handlePrevEmployee}
                  className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-medium transition cursor-pointer disabled:opacity-40 shrink-0"
                  title="Previous Employee"
                >
                  ◀
                </button>
                <button
                  type="button"
                  disabled={currentIndex < 0 || currentIndex >= employees.length - 1 || isSubmitting}
                  onClick={handleNextEmployee}
                  className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-medium transition cursor-pointer disabled:opacity-40 shrink-0"
                  title="Next Employee"
                >
                  ▶
                </button>
              </div>
            </div>
          </div>

          {/* If No Employee Selected */}
          {!activeEmpItem && !loading && (
            <div className="py-8 text-center text-xs text-slate-400">
              Please select a team member from the dropdown to review their monthly task execution calculations.
            </div>
          )}

          {/* Active Employee Details & Calculation */}
          {activeEmpItem && (
            <>
              {/* Section Divider: Task Execution Analysis */}
              <div className="text-blue-600 font-semibold border-b border-blue-500 pb-1 text-sm pt-3">
                Task &amp; Deadline Execution Analysis (40 pts)
              </div>

              {/* Performance Analysis Fields (Disabled / Readonly Popup Form Style) */}
              <div className="space-y-3 pt-1">
                {/* Row 1: Task Completion */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                  <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                    <span className="border-b-2 border-blue-600 pb-0.5">Task Completion</span>
                  </label>
                  <div className="flex-1 flex items-center justify-between border-b border-slate-300 pb-1 text-sm bg-slate-50/80 px-2.5 py-1.5 rounded cursor-not-allowed">
                    <span className="text-xs text-slate-700 font-medium">
                      {activeMetrics.completed_tasks || 0} / {activeMetrics.total_tasks || 0} Tasks Completed ({activeScores.completionRate || 100}% delivery rate)
                    </span>
                    <span className="text-xs font-bold text-blue-700 font-mono">
                      {(Number(activeScores.taskCompletionScore) || 0).toFixed(1)} / 25 pts
                    </span>
                  </div>
                </div>

                {/* Row 2: Deadline Punctuality */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                  <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                    <span className="border-b-2 border-blue-600 pb-0.5">Deadline Punctuality</span>
                  </label>
                  <div className="flex-1 flex items-center justify-between border-b border-slate-300 pb-1 text-sm bg-slate-50/80 px-2.5 py-1.5 rounded cursor-not-allowed">
                    <span className="text-xs text-slate-700 font-medium">
                      {activeMetrics.on_time_tasks || 0} On-Time {Number(activeMetrics.delayed_tasks) > 0 ? `(⚠️ ${activeMetrics.delayed_tasks} delayed · ${activeMetrics.total_delay_days}d total delay)` : "(✓ 100% on-schedule)"}
                    </span>
                    <span className="text-xs font-bold text-blue-700 font-mono">
                      {(Number(activeScores.deadlinePunctualityScore) || 0).toFixed(1)} / 15 pts
                    </span>
                  </div>
                </div>
              </div>

              {/* Section Divider: Team Lead Qualitative & Skills Review */}
              <div className="text-blue-600 font-semibold border-b border-blue-500 pb-1 text-sm pt-3">
                Team Lead Qualitative &amp; Skills Review (60 pts)
              </div>

              {/* Notice when already evaluated */}
              {activeEmpItem?.isEvaluated && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between animate-fadeIn">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-emerald-600 text-sm">✓</span>
                    <span>
                      <strong>Finalized:</strong> Manager evaluation for <strong>{activeEmp.full_name || "this employee"}</strong> has already been submitted for this month ({activeEmpItem?.evaluation?.finalScore} pts). Evaluations can only be submitted once per month.
                    </span>
                  </div>
                </div>
              )}

              {/* Row 1: Learning Skills (1 - 10) */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                  <span className="border-b-2 border-blue-600 pb-0.5">Learning Skills</span>
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
                    className="flex-1 h-1.5 bg-slate-200 rounded appearance-none cursor-pointer accent-blue-600 disabled:opacity-50"
                  />
                  <span className="w-24 text-center font-bold text-xs bg-blue-50 text-blue-700 py-1 px-2 rounded border border-blue-200 shrink-0 font-mono">
                    ⭐ {Number(learningRating).toFixed(1)} ({livePreview.learningScore} / 20)
                  </span>
                </div>
              </div>

              {/* Row 2: Innovation (1 - 10) */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                  <span className="border-b-2 border-blue-600 pb-0.5">Innovation</span>
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
                    className="flex-1 h-1.5 bg-slate-200 rounded appearance-none cursor-pointer accent-blue-600 disabled:opacity-50"
                  />
                  <span className="w-24 text-center font-bold text-xs bg-blue-50 text-blue-700 py-1 px-2 rounded border border-blue-200 shrink-0 font-mono">
                    ⭐ {Number(innovationRating).toFixed(1)} ({livePreview.innovationScore} / 20)
                  </span>
                </div>
              </div>

              {/* Row 3: Team Collaboration (1 - 10) */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                  <span className="border-b-2 border-blue-600 pb-0.5">Team Collaboration</span>
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
                    className="flex-1 h-1.5 bg-slate-200 rounded appearance-none cursor-pointer accent-blue-600 disabled:opacity-50"
                  />
                  <span className="w-24 text-center font-bold text-xs bg-blue-50 text-blue-700 py-1 px-2 rounded border border-blue-200 shrink-0 font-mono">
                    ⭐ {Number(collaborationRating).toFixed(1)} ({livePreview.collaborationScore} / 20)
                  </span>
                </div>
              </div>

              {/* Row 4: Feedback Remarks */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-2">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0 pt-1">
                  <span className="border-b-2 border-rose-500 pb-0.5">Feedback Remarks</span>
                </label>
                <div className="flex-1">
                  <textarea
                    rows={3}
                    required
                    disabled={isSubmitting || activeEmpItem?.isEvaluated}
                    placeholder="Enter qualitative feedback remarks on technical output, problem solving, innovation & collaboration..."
                    value={tlFeedback}
                    onChange={(e) => setTlFeedback(e.target.value)}
                    className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-1 text-sm bg-transparent text-slate-900 resize-none transition-colors placeholder:text-slate-400 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Live Preview Score Banner */}
              <div className="p-3 rounded bg-blue-50/80 border border-blue-200 flex items-center justify-between text-xs animate-fadeIn">
                <div>
                  <span className="text-slate-600 font-medium">Monthly Performance Score:</span>
                  <span className="ml-2 font-black text-blue-700 font-mono text-sm">
                    {(Number(livePreview.finalScore) || 0).toFixed(1)} / 100
                  </span>
                  <span className="ml-2 text-[10px] text-slate-500">
                    (Auto {activeScores.autoTaskScore || 40} + Skills {livePreview.manualSkillsScore})
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-medium">Badge:</span>
                  <span className="px-2.5 py-0.5 rounded font-bold text-white bg-blue-600 text-[11px] shadow-2xs">
                    {livePreview.performanceBadge}
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Bottom Action Buttons */}
          <div className="pt-6 pb-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={isSubmitting || !selectedEmployeeId || !tlFeedback.trim() || activeEmpItem?.isEvaluated}
              className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
            >
              {activeEmpItem?.isEvaluated ? "✓ Already Evaluated" : isSubmitting ? "Saving…" : "Save Evaluation"}
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-sm transition cursor-pointer disabled:opacity-50"
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
