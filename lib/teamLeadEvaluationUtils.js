/**
 * lib/teamLeadEvaluationUtils.js
 * Core Calculation Engine for Team Lead Monthly Employee Performance Evaluation
 *
 * Performance Architecture (100 pts total):
 * 1. Automatic Task Completion & Deadline Punctuality (Max 40 pts automated):
 *    - Task Completion Score (25 pts): (completed_tasks / max(1, total_tasks)) * 25 pts
 *    - Deadline Punctuality Score (15 pts): (on_time_tasks / max(1, completed_tasks)) * 15 pts - delay/rework penalty
 * 2. Learning & Technical Skills (Max 20 pts manual, 1.0 to 10.0 scale):
 *    - Score = (learningRating / 10.0) * 20 pts
 * 3. Innovation & Problem Solving (Max 20 pts manual, 1.0 to 10.0 scale):
 *    - Score = (innovationRating / 10.0) * 20 pts
 * 4. Team Collaboration & Communication (Max 20 pts manual, 1.0 to 10.0 scale):
 *    - Score = (collaborationRating / 10.0) * 20 pts
 *
 * Total TL Monthly Score = Task Score (40 pts) + Learning (20 pts) + Innovation (20 pts) + Collaboration (20 pts) = 100 pts
 */

/**
 * Calculates the automated factual task & deadline scores out of 40 pts
 * @param {Object} metrics - Factual task counts for the month
 * @returns {Object} { completionRate, taskCompletionScore, deadlinePunctualityScore, autoTaskScore }
 */
export function calculateTaskDeadlineScores(metrics = {}) {
  const totalTasks = Number(metrics.total_tasks) || 0;
  const completedTasks = Number(metrics.completed_tasks) || 0;
  const onTimeTasks = Number(metrics.on_time_tasks) || 0;
  const delayedTasks = Number(metrics.delayed_tasks) || 0;
  const totalDelayDays = Number(metrics.total_delay_days) || 0;
  const reworkCount = Number(metrics.rework_requests_count || metrics.rework_count) || 0;

  // 1. Task Completion (25 pts max)
  let completionScore = 25.0;
  let completionRate = 100.0;
  if (totalTasks > 0) {
    const ratio = Math.min(1.0, completedTasks / totalTasks);
    completionScore = Math.round(ratio * 25.0 * 10) / 10;
    completionRate = Math.round(ratio * 100.0 * 10) / 10;
  } else {
    // If no tasks assigned in this month, baseline neutral full score
    completionScore = 25.0;
    completionRate = 100.0;
  }

  // 2. Deadline Punctuality (15 pts max)
  let punctualityScore = 15.0;
  if (completedTasks > 0) {
    const onTimeRatio = Math.min(1.0, onTimeTasks / completedTasks);
    const basePunctuality = onTimeRatio * 15.0;
    const delayPenalty = Math.min(5.0, totalDelayDays * 0.5);
    const reworkPenalty = Math.min(3.0, reworkCount * 1.0);
    punctualityScore = Math.max(0.0, Math.round((basePunctuality - delayPenalty - reworkPenalty) * 10) / 10);
  } else if (totalTasks > 0 && delayedTasks > 0) {
    const delayPenalty = Math.min(10.0, totalDelayDays * 0.5);
    punctualityScore = Math.max(0.0, Math.round((15.0 - delayPenalty) * 10) / 10);
  }

  const autoTaskScore = Math.min(40.0, Math.max(0.0, Math.round((completionScore + punctualityScore) * 10) / 10));

  return {
    completionRate,
    taskCompletionScore: completionScore,
    deadlinePunctualityScore: punctualityScore,
    autoTaskScore,
  };
}

/**
 * Computes the Final Evaluation Score (0 - 100 pts), individual pillar breakdowns, and Performance Badge
 * @param {number} autoTaskScore - Automated task score (0 - 40)
 * @param {number} learningRating - TL rating (1.0 to 10.0)
 * @param {number} innovationRating - TL rating (1.0 to 10.0)
 * @param {number} collaborationRating - TL rating (1.0 to 10.0)
 * @returns {Object} Calculated ratings, scores, final score, and badge
 */
export function computeFinalTLEvaluation(
  autoTaskScore = 40.0,
  learningRating = 8.0,
  innovationRating = 8.0,
  collaborationRating = 8.0
) {
  const safeLearning = Math.max(1.0, Math.min(10.0, Number(learningRating) || 8.0));
  const safeInnovation = Math.max(1.0, Math.min(10.0, Number(innovationRating) || 8.0));
  const safeCollaboration = Math.max(1.0, Math.min(10.0, Number(collaborationRating) || 8.0));

  // Scale 1-10 to 20 pts each
  const learningScore = Math.round((safeLearning / 10.0) * 20.0 * 10) / 10;
  const innovationScore = Math.round((safeInnovation / 10.0) * 20.0 * 10) / 10;
  const collaborationScore = Math.round((safeCollaboration / 10.0) * 20.0 * 10) / 10;

  const manualSkillsScore = Math.round((learningScore + innovationScore + collaborationScore) * 10) / 10;
  const finalScore = Math.min(100.0, Math.max(0.0, Math.round((Number(autoTaskScore) + manualSkillsScore) * 10) / 10));

  let performanceBadge = "Needs Attention";
  if (finalScore >= 90) {
    performanceBadge = "Exceptional";
  } else if (finalScore >= 75) {
    performanceBadge = "High Performer";
  } else if (finalScore >= 60) {
    performanceBadge = "On Track";
  }

  return {
    learningRating: safeLearning,
    innovationRating: safeInnovation,
    collaborationRating: safeCollaboration,
    learningScore,
    innovationScore,
    collaborationScore,
    manualSkillsScore,
    finalScore,
    performanceBadge,
  };
}
