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
 * For ACTIVE sprints, past/finished dates are disallowed - only current active days (today to sprint end) are valid.
 * For PLANNED sprints, dates between start_date and end_date are valid.
 * @param {string|Date} dueDateStr - Task due date (YYYY-MM-DD or ISO)
 * @param {object} sprint - Sprint object containing { id, name, status, start_date, end_date }
 * @returns {{ isValid: boolean, minDate: string, maxDate: string, isSprintActive: boolean, error: string | null }}
 */
export function validateTaskSprintBounds(dueDateStr, sprint) {
  if (!sprint || (!sprint.start_date && !sprint.end_date)) {
    return { isValid: true, minDate: "", maxDate: "", isSprintActive: false, error: null };
  }

  const isSprintActive = String(sprint.status || "").toUpperCase() === "ACTIVE";
  const isSprintCompleted = ["COMPLETED", "CLOSED"].includes(String(sprint.status || "").toUpperCase());

  const now = new Date();
  const todayStr = formatDateLocal(now);

  const sprintStart = sprint.start_date
    ? (typeof sprint.start_date === "string" ? sprint.start_date.split("T")[0] : formatDateLocal(new Date(sprint.start_date)))
    : "";
  const sprintEnd = sprint.end_date
    ? (typeof sprint.end_date === "string" ? sprint.end_date.split("T")[0] : formatDateLocal(new Date(sprint.end_date)))
    : "";

  // For active sprints, past days are finished days. Allow only current active days (today to sprint end).
  const minDate = isSprintActive
    ? (sprintStart && sprintStart > todayStr ? sprintStart : todayStr)
    : sprintStart;
  const maxDate = sprintEnd;

  if (isSprintCompleted) {
    return {
      isValid: false,
      minDate: "",
      maxDate: "",
      isSprintActive: false,
      error: `Sprint "${sprint.name || "Sprint"}" is already completed/closed. Tasks cannot be scheduled or modified in finished sprints.`,
    };
  }

  if (!dueDateStr) {
    return { isValid: true, minDate, maxDate, isSprintActive, error: null };
  }

  const rawDue = typeof dueDateStr === "string" ? dueDateStr.split("T")[0] : formatDateLocal(new Date(dueDateStr));

  // If the sprint is active and the selected date is before today, reject it as a finished date
  if (isSprintActive && rawDue < todayStr) {
    return {
      isValid: false,
      minDate,
      maxDate,
      isSprintActive,
      error: `Invalid Due Date (${rawDue}): Cannot set task due date to a past/finished date. For active sprint "${sprint.name || "Active Sprint"}", tasks must be scheduled within current active remaining days (${minDate} to ${maxDate || "sprint end"}).`,
    };
  }

  if (minDate && rawDue < minDate) {
    return {
      isValid: false,
      minDate,
      maxDate,
      isSprintActive,
      error: `Invalid Due Date (${rawDue}): Due date cannot be earlier than Sprint "${sprint.name || "Sprint"}" start date (${minDate}).`,
    };
  }

  if (maxDate && rawDue > maxDate) {
    return {
      isValid: false,
      minDate,
      maxDate,
      isSprintActive,
      error: `Invalid Due Date (${rawDue}): Due date exceeds Sprint "${sprint.name || "Sprint"}" end date (${maxDate}). Task must be scheduled within the sprint timeline.`,
    };
  }

  return { isValid: true, minDate, maxDate, isSprintActive, error: null };
}

/**
 * Returns min and max date bounds for a sprint.
 * @param {object} sprint 
 * @returns {{ minDate: string, maxDate: string, isSprintActive: boolean }}
 */
export function getSprintDateBounds(sprint) {
  const bounds = validateTaskSprintBounds(null, sprint);
  return { minDate: bounds.minDate, maxDate: bounds.maxDate, isSprintActive: bounds.isSprintActive };
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

export const TASK_STATUS_TRANSITIONS = {
  EMPLOYEE: {
    TODO: ["IN_PROGRESS"],
    IN_PROGRESS: ["TODO", "REVIEW"], // Assigned developer works on task and submits deliverable for Review
    REVIEW: [], // Locked for employee while waiting for Team Lead review
    COMPLETED: [], // Locked for employee once finalized/approved
  },
  TEAM_LEAD: {
    TODO: [], // Developer task: Supervisor cannot arbitrarily drag/shift
    IN_PROGRESS: [], // In-progress tasks must be submitted by the assigned employee with deliverables
    REVIEW: ["COMPLETED", "TODO"], // Review deliverable: Accept to COMPLETED or Give Suggestions and move to TODO
    COMPLETED: ["TODO"], // Reopen completed task back to TODO
  },
  MANAGER_OR_ADMIN: {
    TODO: [], // Developer task: Supervisor cannot arbitrarily drag/shift
    IN_PROGRESS: [], // In-progress tasks must be submitted by the assigned employee with deliverables
    REVIEW: ["COMPLETED", "TODO"], // Review deliverable: Accept to COMPLETED or Give Suggestions and move to TODO
    COMPLETED: ["TODO"], // Reopen completed task back to TODO
  },
};

/**
 * Determines whether a user can drag a specific task card on the Kanban board.
 * - Only the assigned developer can drag their active tasks (TODO, IN_PROGRESS).
 * - Completed tasks and In-Review tasks are strictly non-draggable.
 * - Non-assigned managers/leads operate in oversight mode on active tasks.
 */
export function canUserDragBoardTask({ isAssigned, status, sprintIsReady }) {
  const normStatus = normalizeTaskStatus(status);
  if (normStatus === "COMPLETED" || normStatus === "REVIEW") {
    return false;
  }
  if (!isAssigned) {
    return false;
  }
  if (!sprintIsReady) {
    return false;
  }
  return true;
}


/**
 * Normalizes user role into standard category: 'EMPLOYEE' | 'TEAM_LEAD' | 'MANAGER_OR_ADMIN'
 */
export function getTaskPermissionRole(userRole, employeeProfile, project) {
  const rawRole = String(userRole || employeeProfile?.role || "").toLowerCase().replace(/[\s_-]+/g, "");
  const isOwnerOrAdmin = rawRole.includes("admin") || rawRole.includes("owner") || rawRole.includes("hr");
  const isProjectCreator = project?.created_by === employeeProfile?.id || project?.owner_id === employeeProfile?.id;
  const isAssignedLead = project?.team_lead_id === employeeProfile?.id;

  if (isOwnerOrAdmin || isProjectCreator) {
    return "MANAGER_OR_ADMIN";
  }
  if (rawRole.includes("manager") || rawRole.includes("supervisor")) {
    return "MANAGER_OR_ADMIN";
  }
  if (isAssignedLead || rawRole.includes("lead")) {
    return "TEAM_LEAD";
  }
  return "EMPLOYEE";
}

/**
 * Normalizes task status strings and aliases (e.g. DONE -> COMPLETED, SUBMIT_FOR_REVIEW -> REVIEW)
 */
export function normalizeTaskStatus(status) {
  const s = String(status || "TODO").toUpperCase().replace(/[\s-]+/g, "_");
  if (s === "DONE") return "COMPLETED";
  if (s === "SUBMIT_FOR_REVIEW" || s === "SUBMIT_REVIEW" || s === "SUBMITTED_FOR_REVIEW") return "REVIEW";
  return s;
}

/**
 * Checks if a status transition is allowed for a user role.
 * @param {string} roleCategory - 'EMPLOYEE' | 'TEAM_LEAD' | 'MANAGER_OR_ADMIN'
 * @param {string} currentStatus - Current status (TODO, IN_PROGRESS, REVIEW, COMPLETED)
 * @param {string} targetStatus - Target status (TODO, IN_PROGRESS, REVIEW, COMPLETED)
 * @param {boolean} [isAssigned=false] - Whether the user is the assigned developer on this task
 * @returns {boolean}
 */
export function isTaskStatusTransitionAllowed(roleCategory, currentStatus, targetStatus, isAssigned = false) {
  const normCurrent = normalizeTaskStatus(currentStatus);
  const normTarget = normalizeTaskStatus(targetStatus);
  if (normCurrent === normTarget) return true;

  // If the user is the assigned developer working on active task development, apply developer transition rules
  const effectiveRole = isAssigned && (normCurrent === "TODO" || normCurrent === "IN_PROGRESS")
    ? "EMPLOYEE"
    : roleCategory;

  const roleRules = TASK_STATUS_TRANSITIONS[effectiveRole] || TASK_STATUS_TRANSITIONS.EMPLOYEE;
  const allowedNext = roleRules[normCurrent] || [];
  return allowedNext.includes(normTarget);
}

/**
 * Evaluates whether an employee has reached their Work In Progress (WIP) limit.
 * Agile Governance Rule:
 * - Hard Limit: Max 2 active tasks in IN_PROGRESS per developer/employee.
 * @param {string|object} employee - Employee ID string or Employee profile object
 * @param {Array} tasks - Array of project tasks
 * @param {string} [currentTaskId] - ID of task being updated (excluded from existing count)
 * @param {number} [maxWip=2] - Default max WIP limit (2)
 * @returns {{ allowed: boolean, currentWipCount: number, activeTasks: Array, message: string|null }}
 */
export function checkEmployeeWipLimit(employee, tasks = [], currentTaskId = null, maxWip = 2) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { allowed: true, currentWipCount: 0, activeTasks: [], message: null };
  }

  // Extract all possible IDs, emails, and names for this employee
  const empIds = new Set();
  const empEmails = new Set();
  const empNames = new Set();

  const registerTarget = (target) => {
    if (!target) return;
    if (typeof target === "string" || typeof target === "number") {
      const s = String(target).trim();
      if (s) {
        empIds.add(s);
        if (s.includes("@")) empEmails.add(s.toLowerCase());
      }
      return;
    }
    if (typeof target === "object") {
      if (target.id) empIds.add(String(target.id).trim());
      if (target.auth_user_id) empIds.add(String(target.auth_user_id).trim());
      if (target.user_id) empIds.add(String(target.user_id).trim());
      if (target.employee_id) empIds.add(String(target.employee_id).trim());
      if (target.email) empEmails.add(String(target.email).trim().toLowerCase());
      if (target.full_name) empNames.add(String(target.full_name).trim().toLowerCase());
      if (target.name) empNames.add(String(target.name).trim().toLowerCase());
      if (target.assigned_to) registerTarget(target.assigned_to);
      if (target.assignee_id) registerTarget(target.assignee_id);
      if (target.planned_assignee_id) registerTarget(target.planned_assignee_id);
      if (target.assignee) registerTarget(target.assignee);
      if (target.planned_assignee) registerTarget(target.planned_assignee);
    }
  };

  if (employee) {
    registerTarget(employee);
  }

  const hasSpecificFilter = empIds.size > 0 || empEmails.size > 0 || empNames.size > 0;

  const inProgressTasks = tasks.filter((t) => {
    if (!t) return false;
    if (currentTaskId && String(t.id) === String(currentTaskId)) return false;
    const normStatus = normalizeTaskStatus(t.status);
    if (normStatus !== "IN_PROGRESS") return false;

    if (!hasSpecificFilter) {
      return true;
    }

    const tIds = new Set();
    const tEmails = new Set();
    const tNames = new Set();

    const registerTaskItem = (target) => {
      if (!target) return;
      if (typeof target === "string" || typeof target === "number") {
        const s = String(target).trim();
        if (s) {
          tIds.add(s);
          if (s.includes("@")) tEmails.add(s.toLowerCase());
        }
        return;
      }
      if (typeof target === "object") {
        if (target.id) tIds.add(String(target.id).trim());
        if (target.auth_user_id) tIds.add(String(target.auth_user_id).trim());
        if (target.user_id) tIds.add(String(target.user_id).trim());
        if (target.employee_id) tIds.add(String(target.employee_id).trim());
        if (target.email) tEmails.add(String(target.email).trim().toLowerCase());
        if (target.full_name) tNames.add(String(target.full_name).trim().toLowerCase());
        if (target.name) tNames.add(String(target.name).trim().toLowerCase());
      }
    };

    registerTaskItem(t.assigned_to);
    registerTaskItem(t.assignee_id);
    registerTaskItem(t.planned_assignee_id);
    registerTaskItem(t.assignee);
    registerTaskItem(t.planned_assignee);

    for (const id of empIds) {
      if (tIds.has(id)) return true;
    }
    for (const email of empEmails) {
      if (tEmails.has(email)) return true;
    }
    for (const name of empNames) {
      if (tNames.has(name)) return true;
    }

    return false;
  });

  const count = inProgressTasks.length;
  const limit = Number(maxWip) || 2;

  if (count >= limit) {
    const taskTitles = inProgressTasks.map((t) => `"${t.title || "Task"}"`).join(", ");
    return {
      allowed: false,
      currentWipCount: count,
      activeTasks: inProgressTasks,
      message: `Already ${count} tasks in progress! You can have at most ${limit} tasks in 'In Progress' at the same time (${taskTitles}). Please finish or submit your remaining in-progress tasks for review first.`,
    };
  }

  return { allowed: true, currentWipCount: count, activeTasks: inProgressTasks, message: null };
}



