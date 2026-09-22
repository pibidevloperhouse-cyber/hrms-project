/**
 * lib/performanceUtils.js
 * Core calculation engine for HRMS Employee Performance Evaluation Workflow
 *
 * Implements strict separation of three pillars (Zero Double-Counting):
 * 1. Task Progress (25%): Story points completed / Story points assigned * 100
 * 2. Task Delay / Punctuality (35%): Deliveries completed_at vs effective_due_date (approved extensions have 0 penalty)
 * 3. Task Execution (40%): Human qualitative evaluation (1.0 - 10.0) entered manually by Team Lead based on factual evidence
 */

/**
 * Calculates factual sprint task metrics and execution evidence.
 *
 * @param {Array} tasks - List of project_tasks for the target employee in the sprint
 * @returns {Object} Factual performance metrics & execution evidence
 */
export function calculateSprintTaskMetrics(tasks = []) {
  if (!tasks || tasks.length === 0) {
    return {
      assignedPoints: 0,
      completedPoints: 0,
      progressPercentage: 0,
      totalTasks: 0,
      completedTasks: 0,
      acceptedTasks: 0,
      incompleteTasks: 0,
      onTimeTasks: 0,
      delayedTasks: 0,
      overdueTasks: 0,
      totalDelayDays: 0,
      reworkRequestsCount: 0,
      punctualityScore: 100,
      reviewHistoryList: [],
      tasksList: [],
    };
  }

  const now = new Date();
  let assignedPoints = 0;
  let completedPoints = 0;
  let completedTasks = 0;
  let acceptedTasks = 0;
  let incompleteTasks = 0;
  let onTimeTasks = 0;
  let delayedTasks = 0;
  let overdueTasks = 0;
  let totalDelayDays = 0;
  let reworkRequestsCount = 0;
  const reviewHistoryList = [];

  const tasksList = tasks.map((task) => {
    // 1. Story Points
    const points = Number(task.story_points) || 1;
    assignedPoints += points;

    const isCompleted = task.status === "COMPLETED";
    if (isCompleted) {
      completedPoints += points;
      completedTasks += 1;
      acceptedTasks += 1;
    } else {
      incompleteTasks += 1;
    }

    // 2. Rework / Revisions Check & Review History
    const reviewFeedback =
      task.review_feedback ||
      (typeof task.comments === "string" && task.comments.includes("[Team Lead Suggestions]:")
        ? task.comments.replace(/\[Team Lead Suggestions\]:/g, "").trim()
        : typeof task.comments === "string" && task.comments.includes("[Team Lead Revision Feedback]:")
        ? task.comments.replace(/\[Team Lead Revision Feedback\]:/g, "").trim()
        : null);

    const hasRework = Boolean(reviewFeedback);
    if (hasRework) {
      reworkRequestsCount += 1;
      reviewHistoryList.push({
        taskId: task.id,
        taskTitle: task.title,
        type: "REWORK_REQUEST",
        feedback: reviewFeedback,
        date: task.review_feedback_at || task.updated_at || null,
      });
    }

    if (isCompleted && task.completed_at) {
      reviewHistoryList.push({
        taskId: task.id,
        taskTitle: task.title,
        type: "ACCEPTED",
        feedback: task.review_comments || "Accepted & Marked Completed by Team Lead",
        date: task.completed_at,
      });
    }

    // 3. Deadline & Delay calculation against effective_due_date
    // Approved extensions update effective_due_date so employee is not penalized based on original deadline
    const targetDueDate = task.effective_due_date || task.original_due_date || task.due_date;
    let taskDelayDays = 0;
    let taskStatusTiming = "on_time";

    if (targetDueDate) {
      const dueDate = new Date(targetDueDate);
      dueDate.setHours(23, 59, 59, 999);

      if (isCompleted) {
        // Final task delivery performance uses completed_at (when Team Lead accepted it)
        const compDate = task.completed_at ? new Date(task.completed_at) : (task.updated_at ? new Date(task.updated_at) : now);
        if (compDate > dueDate) {
          const diffMs = compDate.getTime() - dueDate.getTime();
          taskDelayDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
          delayedTasks += 1;
          totalDelayDays += taskDelayDays;
          taskStatusTiming = "delayed_completed";
        } else {
          onTimeTasks += 1;
          taskStatusTiming = "completed_on_time";
        }
      } else {
        // For incomplete tasks: only mark overdue if current date has passed effective_due_date
        if (now > dueDate) {
          const diffMs = now.getTime() - dueDate.getTime();
          taskDelayDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
          overdueTasks += 1;
          totalDelayDays += taskDelayDays;
          taskStatusTiming = "overdue_incomplete";
        } else {
          taskStatusTiming = "on_track_incomplete";
        }
      }
    } else {
      if (isCompleted) {
        onTimeTasks += 1;
        taskStatusTiming = "completed_on_time";
      }
    }

    return {
      id: task.id,
      title: task.title,
      status: task.status,
      story_points: points,
      progress: task.progress || 0,
      effective_due_date: targetDueDate,
      started_at: task.started_at,
      submitted_at: task.submitted_at,
      completed_at: task.completed_at,
      delayDays: taskDelayDays,
      timingStatus: taskStatusTiming,
      hasRework,
      reviewFeedback,
    };
  });

  // PILLAR 1: Sprint Progress % based strictly on Story Points
  // (completed story points / total assigned story points) * 100
  const progressPercentage = assignedPoints > 0
    ? Number(((completedPoints / assignedPoints) * 100).toFixed(2))
    : (completedTasks > 0 ? 100 : 0);

  // PILLAR 2: Deterministic Punctuality Score (0 - 100)
  // On-time delivery ratio minus capped delay duration deduction
  const totalCount = tasks.length;
  const onTimeCount = totalCount - delayedTasks - overdueTasks;
  const onTimeRatio = totalCount > 0 ? (onTimeCount / totalCount) * 100 : 100;
  const delayDeduction = Math.min(40, totalDelayDays * 2);
  const punctualityScore = Math.max(0, Math.min(100, Math.round(onTimeRatio - delayDeduction)));

  return {
    assignedPoints,
    completedPoints,
    progressPercentage,
    totalTasks: totalCount,
    completedTasks,
    acceptedTasks,
    incompleteTasks,
    onTimeTasks,
    delayedTasks,
    overdueTasks,
    totalDelayDays,
    reworkRequestsCount,
    punctualityScore,
    reviewHistoryList,
    tasksList,
  };
}

/**
 * Calculates the Final Performance Score (0 - 100) and Badge after Team Lead enters Execution Score.
 * Formula: Final Score = (Execution * 0.40) + (Punctuality * 0.35) + (Progress * 0.25)
 *
 * @param {number|null} executionScore10 - Qualitative score entered manually by Team Lead (1.0 to 10.0)
 * @param {number} punctualityScore - System calculated punctuality score (0 to 100)
 * @param {number} progressPercentage - Story points sprint progress (0 to 100)
 * @returns {Object} { finalScore, performanceBadge, executionScore, isEvaluated }
 */
export function calculateFinalPerformanceScore(executionScore10 = null, punctualityScore = 100, progressPercentage = 100) {
  if (executionScore10 === null || executionScore10 === undefined || isNaN(Number(executionScore10))) {
    return {
      finalScore: null,
      performanceBadge: "Pending Evaluation",
      executionScore: null,
      punctualityScore: Math.max(0, Math.min(100, Number(punctualityScore) || 0)),
      progressPercentage: Math.max(0, Math.min(100, Number(progressPercentage) || 0)),
      isEvaluated: false,
    };
  }

  const cleanExec = Math.max(1, Math.min(10, Number(executionScore10)));
  const exec100 = cleanExec * 10; // Normalize 1.0 - 10.0 scale to 10 - 100

  const cleanPunct = Math.max(0, Math.min(100, Number(punctualityScore) || 0));
  const cleanProg = Math.max(0, Math.min(100, Number(progressPercentage) || 0));

  const weightedFinal = (exec100 * 0.40) + (cleanPunct * 0.35) + (cleanProg * 0.25);
  const finalScore = Number(weightedFinal.toFixed(2));

  let performanceBadge = "Needs Attention";
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
    executionScore: cleanExec,
    punctualityScore: cleanPunct,
    progressPercentage: cleanProg,
    isEvaluated: true,
  };
}

/**
 * Month-End Rollup: Aggregates finalized sprint evaluation snapshots for a calendar month.
 *
 * @param {Array} evaluations - List of finalized performance_evaluations
 * @returns {Object} Monthly rollup summary
 */
export function calculateMonthlyRollup(evaluations = []) {
  if (!evaluations || evaluations.length === 0) {
    return {
      evaluatedSprintsCount: 0,
      avgFinalScore: 0,
      avgExecutionScore: 0,
      avgProgress: 0,
      avgPunctuality: 0,
      totalAssignedPoints: 0,
      totalCompletedPoints: 0,
      totalTasks: 0,
      totalCompletedTasks: 0,
      totalDelayedTasks: 0,
      totalOverdueTasks: 0,
      performanceBadge: "No Evaluations",
      evaluations: [],
    };
  }

  let totalFinalScore = 0;
  let totalExecScore = 0;
  let totalProg = 0;
  let totalPunct = 0;
  let totalAssignedPoints = 0;
  let totalCompletedPoints = 0;
  let totalTasks = 0;
  let totalCompletedTasks = 0;
  let totalDelayedTasks = 0;
  let totalOverdueTasks = 0;

  evaluations.forEach((ev) => {
    totalFinalScore += Number(ev.final_score || 0);
    totalExecScore += Number(ev.execution_score || 0);
    totalProg += Number(ev.progress_percentage || 0);
    totalPunct += Number(ev.punctuality_score || 100);
    totalAssignedPoints += Number(ev.assigned_points || 0);
    totalCompletedPoints += Number(ev.completed_points || 0);
    totalTasks += Number(ev.total_tasks || 0);
    totalCompletedTasks += Number(ev.completed_tasks || 0);
    totalDelayedTasks += Number(ev.delayed_tasks || 0);
    totalOverdueTasks += Number(ev.overdue_tasks || 0);
  });

  const count = evaluations.length;
  const avgFinalScore = Number((totalFinalScore / count).toFixed(1));
  const avgExecutionScore = Number((totalExecScore / count).toFixed(1));
  const avgProgress = Number((totalProg / count).toFixed(1));
  const avgPunctuality = Number((totalPunct / count).toFixed(1));

  let performanceBadge = "Needs Attention";
  if (avgFinalScore >= 90) performanceBadge = "Exceptional";
  else if (avgFinalScore >= 75) performanceBadge = "High Performer";
  else if (avgFinalScore >= 60) performanceBadge = "On Track";

  return {
    evaluatedSprintsCount: count,
    avgFinalScore,
    avgExecutionScore,
    avgProgress,
    avgPunctuality,
    totalAssignedPoints,
    totalCompletedPoints,
    totalTasks,
    totalCompletedTasks,
    totalDelayedTasks,
    totalOverdueTasks,
    performanceBadge,
    evaluations,
  };
}
