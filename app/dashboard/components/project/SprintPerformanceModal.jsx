"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { calculateFinalPerformanceScore } from "@/lib/performanceUtils";

export default function SprintPerformanceModal({
  isOpen,
  onClose,
  sprint,
  project,
  teamMembers = [],
  currentUserId,
  isTeamLeadOrManager = false,
  onEvaluationSaved,
  initialEmployeeId = null,
}) {
  const [mounted, setMounted] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState(initialEmployeeId || "");
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [metricsData, setMetricsData] = useState(null);
  const [executionScore, setExecutionScore] = useState("");
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Resolve strictly the members included in this project
  const projectMembersList = useMemo(() => {
    const map = new Map();
    const allGiven = Array.isArray(teamMembers) ? teamMembers : [];

    // 1. Team Lead
    if (project?.teamLead?.id) {
      map.set(project.teamLead.id, project.teamLead);
    } else if (project?.team_lead_id) {
      const lead = allGiven.find((e) => e.id === project.team_lead_id);
      if (lead) map.set(lead.id, lead);
    }

    // 2. Creator / Owner
    if (project?.creator?.id) {
      map.set(project.creator.id, project.creator);
    } else if (project?.created_by || project?.owner_id) {
      const ownerId = project.owner_id || project.created_by;
      const owner = allGiven.find((e) => e.id === ownerId);
      if (owner) map.set(owner.id, owner);
    }

    // 3. Explicit project.teamMembers or project.team_members
    if (Array.isArray(project?.teamMembers)) {
      project.teamMembers.forEach((m) => {
        if (m?.id) map.set(m.id, m);
      });
    }
    if (Array.isArray(project?.team_members)) {
      project.team_members.forEach((m) => {
        const cleanId = typeof m === "object" ? m?.id : m;
        if (cleanId && !map.has(cleanId)) {
          const emp = typeof m === "object" ? m : allGiven.find((e) => e.id === cleanId);
          if (emp) map.set(cleanId, emp);
        }
      });
    }

    if (map.size > 0) {
      return Array.from(map.values()).sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
    }

    return allGiven;
  }, [teamMembers, project]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Set default selected employee when modal opens
  useEffect(() => {
    if (isOpen) {
      setErrorMessage("");
      setSuccessMessage("");
      if (initialEmployeeId && projectMembersList.some((m) => m.id === initialEmployeeId)) {
        setSelectedEmpId(initialEmployeeId);
      } else if (projectMembersList.length > 0) {
        if (!selectedEmpId || !projectMembersList.some((m) => m.id === selectedEmpId)) {
          setSelectedEmpId(projectMembersList[0].id);
        }
      }
    }
  }, [isOpen, initialEmployeeId, projectMembersList, selectedEmpId]);

  // Fetch factual sprint performance facts for selected employee
  const fetchPerformanceData = async (empId) => {
    if (!sprint?.id || !empId) return;
    setLoadingMetrics(true);
    setErrorMessage("");
    try {
      const res = await fetch(
        `/api/projects/performance?sprint_id=${sprint.id}&employee_id=${empId}&project_id=${project?.id || sprint.project_id || ""}`
      );
      const data = await res.json();
      if (res.ok) {
        setMetricsData(data);
        if (data.evaluation) {
          setExecutionScore(String(data.evaluation.execution_score || ""));
          setComment(data.evaluation.comment || "");
        } else {
          setExecutionScore("");
          setComment("");
        }
      } else {
        setErrorMessage(data.message || "Failed to load sprint metrics.");
      }
    } catch (err) {
      console.error("Fetch sprint metrics error:", err);
      setErrorMessage("Network error fetching sprint metrics.");
    } finally {
      setLoadingMetrics(false);
    }
  };

  useEffect(() => {
    if (isOpen && sprint?.id && selectedEmpId) {
      fetchPerformanceData(selectedEmpId);
    }
  }, [isOpen, sprint?.id, selectedEmpId]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  // Live calculation preview calculated purely after Team Lead enters the Execution Score
  const liveScorePreview = useMemo(() => {
    if (!metricsData?.factualMetrics) return null;
    const { punctualityScore, progressPercentage } = metricsData.factualMetrics;
    const parsedExec = executionScore !== "" && !isNaN(Number(executionScore)) ? Number(executionScore) : null;
    return calculateFinalPerformanceScore(parsedExec, punctualityScore, progressPercentage);
  }, [metricsData?.factualMetrics, executionScore]);

  // Submit Team Lead Evaluation
  const handleSubmitEvaluation = async (e) => {
    if (e) e.preventDefault();
    if (!isTeamLeadOrManager) return;

    if (executionScore === "" || isNaN(Number(executionScore)) || Number(executionScore) < 1 || Number(executionScore) > 10) {
      setErrorMessage("Please enter an Execution Score between 1.0 and 10.0 based on system evidence.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const res = await fetch("/api/projects/performance/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: selectedEmpId,
          sprint_id: sprint.id,
          project_id: project?.id || sprint.project_id,
          execution_score: Number(executionScore),
          comment: comment.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSuccessMessage("Sprint performance snapshot saved successfully!");
        if (selectedEmpId) {
          await fetchPerformanceData(selectedEmpId);
        }
        if (onEvaluationSaved) onEvaluationSaved(data.evaluation);
      } else {
        setErrorMessage(data.message || "Failed to save evaluation.");
      }
    } catch (err) {
      console.error("Submit evaluation error:", err);
      setErrorMessage("Network error submitting evaluation.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !mounted) return null;

  const factual = metricsData?.factualMetrics || {
    assignedPoints: 0,
    completedPoints: 0,
    progressPercentage: 0,
    totalTasks: 0,
    completedTasks: 0,
    acceptedTasks: 0,
    incompleteTasks: 0,
    onTimeTasks: 0,
    delayedTasks: 0,
    totalDelayDays: 0,
    reworkRequestsCount: 0,
    punctualityScore: 100,
    reviewHistoryList: [],
    tasksList: [],
  };

  const existingEval = metricsData?.evaluation;

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto animate-fadeIn"
    >
      <div className="relative w-full max-w-xl bg-white rounded-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col m-auto my-auto animate-scaleIn">
        {/* Top Header matching exact Create Sprint popup design */}
        <div className="px-6 pt-5 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-3 text-base">
            <span className="font-bold text-slate-900">Evaluate:</span>
            <div className="flex items-center gap-2">
              <span className="text-blue-600 font-semibold border-b-2 border-blue-600 pb-0.5 text-sm">
                Member Performance
              </span>
              <span className="px-2 py-0.2 rounded text-[10px] font-mono bg-blue-50 text-blue-700 border border-blue-200">
                {sprint?.name || "Sprint"}
              </span>
            </div>
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

        {/* Form Body */}
        <form onSubmit={handleSubmitEvaluation} className="px-6 py-4 space-y-3.5 max-h-[80vh] overflow-y-auto">
          {errorMessage && (
            <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {errorMessage}
            </div>
          )}
          {successMessage && (
            <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
              {successMessage}
            </div>
          )}

          {/* Row: Team Member with red underline indicator */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
            <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
              <span className="border-b-2 border-rose-500 pb-0.5">
                Team Member
              </span>
            </label>
            <div className="flex-1 flex items-center gap-2">
              <select
                value={selectedEmpId}
                onChange={(e) => setSelectedEmpId(e.target.value)}
                disabled={isSubmitting}
                className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-1 text-sm bg-transparent text-slate-900 transition-colors cursor-pointer"
              >
                {projectMembersList.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name} ({m.designation || m.role || "Member"})
                  </option>
                ))}
              </select>
              {existingEval ? (
                <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  ✓ Finalized ({existingEval.final_score}/100)
                </span>
              ) : (
                <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  Pending
                </span>
              )}
            </div>
          </div>

          {loadingMetrics ? (
            <div className="py-6 flex items-center justify-center gap-2 text-xs text-slate-500">
              <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span>Loading factual sprint metrics…</span>
            </div>
          ) : (
            <>
              {/* Section Divider: Factual Sprint Data */}
              <div className="text-blue-600 font-semibold border-b border-blue-500 pb-1 text-sm pt-2 flex items-center justify-between">
                <span>Factual Sprint Data</span>
                <span className="text-[11px] font-normal text-slate-400">System Records</span>
              </div>

              {/* Row 1: Task Progress (Story Points) - Pillar 1 */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-0.5">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                  Task Progress
                </label>
                <div className="flex-1 flex items-center justify-between border-b border-slate-300 pb-1 text-sm">
                  <span className="text-slate-800">
                    {factual.completedPoints} of {factual.assignedPoints} Story Points (Weight: 25%)
                  </span>
                  <span className="font-bold font-mono text-blue-600">
                    {factual.progressPercentage}%
                  </span>
                </div>
              </div>

              {/* Row 2: Task Punctuality & Delay - Pillar 2 */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-0.5">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                  Task Punctuality
                </label>
                <div className="flex-1 flex items-center justify-between border-b border-slate-300 pb-1 text-sm">
                  <span className="text-slate-800">
                    {factual.onTimeTasks} on-time ({factual.delayedTasks} delayed, {factual.totalDelayDays}d total delay) (Weight: 35%)
                  </span>
                  <span className="font-bold font-mono text-purple-600">
                    {factual.punctualityScore}/100
                  </span>
                </div>
              </div>

              {/* Row 3: Task Execution Evidence (Requirement 2 & 4: Renamed & displays full evidence) */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-0.5">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                  Task Execution Evidence
                </label>
                <div className="flex-1 flex items-center justify-between border-b border-slate-300 pb-1 text-sm">
                  <span className="text-slate-800">
                    {factual.completedTasks} completed ({factual.acceptedTasks} accepted, {factual.incompleteTasks} incomplete)
                  </span>
                  <span className="text-xs text-slate-500 font-mono">
                    {factual.reworkRequestsCount} rework requests
                  </span>
                </div>
              </div>

              {/* Review History Summary if rework/acceptance occurred */}
              {Array.isArray(factual.reviewHistoryList) && factual.reviewHistoryList.length > 0 && (
                <div className="p-2 rounded bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
                  <span className="font-semibold text-slate-700 block">Review History Evidence:</span>
                  <div className="max-h-20 overflow-y-auto space-y-0.5 divide-y divide-slate-100">
                    {factual.reviewHistoryList.map((h, idx) => (
                      <div key={idx} className="pt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate">{h.taskTitle}: <span className="italic">{h.feedback}</span></span>
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                          h.type === "ACCEPTED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                        }`}>
                          {h.type === "ACCEPTED" ? "Accepted" : "Rework"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Section Divider: Team Lead Evaluation - Pillar 3 */}
              <div className="text-blue-600 font-semibold border-b border-blue-500 pb-1 text-sm pt-2 flex items-center justify-between">
                <span>Team Lead Evaluation</span>
                <span className="text-[11px] font-normal text-slate-400">Weight: 40% (Manual Input)</span>
              </div>

              {/* Row: Execution Quality Score with Red underline indicator (Manual Entry 1.0 - 10.0) */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-0.5">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                  <span className="border-b-2 border-rose-500 pb-0.5">
                    Execution Score
                  </span>
                </label>
                <div className="flex-1 flex items-center gap-3 border-b border-slate-300 pb-1">
                  <input
                    type="number"
                    min="1"
                    max="10"
                    step="0.5"
                    placeholder="1 - 10"
                    disabled={!isTeamLeadOrManager || isSubmitting}
                    value={executionScore}
                    onChange={(e) => setExecutionScore(e.target.value)}
                    className="w-16 focus:border-blue-600 outline-none pb-0.5 text-sm font-bold text-center text-blue-600 bg-transparent placeholder:text-slate-300"
                  />
                  <span className="text-xs text-slate-500 font-medium">/ 10</span>
                  {isTeamLeadOrManager && (
                    <input
                      type="range"
                      min="1"
                      max="10"
                      step="0.5"
                      value={executionScore !== "" ? Number(executionScore) : 8.0}
                      onChange={(e) => setExecutionScore(e.target.value)}
                      className="flex-1 accent-blue-600 cursor-pointer"
                    />
                  )}
                  <span className="text-[11px] text-slate-400 shrink-0">
                    (Team Lead manual rating)
                  </span>
                </div>
              </div>

              {/* Row: Appraisal Notes */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-0.5">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0 pt-1">
                  Appraisal Notes
                </label>
                <div className="flex-1">
                  <textarea
                    rows={2}
                    disabled={!isTeamLeadOrManager || isSubmitting}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Enter qualitative feedback on code quality, technical execution, and collaboration..."
                    className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-1 text-sm bg-transparent text-slate-900 resize-none transition-colors placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Final Score Calculated by System after Team Lead enters score */}
              {liveScorePreview?.isEvaluated ? (
                <div className="text-xs text-blue-700 py-1.5 px-3 rounded bg-blue-50/70 border border-blue-200/80 flex items-center justify-between font-medium">
                  <div className="flex items-center gap-1.5">
                    <span>📊</span>
                    <span>System-Calculated Final Score: <strong>{liveScorePreview.finalScore} / 100</strong> (Exec 40% + Punct 35% + Prog 25%)</span>
                  </div>
                  <span className={`px-2 py-0.2 rounded text-[10px] font-bold ${
                    liveScorePreview.performanceBadge === "Exceptional"
                      ? "bg-purple-100 text-purple-800 border border-purple-200"
                      : liveScorePreview.performanceBadge === "High Performer"
                      ? "bg-blue-100 text-blue-800 border border-blue-200"
                      : liveScorePreview.performanceBadge === "On Track"
                      ? "bg-amber-100 text-amber-800 border border-amber-200"
                      : "bg-rose-100 text-rose-800 border border-rose-200"
                  }`}>
                    {liveScorePreview.performanceBadge}
                  </span>
                </div>
              ) : (
                <div className="text-[11px] text-slate-500 py-1.5 px-3 rounded bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <span>Enter an Execution Score (1.0 - 10.0) above to calculate final score.</span>
                  <span className="font-mono text-slate-400">Formula: Exec 40% + Punct 35% + Prog 25%</span>
                </div>
              )}
            </>
          )}

          {/* Bottom Action Buttons */}
          <div className="pt-4 pb-2 flex items-center gap-3">
            {isTeamLeadOrManager && (
              <button
                type="submit"
                disabled={isSubmitting || executionScore === ""}
                className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition cursor-pointer disabled:opacity-50 shadow-xs"
              >
                {isSubmitting ? "Saving…" : existingEval ? "Update Evaluation Snapshot" : "Save Evaluation Snapshot"}
              </button>
            )}
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
    </div>,
    document.body
  );
}
