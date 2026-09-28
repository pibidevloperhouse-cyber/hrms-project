/**
 * lib/monthlyEvaluationUtils.js
 * Core Calculation Engine for HR Monthly Employee Performance Evaluation
 *
 * Performance Analysis Metrics:
 * 1. Daily Attendance & Punctuality (Max 40 pts)
 * 2. Working Hours Compliance (Max 40 pts)
 * 3. Leave & Absence Discipline (Max 20 pts)
 *
 * Total Score = Attendance Score + Working Hours Score + Leave Score = 100 pts
 */

/**
 * Calculates the factual performance score out of 100
 * @param {Object} metrics
 * @returns {Object} { attendanceScore, hoursScore, leaveScore, autoBaseScore }
 */
export function calculate3PillarScores(metrics = {}) {
  const totalWorkingDays = Math.max(1, Number(metrics.total_working_days) || 22);
  const approvedLeaveDays = Number(metrics.approved_leave_days) || 0;
  const requiredWorkDays = Math.max(1, Number(metrics.required_working_days || metrics.required_work_days) || Math.max(1, totalWorkingDays - approvedLeaveDays));
  
  const presentDays = Number(metrics.present_days) || 0;
  const absentDays = Number(metrics.absent_days) || 0;
  const timeDelayHours = Number(metrics.time_delay_hours) || 0;

  const actualWorkingHours = Number(metrics.actual_working_hours) || 0;
  const requiredMonthlyHours = Math.max(1, Number(metrics.required_monthly_hours || metrics.expected_monthly_hours) || (requiredWorkDays * 8.0));

  // 1. Daily Attendance & Punctuality (40 pts)
  const attendedRatio = Math.min(1, presentDays / requiredWorkDays);
  const rawAttendanceScore = attendedRatio * 40;
  const delayPenalty = Math.min(5, timeDelayHours * 0.5);
  const attendanceScore = Math.max(0, Math.round((rawAttendanceScore - delayPenalty) * 10) / 10);

  // 2. Working Hours Compliance (40 pts)
  const hoursRatio = Math.min(1, actualWorkingHours / requiredMonthlyHours);
  const hoursScore = Math.max(0, Math.round(hoursRatio * 40 * 10) / 10);

  // 3. Leave & Absence Discipline (20 pts)
  const unapprovedAbsentPenalty = absentDays * 5;
  const leaveScore = Math.max(0, Math.round((20 - unapprovedAbsentPenalty) * 10) / 10);

  // Total Performance Score (0 - 100)
  const autoBaseScore = Math.min(100, Math.max(0, Math.round((attendanceScore + hoursScore + leaveScore) * 10) / 10));

  return {
    attendanceScore,
    hoursScore,
    leaveScore,
    autoBaseScore,
  };
}

/**
 * Computes the Final Evaluation Score (0 - 100) and Performance Badge
 * Final score is directly equal to the factual performance score.
 * @param {number} autoBaseScore - Performance score (0 - 100)
 * @param {number} hrRating - HR rating (1.0 to 10.0)
 * @returns {Object} { finalScore, performanceBadge, hrRating }
 */
export function computeFinalMonthlyEvaluation(autoBaseScore = 100, hrRating = 8.0) {
  const safeHrRating = Math.max(1.0, Math.min(10.0, Number(hrRating) || 8.0));
  const finalScore = Math.min(100, Math.max(0, Math.round(Number(autoBaseScore) * 10) / 10));

  let performanceBadge = "Needs Improvement";
  if (finalScore >= 90) {
    performanceBadge = "Exceptional";
  } else if (finalScore >= 75) {
    performanceBadge = "High Performer";
  } else if (finalScore >= 60) {
    performanceBadge = "On Track";
  }

  return {
    finalScore,
    performanceBadge,
    hrRating: safeHrRating,
  };
}


