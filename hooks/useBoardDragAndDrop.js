"use client";

import { useState, useCallback } from "react";
import {
  normalizeTaskStatus,
  isTaskStatusTransitionAllowed,
  checkEmployeeWipLimit,
} from "@/lib/projectUtils";

/**
 * Custom Hook: useBoardDragAndDrop
 * Encapsulates Kanban board drag-and-drop state, Agile role validation rules,
 * WIP limit verification, sprint readiness checks, and drop event routing.
 */
export function useBoardDragAndDrop({
  tasks = [],
  sprints = [],
  isKanban = false,
  userRoleCategory = "EMPLOYEE",
  employeeProfile,
  currentUserId,
  isLeadOrManagerOrAdmin = false,
  isTaskAssignedToCurrentUser,
  getTaskSprintState,
  onDirectStatusUpdate,
  onOpenReviewModal,
  showNotificationToast,
}) {
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dragOverColId, setDragOverColId] = useState(null);

  // Drag Start Handler
  const handleDragStart = useCallback(
    (e, task) => {
      const currentNormStatus = normalizeTaskStatus(task?.status);

      // 1. Completed tasks are locked
      if (currentNormStatus === "COMPLETED") {
        e.preventDefault();
        showNotificationToast?.(
          "Action Blocked: Completed tasks are finalized and cannot be dragged or reopened.",
          "warning"
        );
        return;
      }

      // 2. Tasks under review are locked for employees
      if (currentNormStatus === "REVIEW") {
        e.preventDefault();
        showNotificationToast?.(
          "Action Blocked: This deliverable is under review and cannot be dragged while awaiting supervisor verification.",
          "warning"
        );
        return;
      }

      // 3. Assignment verification
      if (!isTaskAssignedToCurrentUser?.(task) && !isLeadOrManagerOrAdmin) {
        e.preventDefault();
        showNotificationToast?.(
          "Only the assigned developer can drag their active tasks. Supervisors oversee and review deliverables.",
          "warning"
        );
        return;
      }

      // 4. Sprint readiness verification
      if (!isLeadOrManagerOrAdmin && getTaskSprintState) {
        const sprintState = getTaskSprintState(task);
        if (!sprintState.isReady) {
          e.preventDefault();
          showNotificationToast?.(sprintState.reason, "warning");
          return;
        }
      }

      e.dataTransfer.setData("text/plain", task.id);
      e.dataTransfer.effectAllowed = "move";
      setDraggedTaskId(task.id);
    },
    [isTaskAssignedToCurrentUser, isLeadOrManagerOrAdmin, getTaskSprintState, showNotificationToast]
  );

  // Drag End Handler
  const handleDragEnd = useCallback(() => {
    setDraggedTaskId(null);
    setDragOverColId(null);
  }, []);

  // Drag Over Handler
  const handleDragOver = useCallback(
    (e, colId) => {
      e.preventDefault();
      const isCompletedCol = colId === "COMPLETED";
      const isRestrictedTarget = isCompletedCol && userRoleCategory === "EMPLOYEE";

      let isWipBlocked = false;
      if (colId === "IN_PROGRESS" && draggedTaskId) {
        const draggedTask = tasks.find((t) => t.id === draggedTaskId);
        if (draggedTask && normalizeTaskStatus(draggedTask.status) !== "IN_PROGRESS") {
          const assignee =
            draggedTask.assignee ||
            draggedTask.assigned_to ||
            draggedTask.assignee_id ||
            draggedTask.planned_assignee_id ||
            employeeProfile;
          const wipCheck = checkEmployeeWipLimit(assignee, tasks, draggedTaskId, 2);
          if (!wipCheck.allowed) {
            isWipBlocked = true;
          }
        }
      }

      e.dataTransfer.dropEffect = "move";
      if (dragOverColId !== colId) {
        setDragOverColId(colId);
      }
    },
    [draggedTaskId, dragOverColId, userRoleCategory, tasks, employeeProfile]
  );

  // Drag Leave Handler
  const handleDragLeave = useCallback(
    (e, colId) => {
      if (e.currentTarget.contains(e.relatedTarget)) return;
      if (dragOverColId === colId) {
        setDragOverColId(null);
      }
    },
    [dragOverColId]
  );

  // Drop Handler
  const handleDrop = useCallback(
    (e, targetColId) => {
      e.preventDefault();
      setDragOverColId(null);
      const taskId = e.dataTransfer.getData("text/plain") || draggedTaskId;
      setDraggedTaskId(null);
      if (!taskId) return;

      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      const currentNormStatus = normalizeTaskStatus(task.status);
      const normTarget = normalizeTaskStatus(targetColId || "TODO");

      // 1. Strictly block any drop or transition from COMPLETED
      if (currentNormStatus === "COMPLETED") {
        showNotificationToast?.(
          "Action Blocked: Completed tasks are finalized and cannot be moved.",
          "error"
        );
        return;
      }

      // 2. Strictly block any drop or transition from REVIEW
      if (currentNormStatus === "REVIEW") {
        showNotificationToast?.(
          "Action Blocked: Tasks under review cannot be moved while awaiting supervisor verification.",
          "warning"
        );
        return;
      }

      // 3. Check assignment
      if (!isTaskAssignedToCurrentUser?.(task) && !isLeadOrManagerOrAdmin) {
        showNotificationToast?.(
          "Only the assigned developer can update the task status on the board.",
          "warning"
        );
        return;
      }

      // 4. Check sprint readiness
      if (!isLeadOrManagerOrAdmin && getTaskSprintState) {
        const sprintState = getTaskSprintState(task);
        if (!sprintState.isReady) {
          showNotificationToast?.(sprintState.reason, "warning");
          return;
        }
      }

      if (currentNormStatus === normTarget) return;

      // 5. Prevent dropping directly onto COMPLETED for employee
      if (normTarget === "COMPLETED" && userRoleCategory === "EMPLOYEE") {
        showNotificationToast?.(
          "Deliverable Approval Required: Please submit for Review. Only your Manager or Team Lead can verify and mark a task as Completed.",
          "warning"
        );
        return;
      }

      // 6. Validate transition against state machine
      const isAssigned = isTaskAssignedToCurrentUser?.(task);
      if (!isTaskStatusTransitionAllowed(userRoleCategory, currentNormStatus, normTarget, isAssigned)) {
        if (normTarget === "COMPLETED" && (currentNormStatus === "TODO" || currentNormStatus === "IN_PROGRESS")) {
          showNotificationToast?.(
            "Deliverable Submission Required: In-progress tasks must be submitted for Review first so quality can be verified.",
            "warning"
          );
          return;
        }
        if (currentNormStatus === "TODO" && normTarget === "REVIEW") {
          showNotificationToast?.(
            "Tasks must first be moved to 'In Progress' before submitting deliverables for review.",
            "warning"
          );
          return;
        }
        showNotificationToast?.(
          `Moving from ${currentNormStatus} to ${normTarget} is not permitted for your current role.`,
          "error"
        );
        return;
      }

      // 7. WIP Limit Rule: Max 2 active in-progress tasks per employee
      if (normTarget === "IN_PROGRESS" && currentNormStatus !== "IN_PROGRESS") {
        const assignee =
          task.assignee ||
          task.assigned_to ||
          task.assignee_id ||
          task.planned_assignee_id ||
          employeeProfile;
        const wipCheck = checkEmployeeWipLimit(assignee, tasks, task.id, 2);
        if (!wipCheck.allowed) {
          showNotificationToast?.(
            wipCheck.message ||
              "Already 2 tasks in progress! You can have at most 2 tasks in 'In Progress' at the same time. Please finish or submit your remaining in-progress tasks for review first.",
            "warning",
            "Work In Progress Limit Reached"
          );
          return; // Stop drop execution and keep task in previous state
        }
      }

      // 8. Moving IN_PROGRESS -> REVIEW opens the Deliverable Submission modal
      if (normTarget === "REVIEW" && currentNormStatus === "IN_PROGRESS") {
        if (onOpenReviewModal) {
          onOpenReviewModal(task, "REVIEW");
          return;
        }
      }

      // 9. Execute Direct Status Update
      if (onDirectStatusUpdate) {
        onDirectStatusUpdate(taskId, targetColId);
      }
    },
    [
      draggedTaskId,
      tasks,
      userRoleCategory,
      isLeadOrManagerOrAdmin,
      employeeProfile,
      isTaskAssignedToCurrentUser,
      getTaskSprintState,
      onOpenReviewModal,
      onDirectStatusUpdate,
      showNotificationToast,
    ]
  );

  return {
    draggedTaskId,
    dragOverColId,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
