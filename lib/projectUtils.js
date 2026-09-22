/**
 * Project and Sprint timeline validation utilities.
 */

function formatDateLocal(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Checks whether a task's due date exceeds a sprint's end date.
 * @param {string|Date} dueDateStr - Task due date string (YYYY-MM-DD or ISO)
 * @param {object} sprint - Sprint object containing { id, name, start_date, end_date }
 * @returns {object|null} Returns null if valid, or warning object if overdue
 */
export function checkTaskSprintOverdue(dueDateStr, sprint) {
  if (!dueDateStr || !sprint || !sprint.end_date) return null;

  try {
    const rawDue = typeof dueDateStr === "string" ? dueDateStr.split("T")[0] : dueDateStr;
    const rawEnd = typeof sprint.end_date === "string" ? sprint.end_date.split("T")[0] : sprint.end_date;

    const [dueY, dueM, dueD] = rawDue.split("-").map(Number);
    const [endY, endM, endD] = rawEnd.split("-").map(Number);

    if (!dueY || !dueM || !dueD || !endY || !endM || !endD) return null;

    const taskDue = new Date(dueY, dueM - 1, dueD);
    const sprintEnd = new Date(endY, endM - 1, endD);

    if (isNaN(taskDue.getTime()) || isNaN(sprintEnd.getTime())) return null;

    const diffMs = taskDue.getTime() - sprintEnd.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays > 0) {
      const diffWeeks = Math.ceil(diffDays / 7);
      return {
        isOverdue: true,
        diffDays,
        diffWeeks,
        taskDueDate: rawDue,
        sprintEndDate: rawEnd,
        sprintName: sprint.name || "Sprint",
        message: `Task due date (${rawDue}) exceeds Sprint "${sprint.name || "Sprint"}" end date (${rawEnd}) by ${diffDays} day${diffDays > 1 ? "s" : ""} (~${diffWeeks} week${diffWeeks > 1 ? "s" : ""}).`,
        shortMessage: `Exceeds sprint by ${diffDays} day${diffDays > 1 ? "s" : ""}`,
      };
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Helper to calculate sprint end date from start date and duration in weeks.
 * @param {string} startDateStr - YYYY-MM-DD
 * @param {number} weeks - Number of weeks (e.g. 1, 2, 3, 4)
 * @returns {string} YYYY-MM-DD
 */
export function calculateSprintEndDate(startDateStr, weeks) {
  if (!startDateStr || !weeks || weeks <= 0) return "";
  const rawStart = startDateStr.split("T")[0];
  const [startY, startM, startD] = rawStart.split("-").map(Number);
  if (!startY || !startM || !startD) return "";

  const d = new Date(startY, startM - 1, startD);
  if (isNaN(d.getTime())) return "";

  d.setDate(d.getDate() + Number(weeks) * 7);
  return formatDateLocal(d);
}

/**
 * Formats duration between start and end date in days and weeks.
 * @param {string} startDateStr 
 * @param {string} endDateStr 
 * @returns {string} e.g. "2 Weeks (14 days)"
 */
export function formatSprintDuration(startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) return "";
  const [sY, sM, sD] = startDateStr.split("T")[0].split("-").map(Number);
  const [eY, eM, eD] = endDateStr.split("T")[0].split("-").map(Number);
  if (!sY || !sM || !sD || !eY || !eM || !eD) return "";

  const start = new Date(sY, sM - 1, sD);
  const end = new Date(eY, eM - 1, eD);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return "";

  const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Same day";

  const weeks = Math.round((diffDays / 7) * 10) / 10;
  if (diffDays % 7 === 0) {
    const w = diffDays / 7;
    return `${w} ${w === 1 ? "Week" : "Weeks"} (${diffDays} days)`;
  }
  return `${diffDays} days (~${weeks} weeks)`;
}

/**
 * Validates whether a due date falls strictly within a sprint's timeline window.
 * @param {string|Date} dueDateStr - Task due date (YYYY-MM-DD or ISO)
 * @param {object} sprint - Sprint object containing { id, name, start_date, end_date }
 * @returns {{ isValid: boolean, minDate: string, maxDate: string, error: string | null }}
 */
export function validateTaskSprintBounds(dueDateStr, sprint) {
  if (!sprint || (!sprint.start_date && !sprint.end_date)) {
    return { isValid: true, minDate: "", maxDate: "", error: null };
  }

  const minDate = sprint.start_date
    ? (typeof sprint.start_date === "string" ? sprint.start_date.split("T")[0] : formatDateLocal(new Date(sprint.start_date)))
    : "";
  const maxDate = sprint.end_date
    ? (typeof sprint.end_date === "string" ? sprint.end_date.split("T")[0] : formatDateLocal(new Date(sprint.end_date)))
    : "";

  if (!dueDateStr) {
    return { isValid: true, minDate, maxDate, error: null };
  }

  const rawDue = typeof dueDateStr === "string" ? dueDateStr.split("T")[0] : formatDateLocal(new Date(dueDateStr));

  if (minDate && rawDue < minDate) {
    return {
      isValid: false,
      minDate,
      maxDate,
      error: `Due date (${rawDue}) cannot be earlier than sprint start date (${minDate}).`,
    };
  }

  if (maxDate && rawDue > maxDate) {
    return {
      isValid: false,
      minDate,
      maxDate,
      error: `Due date (${rawDue}) exceeds sprint end date (${maxDate}). Task must be scheduled within the sprint timeline.`,
    };
  }

  return { isValid: true, minDate, maxDate, error: null };
}

/**
 * Computes an employee's workload and capacity within a given sprint or overall project.
 * @param {string} employeeId - ID of employee
 * @param {string|null} sprintId - ID of target sprint (optional)
 * @param {Array} tasks - Array of project tasks
 * @returns {{ count: number, completedCount: number, inProgressCount: number, points: number }}
 */
export function getEmployeeSprintWorkload(employeeId, sprintId, tasks = []) {
  if (!employeeId || !Array.isArray(tasks) || tasks.length === 0) {
    return { count: 0, completedCount: 0, inProgressCount: 0, points: 0 };
  }

  const employeeTasks = tasks.filter((t) => {
    const isAssigned =
      t.assigned_to === employeeId ||
      t.assignee?.id === employeeId ||
      t.assignee_id === employeeId ||
      t.planned_assignee_id === employeeId ||
      t.planned_assignee?.id === employeeId;
    if (!isAssigned) return false;
    if (sprintId) {
      return t.sprint_id === sprintId;
    }
    return true;
  });

  const count = employeeTasks.length;
  const completedCount = employeeTasks.filter((t) => t.status === "COMPLETED").length;
  const inProgressCount = employeeTasks.filter((t) => t.status === "IN_PROGRESS").length;
  const points = employeeTasks.reduce((sum, t) => sum + (Number(t.story_points) || 1), 0);

  return { count, completedCount, inProgressCount, points };
}
