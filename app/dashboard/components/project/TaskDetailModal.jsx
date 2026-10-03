"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api/authFetch";
import {
  TASK_STATUS_TRANSITIONS,
  getTaskPermissionRole,
  isTaskStatusTransitionAllowed,
  normalizeTaskStatus,
  checkEmployeeWipLimit,
  validateTaskSprintBounds,
  getSprintDateBounds,
} from "@/lib/projectUtils";
import TaskHeader from "./task-modal/TaskHeader";
import TaskDeliverablesViewer from "./task-modal/TaskDeliverablesViewer";
import TaskTimelineHistory from "./task-modal/TaskTimelineHistory";
import TaskReviewActions from "./task-modal/TaskReviewActions";
import TaskExtensionModal from "./TaskExtensionModal";
import TaskExtensionReviewModal from "./TaskExtensionReviewModal";

/**
 * TaskDetailModal Component
 * Granular, high-performance modal for inspecting and editing task parameters,
 * submitting deliverables, auditing lifecycle history, and supervisor review.
 */
export default function TaskDetailModal({
  task,
  project,
  tasks = [],
  sprints = [],
  epics = [],
  departmentEmployees = [],
  teamLeads = [],
  allEmployees: externalAllEmployees = [],
  employeeProfile,
  currentUserId,
  isOpen,
  onClose,
  onTaskUpdated,
}) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState("TASK_DETAILS"); // 'TASK_DETAILS' | 'REVIEW_TASK'

  // Core task form fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [sprintId, setSprintId] = useState("");
  const [status, setStatus] = useState("TODO");
  const [priority, setPriority] = useState("MEDIUM");
  const [storyPoints, setStoryPoints] = useState(1);
  const [taskType, setTaskType] = useState("STORY");
  const [epicId, setEpicId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [progress, setProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState({ text: "", type: "" });

  // Due Date Extension Request & Review States
  const [isExtensionModalOpen, setIsExtensionModalOpen] = useState(false);
  const [isReviewExtensionModalOpen, setIsReviewExtensionModalOpen] = useState(false);
  const [extensionStatus, setExtensionStatus] = useState(task?.extension_status || null);
  const [showSuggestionsModal, setShowSuggestionsModal] = useState(false);
  const [suggestionNotes, setSuggestionNotes] = useState("");

  const [historyItems, setHistoryItems] = useState([]);
  const [internalSprints, setInternalSprints] = useState([]);
  const [internalEpics, setInternalEpics] = useState([]);

  // Deliverables & Attachments States
  const [reviewComments, setReviewComments] = useState("");
  const [reviewAttachments, setReviewAttachments] = useState([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const fileInputRef = useRef(null);

  // Role permissions
  const cleanRole = (employeeProfile?.role || "").toLowerCase().replace(/[\s_-]+/g, "");
  const isOwnerOrAdmin = cleanRole.includes("admin") || cleanRole.includes("owner") || cleanRole.includes("hr");
  const isProjectOwnerOrCreator = project?.owner_id === employeeProfile?.id || project?.created_by === employeeProfile?.id;
  const isAssignedLead = project?.team_lead_id === employeeProfile?.id;
  const isManagerRole = cleanRole.includes("manager") || cleanRole.includes("lead");
  const canReviewTask = isOwnerOrAdmin || isProjectOwnerOrCreator || isAssignedLead || isManagerRole;
  const canEditManagementFields = canReviewTask;

  const isAssignedToMe = useMemo(() => {
    if (!task) return false;
    const effectiveUserId = currentUserId || employeeProfile?.id;
    const authId = employeeProfile?.auth_user_id || employeeProfile?.user_id;
    const targetIds = [effectiveUserId, authId].filter(Boolean).map(String);
    const taskAssigneeIds = [
      task.assigned_to,
      task.assignee_id,
      task.planned_assignee_id,
      task.assignee?.id,
      task.assignee?.auth_user_id,
      task.assignee?.user_id,
      task.planned_assignee?.id,
    ]
      .filter(Boolean)
      .map(String);
    return taskAssigneeIds.some((id) => targetIds.includes(id));
  }, [task, currentUserId, employeeProfile]);

  const userRoleCategory = useMemo(() => {
    return getTaskPermissionRole(employeeProfile?.role, employeeProfile, project);
  }, [employeeProfile, project]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Upload screenshot proofs with server-side magic byte inspection endpoint
  const processImageFiles = useCallback(
    async (files) => {
      const fileList = Array.from(files);
      for (const file of fileList) {
        if (file.size > 15 * 1024 * 1024) {
          setFeedbackMsg({ text: "Attachment exceeds 15MB limit.", type: "warning" });
          continue;
        }

        const tempId = `att-temp-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        const previewUrl = URL.createObjectURL(file);

        setReviewAttachments((prev) => [
          ...prev,
          {
            id: tempId,
            name: file.name || `Screenshot-${Date.now()}.png`,
            size: `${(file.size / 1024).toFixed(1)} KB`,
            url: previewUrl,
            type: file.type || "image/png",
            isUploading: true,
          },
        ]);
        setUploadingCount((c) => c + 1);

        try {
          const formData = new FormData();
          formData.append("file", file);
          if (task?.id) formData.append("taskId", task.id);
          const effectiveProjId = task?.project_id || project?.id;
          if (effectiveProjId) formData.append("projectId", effectiveProjId);

          const res = await authFetch("/api/upload/task-attachment", {
            method: "POST",
            body: formData,
          });

          const data = await res.json();
          if (res.ok && data.url) {
            setReviewAttachments((prev) =>
              prev.map((att) =>
                att.id === tempId
                  ? {
                      id: data.id || tempId,
                      name: data.name || att.name,
                      size: data.size || att.size,
                      url: data.url,
                      type: data.type || att.type,
                      isUploading: false,
                    }
                  : att
              )
            );
          } else {
            setFeedbackMsg({ text: data.message || "Failed to upload attachment.", type: "error" });
            setReviewAttachments((prev) => prev.filter((att) => att.id !== tempId));
          }
        } catch (err) {
          console.error("Task attachment upload error:", err);
          setFeedbackMsg({ text: "Network error uploading screenshot.", type: "error" });
          setReviewAttachments((prev) => prev.filter((att) => att.id !== tempId));
        } finally {
          setUploadingCount((c) => Math.max(0, c - 1));
        }
      }
    },
    [task?.id, task?.project_id, project?.id]
  );

  // Auto fetch sprints & epics if not supplied
  useEffect(() => {
    if (!isOpen || !task) return;
    const effectiveProjId = task.project_id || task.project?.id || project?.id;
    if (!effectiveProjId) return;

    if (!sprints || sprints.length === 0) {
      const fetchSprints = async () => {
        try {
          const res = await authFetch(`/api/projects/${effectiveProjId}/sprints?t=${Date.now()}`);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.sprints)) setInternalSprints(data.sprints);
          }
        } catch (e) {
          console.warn("TaskDetailModal sprints fetch error:", e);
        }
      };
      fetchSprints();
    }

    if (!epics || epics.length === 0) {
      const fetchEpics = async () => {
        try {
          const res = await authFetch(`/api/projects/${effectiveProjId}/epics?t=${Date.now()}`);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.epics)) setInternalEpics(data.epics);
          }
        } catch (e) {
          console.warn("TaskDetailModal epics fetch error:", e);
        }
      };
      fetchEpics();
    }
  }, [isOpen, task?.project_id, task?.project?.id, project?.id, sprints, epics]);

  // Fetch status history on modal open
  useEffect(() => {
    if (!isOpen || !task?.id) return;
    let isSubscribed = true;

    const fetchHistory = async () => {
      try {
        const res = await authFetch(`/api/projects/tasks/${task.id}/history?t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.history) && isSubscribed) {
            setHistoryItems(data.history);
            return;
          }
        }

        const supabase = createClient();
        const { data, error } = await supabase
          .from("task_status_history")
          .select("*, changed_by_employee:employees(id, full_name, email, role, designation)")
          .eq("task_id", task.id)
          .order("created_at", { ascending: false });

        if (!error && Array.isArray(data) && isSubscribed) {
          setHistoryItems(data);
        }
      } catch (err) {
        console.warn("Task status history fetch warning:", err);
      }
    };

    fetchHistory();
    return () => {
      isSubscribed = false;
    };
  }, [isOpen, task?.id]);

  // Consolidated employee roster
  const allEmployees = useMemo(() => {
    const map = new Map();
    (externalAllEmployees || []).forEach((e) => {
      if (e?.id) map.set(e.id, e);
    });

    if (project?.teamLead?.id) {
      map.set(project.teamLead.id, { ...project.teamLead, roleTag: "Team Lead" });
    } else if (project?.team_lead_id) {
      const lead = (teamLeads || []).find((l) => l.id === project.team_lead_id) || (departmentEmployees || []).find((e) => e.id === project.team_lead_id);
      if (lead) map.set(lead.id, { ...lead, roleTag: "Team Lead" });
    }

    if (project?.creator?.id) {
      map.set(project.creator.id, { ...project.creator, roleTag: "Project Owner" });
    } else if (project?.created_by || project?.owner_id) {
      const creatorId = project.created_by || project.owner_id;
      const creator = (departmentEmployees || []).find((e) => e.id === creatorId) || (teamLeads || []).find((l) => l.id === creatorId);
      if (creator) map.set(creator.id, { ...creator, roleTag: "Project Owner" });
    }

    if (Array.isArray(project?.teamMembers)) {
      project.teamMembers.forEach((m) => {
        if (m?.id && !map.has(m.id)) {
          map.set(m.id, { ...m, roleTag: m.designation || m.role || "Member" });
        }
      });
    }

    if (Array.isArray(project?.team_members)) {
      project.team_members.forEach((id) => {
        const cleanId = typeof id === "object" ? id?.id : id;
        if (cleanId && !map.has(cleanId)) {
          const emp = (departmentEmployees || []).find((e) => e.id === cleanId) || (teamLeads || []).find((l) => l.id === cleanId);
          if (emp) map.set(cleanId, { ...emp, roleTag: emp.designation || emp.role || "Member" });
        }
      });
    }

    return Array.from(map.values()).sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
  }, [project, departmentEmployees, teamLeads, externalAllEmployees]);

  // Project Squad Filter for Assignee dropdown
  const assignableProjectEmployees = useMemo(() => {
    const map = new Map();
    const sourcePool = Array.isArray(externalAllEmployees) && externalAllEmployees.length > 0
      ? externalAllEmployees
      : (Array.isArray(departmentEmployees) ? departmentEmployees : []);

    const teamLeadId = project?.teamLead?.id || project?.team_lead_id;
    const ownerId = project?.creator?.id || project?.owner_id || project?.created_by;

    if (Array.isArray(project?.teamMembers) && project.teamMembers.length > 0) {
      project.teamMembers.forEach((m) => {
        if (m?.id && m.id !== teamLeadId && m.id !== ownerId) {
          map.set(m.id, m);
        }
      });
    }

    if (Array.isArray(project?.team_members) && project.team_members.length > 0) {
      project.team_members.forEach((memberId) => {
        const cleanId = typeof memberId === "object" ? memberId?.id : memberId;
        if (cleanId && cleanId !== teamLeadId && cleanId !== ownerId && !map.has(cleanId)) {
          const emp = sourcePool.find((e) => e.id === cleanId);
          if (emp) map.set(cleanId, emp);
        }
      });
    }

    if (map.size === 0) {
      sourcePool.forEach((emp) => {
        if (emp?.id && emp.id !== teamLeadId && emp.id !== ownerId) {
          map.set(emp.id, emp);
        }
      });
    }

    return Array.from(map.values()).sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
  }, [project, departmentEmployees, externalAllEmployees]);

  // Sync state whenever task changes or modal opens
  useEffect(() => {
    if (task && isOpen) {
      setTitle(task.title || "");
      setDescription(task.description || "");
      setAssigneeId(task.assigned_to || task.planned_assignee_id || task.assignee_id || "");
      setSprintId(task.sprint_id || "");
      setStatus(normalizeTaskStatus(task.status || "TODO"));
      setPriority((task.priority || "MEDIUM").toUpperCase());
      setStoryPoints(Number(task.story_points) || 1);
      setTaskType((task.task_type || "STORY").toUpperCase());
      setEpicId(task.epic_id || "");
      setDueDate(task.due_date ? String(task.due_date).split("T")[0] : "");
      setProgress(Number(task.progress) || 0);
      setExtensionStatus(task.extension_status || null);
      setFeedbackMsg({ text: "", type: "" });

      // Deliverable review attachments & comments
      let rawAtts = task.review_attachments || task.attachments || [];
      if (typeof rawAtts === "string") {
        try {
          rawAtts = JSON.parse(rawAtts);
        } catch {
          rawAtts = [];
        }
      }
      setReviewAttachments(Array.isArray(rawAtts) ? rawAtts : []);
      setReviewComments(task.review_comments || task.comments || "");
    }
  }, [task, isOpen]);

  const isTaskCompleted = status === "COMPLETED";
  const isTaskInReview = status === "REVIEW";
  const isCompletedLockedForEmployee = isTaskCompleted && userRoleCategory === "EMPLOYEE";
  const isInReviewLockedForEmployee = isTaskInReview && userRoleCategory === "EMPLOYEE";
  const isStatusSelectDisabled = !canReviewTask && (isCompletedLockedForEmployee || isInReviewLockedForEmployee);
  const selectedSprint = useMemo(() => {
    if (!sprintId) return null;
    const pool = (sprints && sprints.length > 0) ? sprints : (internalSprints || []);
    return pool.find((s) => s.id === sprintId) || null;
  }, [sprintId, sprints, internalSprints]);

  const sprintBounds = useMemo(() => {
    if (!selectedSprint) return { minDate: "", maxDate: "", isSprintActive: false };
    return getSprintDateBounds(selectedSprint);
  }, [selectedSprint]);

  const sprintMinDate = sprintBounds.minDate;
  const sprintMaxDate = sprintBounds.maxDate;

  const dateValidation = useMemo(() => {
    if (!dueDate || !selectedSprint) return { isValid: true, error: null };
    return validateTaskSprintBounds(dueDate, selectedSprint);
  }, [dueDate, selectedSprint]);

  const handleSprintChange = (newSprintId) => {
    setSprintId(newSprintId);
    if (!newSprintId) return;

    const pool = (sprints && sprints.length > 0) ? sprints : (internalSprints || []);
    const targetSprint = pool.find((s) => s.id === newSprintId);
    if (targetSprint) {
      const bounds = getSprintDateBounds(targetSprint);
      const minD = bounds.minDate;
      const maxD = bounds.maxDate;

      if (!dueDate || (minD && dueDate < minD) || (maxD && dueDate > maxD)) {
        setDueDate(maxD || minD || "");
      }
    }
  };

  const availableStatuses = useMemo(() => {
    const cur = normalizeTaskStatus(task?.status || "TODO");
    const effectiveRole =
      isAssignedToMe && (cur === "TODO" || cur === "IN_PROGRESS")
        ? "EMPLOYEE"
        : userRoleCategory;
    const allowed = TASK_STATUS_TRANSITIONS[effectiveRole]?.[cur] || [];
    const set = new Set([cur, ...allowed]);
    return Array.from(set);
  }, [userRoleCategory, task?.status, isAssignedToMe]);

  const submitterName = useMemo(() => {
    if (task?.submitted_by) {
      const foundEmp = allEmployees.find((e) => e.id === task.submitted_by);
      if (foundEmp?.full_name) return foundEmp.full_name;
    }
    return task?.assignee?.full_name || task?.planned_assignee?.full_name || "Assigned Developer";
  }, [task?.submitted_by, allEmployees, task?.assignee, task?.planned_assignee]);

  const reviewerData = useMemo(() => {
    if (isTaskCompleted) {
      return {
        reviewerName: task?.reviewed_by_name || task?.approved_by_name || "Supervisor / Team Lead",
        decision: "Approved & Finalized (100%)",
        isApproved: true,
        reviewedAt: task?.reviewed_at || task?.approved_at || task?.completed_at,
      };
    }
    if (isTaskInReview) {
      return {
        reviewerName: "Pending Supervisor Review",
        decision: "Awaiting Verification",
        isPending: true,
      };
    }
    return null;
  }, [isTaskCompleted, isTaskInReview, task]);

  // Form Save Handler (Optimistic Locking)
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;

    if (!title.trim()) {
      setFeedbackMsg({ text: "Task title cannot be empty.", type: "error" });
      return;
    }

    const normStatus = normalizeTaskStatus(status);
    const prevNormStatus = normalizeTaskStatus(task?.status || "TODO");

    // Agile Rule Checks
    if (normStatus !== prevNormStatus) {
      const isAssigned = isAssignedToMe;
      if (!isTaskStatusTransitionAllowed(userRoleCategory, prevNormStatus, normStatus, isAssigned)) {
        if (normStatus === "COMPLETED" && (prevNormStatus === "TODO" || prevNormStatus === "IN_PROGRESS")) {
          setFeedbackMsg({
            text: "Deliverable Submission Required: In-progress tasks cannot be marked Completed directly. The assigned employee must submit for Review first.",
            type: "warning",
          });
          return;
        }
        setFeedbackMsg({
          text: `Action Blocked: Moving from ${prevNormStatus} to ${normStatus} is not permitted for your role.`,
          type: "error",
        });
        return;
      }

      if (normStatus === "IN_PROGRESS" && prevNormStatus !== "IN_PROGRESS") {
        const assignee =
          assigneeId ||
          task?.assigned_to ||
          task?.assignee_id ||
          task?.planned_assignee_id ||
          task?.assignee ||
          employeeProfile;
        const wipCheck = checkEmployeeWipLimit(assignee, tasks, task?.id, 2);
        if (!wipCheck.allowed) {
          setFeedbackMsg({
            text:
              wipCheck.message ||
              "Already 2 tasks in progress! You can have at most 2 tasks in 'In Progress' at the same time. Please finish or submit your remaining in-progress tasks for review first.",
            type: "warning",
          });
          return;
        }
      }
    }

    // Validate that Task Due Date is within the Sprint timeline
    if (dueDate && selectedSprint) {
      const dateBounds = validateTaskSprintBounds(dueDate, selectedSprint);
      if (!dateBounds.isValid) {
        setFeedbackMsg({
          text: dateBounds.error || "Task due date must fall within the sprint start and end dates.",
          type: "warning",
        });
        return;
      }
    }

    setIsSubmitting(true);
    setFeedbackMsg({ text: "", type: "" });

    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        status: normStatus,
        priority,
        task_type: taskType,
        story_points: Number(storyPoints) || 1,
        progress: normStatus === "COMPLETED" ? 100 : normStatus === "TODO" ? 0 : Number(progress) || 50,
        due_date: dueDate || null,
        sprint_id: sprintId || null,
        epic_id: epicId || null,
        assigned_to: assigneeId || null,
        assignee_id: assigneeId || null,
        review_comments: reviewComments,
        review_attachments: reviewAttachments,
        expected_updated_at: task?.updated_at || undefined,
      };

      const res = await authFetch(`/api/projects/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        setFeedbackMsg({ text: "Task updated successfully!", type: "success" });
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("project-task-updated", {
              detail: { taskId: task.id, status: normStatus, new: data.task, project_id: project?.id },
            })
          );
        }
        if (onTaskUpdated) onTaskUpdated();
        setTimeout(() => onClose(), 400);
      } else {
        if (res.status === 409 || data?.code === "CONCURRENCY_CONFLICT") {
          setFeedbackMsg({
            text: "Conflict detected: This task was modified by another user. Please reopen the modal to see the latest changes.",
            type: "warning",
          });
          if (onTaskUpdated) onTaskUpdated();
        } else {
          setFeedbackMsg({ text: data.message || "Failed to update task.", type: "error" });
        }
      }
    } catch (err) {
      console.error("Task update error:", err);
      setFeedbackMsg({ text: "Network connection error. Please try again.", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick action: Approve deliverable
  const handleApproveDeliverable = async () => {
    setIsSubmitting(true);
    setFeedbackMsg({ text: "", type: "" });
    try {
      const reviewerFullName = employeeProfile?.full_name || "Team Lead / Project Manager";
      const reviewerId = employeeProfile?.id || null;

      const res = await authFetch(`/api/projects/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "COMPLETED",
          progress: 100,
          reviewed_by: reviewerId,
          reviewed_by_name: reviewerFullName,
          approved_by: reviewerId,
          approved_by_name: reviewerFullName,
          comments: `Approved and marked completed by ${reviewerFullName}`,
          expected_updated_at: task?.updated_at || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        if (onTaskUpdated) onTaskUpdated();
        onClose();
      } else {
        setFeedbackMsg({ text: data.message || "Failed to approve deliverable.", type: "error" });
      }
    } catch (err) {
      console.error("Approve review error:", err);
      setFeedbackMsg({ text: "Network error approving deliverable.", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick action: Request revisions / suggestions
  const handleRequestRevisions = async (notes) => {
    setIsSubmitting(true);
    setFeedbackMsg({ text: "", type: "" });
    try {
      const reviewerFullName = employeeProfile?.full_name || "Reviewer";
      const payload = {
        status: "TODO",
        progress: 0,
        review_feedback: notes,
        review_feedback_by: employeeProfile?.id || null,
        comments: `[Team Lead Suggestions]: ${notes}`,
        expected_updated_at: task?.updated_at || undefined,
      };

      const res = await authFetch(`/api/projects/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        if (onTaskUpdated) onTaskUpdated();
        onClose();
      } else {
        setFeedbackMsg({ text: data.message || "Failed to submit suggestions.", type: "error" });
      }
    } catch (err) {
      console.error("Suggestions submit error:", err);
      setFeedbackMsg({ text: "Network error submitting suggestions.", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick action: Start working
  const handleStartWorking = async () => {
    if (!task?.id) return;

    // WIP Limit check
    const assignee =
      task.assigned_to ||
      task.assignee_id ||
      task.planned_assignee_id ||
      task.assignee ||
      employeeProfile;
    const wipCheck = checkEmployeeWipLimit(assignee, tasks, task.id, 2);
    if (!wipCheck.allowed) {
      setFeedbackMsg({
        text:
          wipCheck.message ||
          "Already 2 tasks in progress! You can have at most 2 tasks in 'In Progress' at the same time. Please finish or submit your remaining in-progress tasks for review first.",
        type: "warning",
      });
      return;
    }

    setIsSubmitting(true);
    setFeedbackMsg({ text: "", type: "" });
    try {
      const res = await authFetch(`/api/projects/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "IN_PROGRESS",
          progress: Number(task.progress) > 0 && Number(task.progress) < 100 ? Number(task.progress) : 50,
          expected_updated_at: task?.updated_at || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setStatus("IN_PROGRESS");
        setFeedbackMsg({ text: "Task moved to In Progress.", type: "success" });
        if (onTaskUpdated) onTaskUpdated();
        setTimeout(() => onClose?.(), 600);
      } else {
        setFeedbackMsg({
          text: data.message || "Failed to start working on task.",
          type: "warning",
        });
      }
    } catch (err) {
      setFeedbackMsg({ text: "Network error updating task status.", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !task || !mounted || typeof document === "undefined") return null;

  const projectKey = project?.key || project?.name?.slice(0, 3)?.toUpperCase() || "HRM";

  const modalContent = (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-fadeIn overflow-y-auto"
    >
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh] animate-scaleIn m-auto my-auto">
        {/* Modular Header */}
        <TaskHeader
          task={task}
          projectKey={projectKey}
          title={title}
          setTitle={setTitle}
          taskType={taskType}
          setTaskType={setTaskType}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          attachmentsCount={reviewAttachments.length}
          canEdit={canEditManagementFields}
          onClose={onClose}
        />

        {/* Modal Form Body */}
        <form id="task-detail-form" onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          {/* Scrollable Content */}
          <div className="p-6 space-y-5 overflow-y-auto text-xs max-h-[calc(90vh-170px)]">
            {/* Feedback Alert Toast */}
            {feedbackMsg.text && (
              <div
                className={`p-3 rounded-xl text-xs font-medium flex items-center justify-between gap-2 shadow-2xs ${
                  feedbackMsg.type === "error" || feedbackMsg.type === "warning"
                    ? "bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300"
                    : "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
                }`}
              >
                <span>{feedbackMsg.text}</span>
                <button
                  type="button"
                  onClick={() => setFeedbackMsg({ text: "", type: "" })}
                  className="text-xs font-bold opacity-60 hover:opacity-100 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* TAB 1: TASK DETAILS */}
            {activeTab === "TASK_DETAILS" && (
              <div className="space-y-4">
                {/* Section: Assignment & Schedule */}
                <div className="space-y-3">
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">
                    Assignment &amp; Schedule
                  </span>

                  {/* Status, Priority, Story Points Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block">
                        Status
                      </label>
                      <select
                        value={status}
                        disabled={isStatusSelectDisabled}
                        onChange={(e) => setStatus(e.target.value)}
                        className="w-full border border-slate-200 dark:border-slate-700 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none shadow-2xs transition font-medium cursor-pointer disabled:opacity-60 disabled:bg-slate-50"
                      >
                        {availableStatuses.map((st) => (
                          <option key={st} value={st}>
                            {st === "TODO" ? "To Do" : st === "IN_PROGRESS" ? "In Progress" : st === "REVIEW" ? "In Review" : "Completed"}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block">
                        Priority
                      </label>
                      <select
                        value={priority}
                        disabled={!canEditManagementFields}
                        onChange={(e) => setPriority(e.target.value)}
                        className="w-full border border-slate-200 dark:border-slate-700 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none shadow-2xs transition font-medium cursor-pointer disabled:opacity-60 disabled:bg-slate-50"
                      >
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                        <option value="URGENT">Urgent</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block">
                        Story Points
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        disabled={!canEditManagementFields}
                        value={storyPoints}
                        onChange={(e) => setStoryPoints(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full border border-slate-200 dark:border-slate-700 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none shadow-2xs transition font-medium disabled:opacity-60 disabled:bg-slate-50"
                      />
                    </div>
                  </div>

                  {/* Assignee & Sprint Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block">
                        Assignee
                      </label>
                      <select
                        value={assigneeId}
                        disabled={!canEditManagementFields}
                        onChange={(e) => setAssigneeId(e.target.value)}
                        className="w-full border border-slate-200 dark:border-slate-700 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none shadow-2xs transition font-medium cursor-pointer disabled:opacity-60 disabled:bg-slate-50"
                      >
                        <option value="">Unassigned</option>
                        {assignableProjectEmployees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.full_name} {emp.designation ? `(${emp.designation})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block">
                        Sprint
                      </label>
                      <select
                        value={sprintId}
                        disabled={!canEditManagementFields}
                        onChange={(e) => handleSprintChange(e.target.value)}
                        className="w-full border border-slate-200 dark:border-slate-700 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none shadow-2xs transition font-medium cursor-pointer disabled:opacity-60 disabled:bg-slate-50"
                      >
                        <option value="">Backlog (No Sprint)</option>
                        {(sprints.length > 0 ? sprints : internalSprints).map((sp) => (
                          <option key={sp.id} value={sp.id}>
                            {sp.name} {sp.status === "ACTIVE" ? "(Active)" : `(${sp.status || "Planned"})`}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Due Date & Epic Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block">
                          Due Date
                        </label>
                        {isAssignedToMe && (
                          <button
                            type="button"
                            onClick={() => setIsExtensionModalOpen(true)}
                            className="text-[11px] font-semibold text-[#1f6fb2] hover:text-[#185a91] dark:text-sky-400 hover:underline cursor-pointer"
                          >
                            Request Extension
                          </button>
                        )}
                      </div>
                      <input
                        type="date"
                        disabled={!canEditManagementFields}
                        min={sprintMinDate || undefined}
                        max={sprintMaxDate || undefined}
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="w-full border border-slate-200 dark:border-slate-700 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none shadow-2xs transition font-medium disabled:opacity-60 disabled:bg-slate-50 font-mono"
                      />
                      {!dateValidation.isValid && (
                        <p className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold pt-1">
                          {dateValidation.error}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block">
                        Epic (Module)
                      </label>
                      <select
                        value={epicId}
                        disabled={!canEditManagementFields}
                        onChange={(e) => setEpicId(e.target.value)}
                        className="w-full border border-slate-200 dark:border-slate-700 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none shadow-2xs transition font-medium cursor-pointer disabled:opacity-60 disabled:bg-slate-50"
                      >
                        <option value="">No Epic</option>
                        {(epics.length > 0 ? epics : internalEpics).map((ep) => (
                          <option key={ep.id} value={ep.id}>
                            {ep.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Section: Task Specification */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/60">
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">
                    Task Specification
                  </span>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block">
                      Description &amp; Acceptance Criteria
                    </label>
                    <textarea
                      rows={3}
                      readOnly={!canEditManagementFields}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Provide detailed user story or technical acceptance criteria..."
                      className="w-full border border-slate-200 dark:border-slate-700 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl p-3 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none shadow-2xs transition resize-y font-medium disabled:opacity-60 disabled:bg-slate-50"
                    />
                  </div>
                </div>

                {/* Modular Timeline History */}
                <TaskTimelineHistory
                  task={task}
                  historyItems={historyItems}
                  allEmployees={allEmployees}
                />
              </div>
            )}

            {/* TAB 2: REVIEW & DELIVERABLES */}
            {activeTab === "REVIEW_TASK" && (
              <div className="space-y-4">
                <TaskDeliverablesViewer
                  task={task}
                  submitterName={submitterName}
                  reviewerData={reviewerData}
                  deliverableComments={reviewComments}
                  setDeliverableComments={setReviewComments}
                  attachments={reviewAttachments}
                  onRemoveAttachment={(attId) =>
                    setReviewAttachments((prev) => prev.filter((a, idx) => a.id !== attId && idx !== attId))
                  }
                  onUploadFiles={processImageFiles}
                  uploadingCount={uploadingCount}
                  isReadOnly={!isAssignedToMe || isTaskCompleted}
                  isDraggingOver={isDraggingOver}
                  setIsDraggingOver={setIsDraggingOver}
                  fileInputRef={fileInputRef}
                />
              </div>
            )}

            {/* Modular Review Action Modal (Suggestions / Feedback) */}
            <TaskReviewActions
              showSuggestionsModal={showSuggestionsModal}
              setShowSuggestionsModal={setShowSuggestionsModal}
              suggestionNotes={suggestionNotes}
              setSuggestionNotes={setSuggestionNotes}
              isSubmitting={isSubmitting}
              onConfirmSuggestions={() => {
                if (!suggestionNotes.trim()) return;
                handleRequestRevisions(suggestionNotes.trim());
                setShowSuggestionsModal(false);
                setSuggestionNotes("");
              }}
            />
          </div>

          {/* Dedicated Professional Modal Footer Bar */}
          <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 flex items-center justify-between gap-3 shrink-0">
            {/* Left Side: Current Stage Indicator */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Current Stage:
              </span>
              <span
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border shadow-2xs ${
                  status === "COMPLETED"
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                    : status === "REVIEW"
                    ? "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-800"
                    : status === "IN_PROGRESS"
                    ? "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300 border-sky-200 dark:border-sky-800"
                    : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                }`}
              >
                {status === "COMPLETED"
                  ? "Completed"
                  : status === "REVIEW"
                  ? "In Review"
                  : status === "IN_PROGRESS"
                  ? "In Progress"
                  : "To Do"}
              </span>
            </div>

            {/* Right Side: Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs transition cursor-pointer shadow-2xs disabled:opacity-50"
              >
                Cancel
              </button>

              {/* 1. Supervisor Review: Request Revisions & Approve Deliverable */}
              {isTaskInReview && canReviewTask && (
                <>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setShowSuggestionsModal(true)}
                    className="px-3.5 py-2 rounded-xl border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 font-semibold text-xs transition cursor-pointer disabled:opacity-50"
                  >
                    Request Revisions
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleApproveDeliverable}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {isSubmitting ? "Approving…" : "Approve & Complete"}
                  </button>
                </>
              )}

              {/* 2. Employee Deliverable Submission (strictly assigned employee when in progress or in deliverable review tab) */}
              {isAssignedToMe && status === "IN_PROGRESS" && (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleSubmit}
                  className="px-5 py-2 rounded-xl bg-brand-gradient hover:opacity-95 text-white font-semibold text-xs transition cursor-pointer shadow-xs shadow-[#1f6fb2]/20 flex items-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Submitting…</span>
                    </>
                  ) : (
                    <span>Submit Deliverable for Review</span>
                  )}
                </button>
              )}

              {/* 3. Employee Start Working on To Do */}
              {isAssignedToMe && status === "TODO" && activeTab === "TASK_DETAILS" && (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleStartWorking}
                  className="px-5 py-2 rounded-xl bg-brand-gradient hover:opacity-95 text-white font-semibold text-xs transition cursor-pointer shadow-xs shadow-[#1f6fb2]/20 flex items-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
                >
                  <span>Start Working</span>
                </button>
              )}

              {/* 4. Manager / Lead Save Changes (if not under review approval) */}
              {canEditManagementFields && !isTaskInReview && status !== "IN_PROGRESS" && (
                <button
                  type="submit"
                  disabled={isSubmitting || !dateValidation.isValid}
                  className="px-5 py-2 rounded-xl bg-brand-gradient hover:opacity-95 text-white font-semibold text-xs transition cursor-pointer shadow-xs shadow-[#1f6fb2]/20 flex items-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Saving…</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* Extension Modals */}
      {isExtensionModalOpen && (
        <TaskExtensionModal
          task={task}
          sprints={sprints}
          isOpen={isExtensionModalOpen}
          onClose={() => setIsExtensionModalOpen(false)}
          onSuccess={() => {
            setIsExtensionModalOpen(false);
            if (onTaskUpdated) onTaskUpdated();
          }}
        />
      )}

      {isReviewExtensionModalOpen && (
        <TaskExtensionReviewModal
          task={task}
          isOpen={isReviewExtensionModalOpen}
          onClose={() => setIsReviewExtensionModalOpen(false)}
          onSuccess={() => {
            setIsReviewExtensionModalOpen(false);
            if (onTaskUpdated) onTaskUpdated();
          }}
        />
      )}
    </div>
  );

  return createPortal(modalContent, document.body);
}
