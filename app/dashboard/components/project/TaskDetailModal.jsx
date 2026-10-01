/* eslint-disable react-hooks/set-state-in-effect, @next/next/no-img-element */
"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api/authFetch";
import {
  validateTaskSprintBounds,
  getEmployeeSprintWorkload,
  TASK_STATUS_TRANSITIONS,
  getTaskPermissionRole,
  isTaskStatusTransitionAllowed,
  normalizeTaskStatus,
} from "@/lib/projectUtils";
import TaskExtensionModal from "./TaskExtensionModal";
import TaskExtensionReviewModal from "./TaskExtensionReviewModal";

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
  const [epicId, setEpicId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState({ text: "", type: "" });
  const [showSuggestionsForm, setShowSuggestionsForm] = useState(false);
  const [showReviewHistory, setShowReviewHistory] = useState(false);

  // Due Date Extension Request & Review States
  const [isExtensionModalOpen, setIsExtensionModalOpen] = useState(false);
  const [isReviewExtensionModalOpen, setIsReviewExtensionModalOpen] = useState(false);
  const [extensionStatus, setExtensionStatus] = useState(task?.extension_status || null);

  // Suggestions / Revision Form States
  const [suggestionNotes, setSuggestionNotes] = useState("");

  const [activeScreenshotModal, setActiveScreenshotModal] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [internalSprints, setInternalSprints] = useState([]);
  const [internalEpics, setInternalEpics] = useState([]);

  const [reviewComments, setReviewComments] = useState("");
  const [reviewAttachments, setReviewAttachments] = useState([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const fileInputRef = useRef(null);

  // Permissions
  const cleanRole = (employeeProfile?.role || "").toLowerCase().replace(/[\s_-]+/g, "");
  const isOwnerOrAdmin = cleanRole.includes("admin") || cleanRole.includes("owner") || cleanRole.includes("hr");
  const isProjectOwnerOrCreator = project?.owner_id === employeeProfile?.id || project?.created_by === employeeProfile?.id;
  const isAssignedLead = project?.team_lead_id === employeeProfile?.id;
  const isManagerRole = cleanRole.includes("manager") || cleanRole.includes("lead");
  const canReviewTask = isOwnerOrAdmin || isProjectOwnerOrCreator || isAssignedLead || isManagerRole;
  const canEditManagementFields = canReviewTask;

  const isAssignedToMe = Boolean(
    (employeeProfile?.id && (
      task?.assigned_to === employeeProfile.id ||
      task?.assignee_id === employeeProfile.id ||
      task?.planned_assignee_id === employeeProfile.id ||
      task?.assignee?.id === employeeProfile.id ||
      task?.planned_assignee?.id === employeeProfile.id
    )) ||
    (currentUserId && (
      task?.assigned_to === currentUserId ||
      task?.assignee_id === currentUserId ||
      task?.planned_assignee_id === currentUserId ||
      task?.assignee?.id === currentUserId ||
      task?.planned_assignee?.id === currentUserId
    )) ||
    (employeeProfile?.auth_user_id && (
      task?.assigned_to === employeeProfile.auth_user_id ||
      task?.assignee_id === employeeProfile.auth_user_id ||
      task?.planned_assignee_id === employeeProfile.auth_user_id
    ))
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  // Upload screenshot proofs to public bucket 'task-attachments'
  const processImageFiles = useCallback(
    async (files) => {
      const fileList = Array.from(files);
      for (const file of fileList) {
        if (!file.type.startsWith("image/")) {
          setFeedbackMsg({ text: "Please upload image files only (PNG, JPG, WebP, GIF).", type: "warning" });
          continue;
        }
        if (file.size > 15 * 1024 * 1024) {
          setFeedbackMsg({ text: "Image size exceeds 15MB limit.", type: "warning" });
          continue;
        }

        const tempId = `att-temp-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        const previewUrl = URL.createObjectURL(file);

        setReviewAttachments((prev) => [
          ...prev,
          {
            id: tempId,
            name: file.name || `Screenshot-${new Date().toLocaleTimeString().replace(/:/g, "-")}.png`,
            size: `${(file.size / 1024).toFixed(1)} KB`,
            url: previewUrl,
            type: file.type,
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

  // Automatically fetch sprints and epics if not provided via props
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
            if (Array.isArray(data.sprints)) {
              setInternalSprints(data.sprints);
            }
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
            if (Array.isArray(data.epics)) {
              setInternalEpics(data.epics);
            }
          }
        } catch (e) {
          console.warn("TaskDetailModal epics fetch error:", e);
        }
      };
      fetchEpics();
    }
  }, [isOpen, task?.project_id, task?.project?.id, project?.id, sprints, epics]);

  // Fetch status history on open to get real-time lead/manager suggestions and review audit
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
        } else {
          const { data: fallbackData } = await supabase
            .from("task_status_history")
            .select("*")
            .eq("task_id", task.id)
            .order("created_at", { ascending: false });
          if (Array.isArray(fallbackData) && isSubscribed) {
            setHistoryItems(fallbackData);
          }
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

  // Unified list of all team members and assignees for quick lookup
  const allEmployees = useMemo(() => {
    const map = new Map();

    (externalAllEmployees || []).forEach((e) => {
      if (e?.id) map.set(e.id, e);
    });

    if (project?.teamLead?.id) {
      map.set(project.teamLead.id, { ...project.teamLead, roleTag: "Team Lead" });
    } else if (project?.team_lead_id) {
      const lead =
        (teamLeads || []).find((l) => l.id === project.team_lead_id) ||
        (departmentEmployees || []).find((e) => e.id === project.team_lead_id);
      if (lead) map.set(lead.id, { ...lead, roleTag: "Team Lead" });
    }

    if (project?.creator?.id) {
      map.set(project.creator.id, { ...project.creator, roleTag: "Project Owner" });
    } else if (project?.created_by || project?.owner_id) {
      const creatorId = project.created_by || project.owner_id;
      const creator =
        (departmentEmployees || []).find((e) => e.id === creatorId) ||
        (teamLeads || []).find((l) => l.id === creatorId);
      if (creator) map.set(creator.id, { ...creator, roleTag: "Project Owner" });
    }

    if (Array.isArray(project?.teamMembers)) {
      project.teamMembers.forEach((m) => {
        if (m?.id && !map.has(m.id)) {
          map.set(m.id, {
            ...m,
            roleTag: project?.project_group ? project.project_group : (m.designation || m.role || "Squad Member"),
          });
        }
      });
    }

    if (Array.isArray(project?.team_members)) {
      project.team_members.forEach((id) => {
        const cleanId = typeof id === "object" ? id?.id : id;
        if (cleanId && !map.has(cleanId)) {
          const emp =
            (typeof id === "object" ? id : null) ||
            (departmentEmployees || []).find((e) => e.id === cleanId) ||
            (teamLeads || []).find((l) => l.id === cleanId);
          if (emp) {
            map.set(cleanId, {
              ...emp,
              roleTag: project?.project_group ? project.project_group : (emp.designation || emp.role || "Squad Member"),
            });
          }
        }
      });
    }

    const rawAssigneeId = task?.assigned_to || task?.planned_assignee_id || task?.assignee_id;
    if (task?.assignee?.id) {
      map.set(task.assignee.id, { ...task.assignee, roleTag: "Current Assignee" });
    } else if (task?.planned_assignee?.id) {
      map.set(task.planned_assignee.id, { ...task.planned_assignee, roleTag: "Current Assignee" });
    } else if (rawAssigneeId && !map.has(rawAssigneeId)) {
      const foundInPool = (departmentEmployees || []).find((e) => e.id === rawAssigneeId) || (teamLeads || []).find((l) => l.id === rawAssigneeId);
      map.set(rawAssigneeId, {
        id: rawAssigneeId,
        full_name: foundInPool?.full_name || "Assigned Employee",
        designation: foundInPool?.designation || "",
        roleTag: "Current Assignee",
      });
    }

    return Array.from(map.values()).sort((a, b) =>
      (a.full_name || "").localeCompare(b.full_name || "")
    );
  }, [project, departmentEmployees, teamLeads, externalAllEmployees, task]);

  // Strict Project Squad Filter for Assignee dropdown (Excludes Team Lead and Manager)
  const assignableProjectEmployees = useMemo(() => {
    const map = new Map();
    const sourcePool = Array.isArray(externalAllEmployees) && externalAllEmployees.length > 0
      ? externalAllEmployees
      : (Array.isArray(departmentEmployees) ? departmentEmployees : []);

    const leadId = project?.teamLead?.id || project?.team_lead_id;
    const ownerId = project?.creator?.id || project?.owner_id || project?.created_by;

    const isLeadOrManager = (emp) => {
      if (!emp) return false;
      if (emp.id === leadId || emp.id === ownerId) return true;
      const normalizedRole = (emp.role || "").toLowerCase().replace(/[\s_-]+/g, "");
      return (
        normalizedRole === "teamlead" ||
        normalizedRole === "manager" ||
        normalizedRole === "admin" ||
        normalizedRole === "hrmanager"
      );
    };

    // 1. Explicit Team Members (from project.teamMembers)
    if (Array.isArray(project?.teamMembers)) {
      project.teamMembers.forEach((m) => {
        if (m?.id && !isLeadOrManager(m) && !map.has(m.id)) {
          map.set(m.id, m);
        }
      });
    }

    // 2. Explicit Team Members (from project.team_members IDs or objects)
    if (Array.isArray(project?.team_members)) {
      project.team_members.forEach((memberId) => {
        const cleanId = typeof memberId === "object" ? memberId?.id : memberId;
        if (cleanId && !map.has(cleanId)) {
          const emp = typeof memberId === "object" ? memberId : sourcePool.find((e) => e.id === cleanId);
          if (emp && !isLeadOrManager(emp)) {
            map.set(cleanId, emp);
          }
        }
      });
    }

    // Fallback: If no explicit members in team list, check sourcePool for employees with matching department/group
    if (map.size === 0 && Array.isArray(sourcePool)) {
      sourcePool.forEach((emp) => {
        if (emp?.id && !isLeadOrManager(emp)) {
          const empRole = (emp.role || "").toLowerCase();
          if (empRole === "employee" || !empRole) {
            map.set(emp.id, emp);
          }
        }
      });
    }

    // If the task has an existing assignee who is not yet in map, ensure they can still be selected
    const currentAssigneeId = task?.assigned_to || task?.planned_assignee_id || task?.assignee_id;
    if (currentAssigneeId && !map.has(currentAssigneeId)) {
      const existingEmp = sourcePool.find((e) => e.id === currentAssigneeId) || (task.assignee?.id ? task.assignee : null);
      if (existingEmp) {
        map.set(currentAssigneeId, existingEmp);
      }
    }

    return Array.from(map.values()).sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
  }, [project, externalAllEmployees, departmentEmployees, task]);

  // Deep extract deliverable metadata & screenshot attachments (Current Review)
  const deliverableData = useMemo(() => {
    let attachments = [];
    let comments = "";
    let submittedAt = task?.review_submitted_at || null;
    let submittedBy = task?.review_submitted_by || null;

    if (task?.review_attachments) {
      if (Array.isArray(task.review_attachments)) {
        attachments = task.review_attachments;
      } else if (typeof task.review_attachments === "string") {
        try {
          const parsed = JSON.parse(task.review_attachments);
          if (Array.isArray(parsed)) attachments = parsed;
        } catch {}
      }
    }

    const searchFields = [
      task?.review_comments,
      task?.comments,
      task?.last_status_comment,
      task?.description,
      ...historyItems.map((h) => h.comments),
    ];

    for (const field of searchFields) {
      if (typeof field === "string" && field.includes("<!--DELIVERABLE_PAYLOAD:")) {
        try {
          const match = field.match(/<!--DELIVERABLE_PAYLOAD:([\s\S]*?)-->/);
          if (match && match[1]) {
            const parsed = JSON.parse(match[1]);
            if (parsed.comments && !comments) comments = parsed.comments;
            if (Array.isArray(parsed.attachments) && attachments.length === 0) {
              attachments = parsed.attachments;
            }
            if (parsed.submitted_at && !submittedAt) submittedAt = parsed.submitted_at;
            if (parsed.submitted_by && !submittedBy) submittedBy = parsed.submitted_by;
          }
        } catch (e) {
          console.warn("Payload parse warning in TaskDetailModal:", e);
        }
      }
    }

    if (!comments) {
      const rawDirect = task?.review_comments || task?.comments || task?.last_status_comment || "";
      const cleaned = rawDirect.replace(/<!--DELIVERABLE_PAYLOAD:[\s\S]*?-->/g, "").trim();
      if (
        cleaned &&
        !cleaned.startsWith("[Team Lead") &&
        !cleaned.startsWith("[Scope Revision") &&
        !cleaned.startsWith("[QA Defect")
      ) {
        comments = cleaned;
      }
    }

    const normalizedAttachments = (attachments || []).map((att, idx) => {
      if (typeof att === "string") {
        return {
          id: `deliv-att-${idx}-${Date.now()}`,
          name: `Screenshot ${idx + 1}`,
          dataUrl: att,
          size: "Optimized",
        };
      }
      return {
        ...att,
        id: att?.id || `deliv-att-${idx}-${Date.now()}`,
        name: att?.name || `Screenshot ${idx + 1}`,
        dataUrl: att?.dataUrl || att?.url || "",
      };
    });

    return {
      attachments: normalizedAttachments,
      comments: comments || "No detailed submission comments provided.",
      submittedAt: submittedAt || task?.updated_at || null,
      submittedBy,
    };
  }, [task, historyItems]);

  // Extract Team Lead / Manager Suggestions & Review Feedback (Before Review records)
  const teamLeadSuggestion = useMemo(() => {
    const resolveEmp = (empId) => {
      if (!empId) return null;
      return (
        allEmployees.find((e) => e.id === empId) ||
        (departmentEmployees || []).find((e) => e.id === empId) ||
        (teamLeads || []).find((l) => l.id === empId) ||
        null
      );
    };

    if (task?.review_feedback && typeof task.review_feedback === "string" && task.review_feedback.trim().length > 0) {
      const reviewerEmp = task.review_feedback_lead || resolveEmp(task.review_feedback_by) || project?.creator || project?.teamLead;
      return {
        text: task.review_feedback.trim(),
        leadName: reviewerEmp?.full_name || project?.team_lead_name || "Reviewer",
        timestamp: task.review_feedback_at || task.updated_at || null,
      };
    }

    const candidates = [
      task?.comments,
      task?.last_status_comment,
      task?.review_comments,
      ...historyItems.map((h) => h.comments),
    ].filter((c) => typeof c === "string" && c.trim().length > 0);

    const prefixes = [
      "[Team Lead Suggestions]:",
      "[Team Lead Revision Feedback]:",
      "[Scope Revision Instructions]:",
      "[QA Defect / Bug Report]:",
      "[Team Lead Review]:",
      "[Review Feedback]:",
      "[Manager Suggestions]:",
    ];

    for (const raw of candidates) {
      for (const prefix of prefixes) {
        if (raw.includes(prefix)) {
          const text = raw.substring(raw.indexOf(prefix) + prefix.length).trim();
          const cleaned = text.replace(/<!--DELIVERABLE_PAYLOAD:[\s\S]*?-->/g, "").trim();
          if (cleaned) {
            const matchingHistory = historyItems.find((h) => h.comments === raw);
            const historyLeadName = matchingHistory?.changed_by_employee?.full_name || resolveEmp(matchingHistory?.changed_by)?.full_name;
            const fallbackEmp = project?.creator || project?.teamLead || (teamLeads || []).find((l) => l.id === project?.team_lead_id);
            return {
              text: cleaned,
              leadName: historyLeadName || fallbackEmp?.full_name || project?.team_lead_name || "Reviewer",
              timestamp: matchingHistory?.created_at || task?.updated_at || null,
            };
          }
        }
      }
    }

    for (const h of historyItems) {
      if ((h.old_status === "REVIEW" || h.new_status === "TODO") && h.comments) {
        const cleaned = h.comments.replace(/<!--DELIVERABLE_PAYLOAD:[\s\S]*?-->/g, "").trim();
        if (
          cleaned &&
          cleaned !== "No detailed submission comments provided." &&
          !cleaned.startsWith("Status changed to") &&
          !cleaned.startsWith("Created item") &&
          !cleaned.startsWith("Deliverable submitted")
        ) {
          const emp = h.changed_by_employee || resolveEmp(h.changed_by) || project?.creator || project?.teamLead;
          return {
            text: cleaned,
            leadName: emp?.full_name || project?.team_lead_name || "Reviewer",
            timestamp: h.created_at || task?.updated_at || null,
          };
        }
      }
    }

    return null;
  }, [task, project, teamLeads, historyItems, allEmployees, departmentEmployees]);

  // Extract Review History timeline iterations (Before Review records)
  const reviewHistoryIterations = useMemo(() => {
    const list = [];
    (historyItems || []).forEach((item) => {
      let isReviewEvent = false;
      let reviewPayload = null;
      let suggestionText = "";

      if (item.comments && typeof item.comments === "string") {
        if (item.comments.includes("<!--DELIVERABLE_PAYLOAD:")) {
          try {
            const match = item.comments.match(/<!--DELIVERABLE_PAYLOAD:([\s\S]*?)-->/);
            if (match && match[1]) {
              reviewPayload = JSON.parse(match[1]);
              isReviewEvent = true;
            }
          } catch {}
        }
        if (item.comments.includes("[Team Lead Suggestions]:")) {
          suggestionText = item.comments.replace("[Team Lead Suggestions]:", "").replace(/<!--DELIVERABLE_PAYLOAD:[\s\S]*?-->/g, "").trim();
          isReviewEvent = true;
        }
      }

      if (
        item.old_status === "REVIEW" ||
        item.new_status === "REVIEW" ||
        item.new_status === "COMPLETED" ||
        isReviewEvent
      ) {
        list.push({
          id: item.id,
          createdAt: item.created_at,
          oldStatus: item.old_status,
          newStatus: item.new_status,
          changedBy: item.changed_by_employee?.full_name || "Team Member",
          changedByRole: item.changed_by_employee?.role || item.changed_by_employee?.designation || "",
          comments: item.comments ? item.comments.replace(/<!--DELIVERABLE_PAYLOAD:[\s\S]*?-->/g, "").trim() : "",
          reviewPayload,
          suggestionText,
        });
      }
    });
    return list;
  }, [historyItems]);

  const isKanban = (project?.project_type || "").toLowerCase() === "kanban";

  // Effective unified sprints & epics
  const effectiveSprints = useMemo(() => {
    const list = Array.isArray(sprints) && sprints.length > 0 ? sprints : internalSprints;
    const map = new Map();
    list.forEach((s) => {
      if (s?.id) map.set(s.id, s);
    });
    if (task?.sprint && typeof task.sprint === "object" && task.sprint.id) {
      map.set(task.sprint.id, {
        ...task.sprint,
        name: task.sprint.name || "Active Sprint",
        status: task.sprint.status || "ACTIVE",
      });
    } else if (task?.sprint_id && task?.sprint_name) {
      map.set(task.sprint_id, {
        id: task.sprint_id,
        name: task.sprint_name,
        status: task.sprint_status || "ACTIVE",
      });
    }
    return Array.from(map.values());
  }, [sprints, internalSprints, task?.sprint, task?.sprint_id, task?.sprint_name, task?.sprint_status]);

  const effectiveEpics = useMemo(() => {
    const list = Array.isArray(epics) && epics.length > 0 ? epics : internalEpics;
    const map = new Map();
    list.forEach((e) => {
      if (e?.id) map.set(e.id, e);
    });
    if (task?.epic && typeof task.epic === "object" && task.epic.id) {
      map.set(task.epic.id, {
        ...task.epic,
        name: task.epic.name || "Epic",
        color: task.epic.color || "#6366f1",
      });
    } else if (task?.epic_id && task?.epic_name) {
      map.set(task.epic_id, {
        id: task.epic_id,
        name: task.epic_name,
        color: task.epic_color || "#6366f1",
      });
    }
    return Array.from(map.values());
  }, [epics, internalEpics, task?.epic, task?.epic_id, task?.epic_name, task?.epic_color]);

  const currentSprint = useMemo(() => {
    const effectiveSprintId =
      sprintId ||
      task?.sprint_id ||
      (typeof task?.sprint === "object" ? task?.sprint?.id : task?.sprint);
    return effectiveSprints.find((s) => s.id === effectiveSprintId) || task?.sprint || null;
  }, [effectiveSprints, sprintId, task?.sprint_id, task?.sprint]);

  const userRoleCategory = useMemo(() => {
    return getTaskPermissionRole(employeeProfile?.role, employeeProfile, project);
  }, [employeeProfile, project]);

  const isSprintActive = Boolean(
    isKanban || (currentSprint && String(currentSprint.status).toUpperCase() === "ACTIVE")
  );
  const isStatusLockedForEmployee = !isSprintActive && !canReviewTask;

  const currentTaskNormStatus = normalizeTaskStatus(task?.status || "TODO");
  const isTaskInReview = currentTaskNormStatus === "REVIEW";
  const isTaskCompleted = currentTaskNormStatus === "COMPLETED";

  // Role transition rules:
  // 1. Regular employees cannot change status if task is COMPLETED or REVIEW
  // 2. Managers/Leads oversee active development tasks; review actions are enabled once deliverables are submitted
  const isCompletedLockedForEmployee = userRoleCategory === "EMPLOYEE" && isTaskCompleted;
  const isInReviewLockedForEmployee = userRoleCategory === "EMPLOYEE" && isTaskInReview;
  const isManagerInDevLocked = userRoleCategory !== "EMPLOYEE" && (currentTaskNormStatus === "TODO" || currentTaskNormStatus === "IN_PROGRESS");
  const isStatusSelectDisabled = isStatusLockedForEmployee || isCompletedLockedForEmployee || isInReviewLockedForEmployee || isManagerInDevLocked;


  // Available status choices based on role matrix
  const availableStatuses = useMemo(() => {
    const cur = normalizeTaskStatus(task?.status || "TODO");
    const allowed = TASK_STATUS_TRANSITIONS[userRoleCategory]?.[cur] || [];
    const set = new Set([cur, ...allowed]);
    return Array.from(set);
  }, [userRoleCategory, task?.status]);

  // Submitter Name Extraction
  const submitterName = useMemo(() => {
    if (deliverableData.submittedBy) {
      const foundEmp = allEmployees.find((e) => e.id === deliverableData.submittedBy);
      if (foundEmp?.full_name) return foundEmp.full_name;
    }
    return task?.assignee?.full_name || task?.planned_assignee?.full_name || "Assigned Developer";
  }, [deliverableData.submittedBy, allEmployees, task?.assignee, task?.planned_assignee]);

  // Reviewer Name & Decision Extraction (Shown when Done / Reviewed / In Review)
  const reviewerData = useMemo(() => {
    const resolveEmp = (empId) => {
      if (!empId) return null;
      return (
        allEmployees.find((e) => e.id === empId) ||
        (departmentEmployees || []).find((e) => e.id === empId) ||
        (teamLeads || []).find((l) => l.id === empId) ||
        null
      );
    };

    // 1. Look for approval/completion history event (REVIEW -> COMPLETED or new_status === COMPLETED)
    const approvalEvent = (historyItems || []).find(
      (h) =>
        (h.new_status === "COMPLETED" || (h.old_status === "REVIEW" && h.new_status === "COMPLETED") || (h.comments && h.comments.toLowerCase().includes("approved"))) &&
        (h.changed_by_employee?.full_name || h.changed_by || (h.comments && h.comments.includes("Approved and marked completed by ")))
    );

    if (approvalEvent) {
      const emp = approvalEvent.changed_by_employee || resolveEmp(approvalEvent.changed_by);
      let reviewerName = emp?.full_name;
      if (!reviewerName && approvalEvent.comments && approvalEvent.comments.includes("Approved and marked completed by ")) {
        reviewerName = approvalEvent.comments.replace("Approved and marked completed by ", "").trim();
      }

      if (reviewerName) {
        const rawRole = emp?.role || emp?.designation || "";
        const roleLabel = rawRole.toLowerCase().includes("manager")
          ? "Project Manager"
          : rawRole.toLowerCase().includes("lead")
          ? "Team Lead"
          : rawRole.toLowerCase().includes("admin")
          ? "Admin"
          : "Reviewer";

        return {
          reviewerName,
          reviewerRole: roleLabel,
          reviewedAt: approvalEvent.created_at || task?.completed_at || task?.updated_at,
          decision: "Approved (100%)",
          isApproved: true,
          isPending: false,
        };
      }
    }

    // 2. Look for review suggestion/rework event
    const suggestionEvent = (historyItems || []).find(
      (h) => (h.old_status === "REVIEW" && h.new_status === "TODO") || (h.comments && (h.comments.includes("[Team Lead Suggestions]:") || h.comments.includes("[Review Feedback")))
    );

    if (suggestionEvent && (suggestionEvent.changed_by_employee?.full_name || suggestionEvent.changed_by)) {
      const emp = suggestionEvent.changed_by_employee || resolveEmp(suggestionEvent.changed_by);
      const name = emp?.full_name || "Team Lead";
      const rawRole = emp?.role || emp?.designation || "";
      const roleLabel = rawRole.toLowerCase().includes("manager") ? "Project Manager" : "Team Lead";
      return {
        reviewerName: name,
        reviewerRole: roleLabel,
        reviewedAt: suggestionEvent.created_at,
        decision: "Suggestions Given (Rework)",
        isApproved: false,
        isPending: false,
      };
    }

    // 3. Direct task properties if populated on completed task
    if (isTaskCompleted) {
      if (task?.reviewed_by_name || task?.approved_by_name) {
        const revId = task?.reviewed_by || task?.approved_by;
        const revEmp = resolveEmp(revId);
        const rawRole = revEmp?.role || revEmp?.designation || "";
        const roleLabel = rawRole.toLowerCase().includes("manager")
          ? "Project Manager"
          : rawRole.toLowerCase().includes("lead")
          ? "Team Lead"
          : "Reviewer";

        return {
          reviewerName: task.reviewed_by_name || task.approved_by_name,
          reviewerRole: roleLabel,
          reviewedAt: task.reviewed_at || task.approved_at || task.completed_at || task.updated_at,
          decision: "Approved (100%)",
          isApproved: true,
          isPending: false,
        };
      }

      if (task?.reviewer?.full_name || task?.approver?.full_name) {
        const rev = task.reviewer || task.approver;
        const rawRole = rev?.role || rev?.designation || "";
        const roleLabel = rawRole.toLowerCase().includes("manager")
          ? "Project Manager"
          : rawRole.toLowerCase().includes("lead")
          ? "Team Lead"
          : "Reviewer";

        return {
          reviewerName: rev.full_name,
          reviewerRole: roleLabel,
          reviewedAt: task.reviewed_at || task.approved_at || task.completed_at || task.updated_at,
          decision: "Approved (100%)",
          isApproved: true,
          isPending: false,
        };
      }

      const revById = task?.reviewed_by || task?.approved_by || task?.completed_by;
      if (revById) {
        const emp = resolveEmp(revById);
        if (emp?.full_name) {
          const rawRole = emp.role || emp.designation || "";
          const roleLabel = rawRole.toLowerCase().includes("manager")
            ? "Project Manager"
            : rawRole.toLowerCase().includes("lead")
            ? "Team Lead"
            : "Reviewer";

          return {
            reviewerName: emp.full_name,
            reviewerRole: roleLabel,
            reviewedAt: task.reviewed_at || task.approved_at || task.completed_at || task.updated_at,
            decision: "Approved (100%)",
            isApproved: true,
            isPending: false,
          };
        }
      }

      if (task?.review_feedback_lead?.full_name) {
        return {
          reviewerName: task.review_feedback_lead.full_name,
          reviewerRole: "Team Lead",
          reviewedAt: task.review_feedback_at || task.updated_at,
          decision: "Approved (100%)",
          isApproved: true,
          isPending: false,
        };
      }

      // Check project creator/owner (Project Manager)
      if (project?.creator?.full_name) {
        return {
          reviewerName: project.creator.full_name,
          reviewerRole: "Project Manager",
          reviewedAt: task?.completed_at || task?.updated_at,
          decision: "Approved (100%)",
          isApproved: true,
          isPending: false,
        };
      }

      // Fallback to project team lead if available
      const lead = project?.teamLead || (teamLeads || []).find((l) => l.id === project?.team_lead_id);
      if (lead?.full_name) {
        return {
          reviewerName: lead.full_name,
          reviewerRole: "Team Lead",
          reviewedAt: task?.completed_at || task?.updated_at,
          decision: "Approved (100%)",
          isApproved: true,
          isPending: false,
        };
      }
    }

    // 4. If task is in review (Pending Review):
    // Both Project Manager and Team Lead can review it, so indicate "Pending Review"
    if (isTaskInReview) {
      return {
        reviewerName: "Pending Review",
        reviewerRole: "Team Lead / Project Manager",
        reviewedAt: null,
        decision: "Pending Review",
        isApproved: false,
        isPending: true,
      };
    }

    return null;
  }, [historyItems, task, isTaskCompleted, isTaskInReview, project, teamLeads, allEmployees, departmentEmployees]);

  // Sync state whenever task changes or modal opens
  useEffect(() => {
    if (task && isOpen) {
      // Default to REVIEW_TASK tab if task is in review, otherwise TASK_DETAILS
      if (task.status === "REVIEW") {
        setActiveTab("REVIEW_TASK");
      } else {
        setActiveTab("TASK_DETAILS");
      }

      setTitle(task.title || "");
      setDescription(task.description || "");
      const currentAssignee =
        task.assigned_to || task.planned_assignee_id || task.assignee_id || "";
      setAssigneeId(currentAssignee);
      const initialSprintId =
        task.sprint_id ||
        (typeof task.sprint === "object" ? task.sprint?.id : task.sprint) ||
        "";
      const initialEpicId =
        task.epic_id ||
        (typeof task.epic === "object" ? task.epic?.id : task.epic) ||
        "";
      setSprintId(initialSprintId);
      setStatus(task.status || "TODO");
      setPriority(task.priority || "MEDIUM");
      setStoryPoints(task.story_points || 1);
      setEpicId(initialEpicId);
      setDueDate(task.due_date ? task.due_date.split("T")[0] : "");
      setFeedbackMsg({ text: "", type: "" });
      setShowSuggestionsForm(false);
      setExtensionStatus(task.extension_status || null);

      setSuggestionNotes("");

      const existingComments =
        deliverableData.comments && deliverableData.comments !== "No detailed submission comments provided."
          ? deliverableData.comments
          : "";
      setReviewComments(existingComments);
      setReviewAttachments(deliverableData.attachments || []);
    }
  }, [task, isOpen, deliverableData]);

  // Handle Clipboard Paste for direct screenshot pasting (Ctrl+V)
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e) => {
      const targetTag = e.target?.tagName?.toLowerCase();
      if (targetTag === "input" && e.target?.type === "text") return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            processImageFiles([file]);
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [isOpen, processImageFiles]);

  // Keyboard shortcut Esc to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        if (activeScreenshotModal) {
          setActiveScreenshotModal(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose, activeScreenshotModal]);

  const selectedSprint = useMemo(() => {
    if (isKanban) return null;
    const effectiveSprintId = sprintId || task?.sprint_id;
    return effectiveSprints.find((s) => s.id === effectiveSprintId) || task?.sprint || null;
  }, [effectiveSprints, sprintId, task?.sprint_id, task?.sprint, isKanban]);

  const sprintMinDate = useMemo(() => {
    return selectedSprint?.start_date ? selectedSprint.start_date.split("T")[0] : "";
  }, [selectedSprint]);

  const sprintMaxDate = useMemo(() => {
    return selectedSprint?.end_date ? selectedSprint.end_date.split("T")[0] : "";
  }, [selectedSprint]);

  const handleSprintChange = (newSprintId) => {
    setSprintId(newSprintId);
    if (!newSprintId) return;

    const targetSprint = effectiveSprints.find((s) => s.id === newSprintId);
    if (targetSprint) {
      const minD = targetSprint.start_date ? targetSprint.start_date.split("T")[0] : "";
      const maxD = targetSprint.end_date ? targetSprint.end_date.split("T")[0] : "";

      if (!dueDate || (minD && dueDate < minD) || (maxD && dueDate > maxD)) {
        setDueDate(maxD || minD || "");
      }
    }
  };

  const dateValidation = useMemo(() => {
    if (isKanban) return { isValid: true, error: "" };
    return validateTaskSprintBounds(dueDate, selectedSprint);
  }, [dueDate, selectedSprint, isKanban]);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processImageFiles(e.target.files);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processImageFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveAttachment = (id) => {
    setReviewAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!title.trim()) {
      setFeedbackMsg({ text: "Please enter a task title.", type: "error" });
      return;
    }

    if (!dateValidation.isValid) {
      setFeedbackMsg({
        text: dateValidation.error || "Please select a due date within the sprint week.",
        type: "error",
      });
      return;
    }

    setIsSubmitting(true);
    setFeedbackMsg({ text: "", type: "" });

    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        priority,
        story_points: Number(storyPoints) || 1,
        assigned_to: assigneeId || null,
        assignee_id: assigneeId || null,
        sprint_id: sprintId || null,
        epic_id: epicId || null,
        due_date: dueDate || null,
      };

      if (status && status !== task.status) {
        const normStatus = normalizeTaskStatus(status);
        if (!isTaskStatusTransitionAllowed(userRoleCategory, task.status, normStatus)) {
          if (normStatus === "COMPLETED" && userRoleCategory === "EMPLOYEE") {
            setFeedbackMsg({
              text: "Deliverable Approval Required: Only the Project Manager or Team Lead can mark this task as Completed after reviewing the deliverable. Please submit for Review.",
              type: "warning",
            });
            setTimeout(() => setFeedbackMsg({ text: "", type: "" }), 3000);
            setIsSubmitting(false);
            return;
          }
          if (task.status === "COMPLETED" && userRoleCategory === "EMPLOYEE") {
            setFeedbackMsg({
              text: "Action Blocked: Completed tasks are locked and cannot be reopened by employees.",
              type: "error",
            });
            setTimeout(() => setFeedbackMsg({ text: "", type: "" }), 3000);
            setIsSubmitting(false);
            return;
          }
          setFeedbackMsg({
            text: `Invalid transition: Changing from ${task.status} to ${normStatus} is not permitted for your role.`,
            type: "error",
          });
          setTimeout(() => setFeedbackMsg({ text: "", type: "" }), 3000);
          setIsSubmitting(false);
          return;
        }

        if (isStatusLockedForEmployee) {
          setFeedbackMsg({
            text: `Cannot update status: ${currentSprint ? `Sprint "${currentSprint.name}" is not active yet` : "Task is in Backlog (Sprint not started)"}`,
            type: "warning",
          });
          setTimeout(() => setFeedbackMsg({ text: "", type: "" }), 2500);
          setIsSubmitting(false);
          return;
        }
        payload.status = normStatus;
      }


      if (status === "REVIEW" || payload.status === "REVIEW" || reviewComments.trim() || reviewAttachments.length > 0) {
        if (uploadingCount > 0) {
          setFeedbackMsg({ text: "Please wait for screenshots to finish uploading.", type: "warning" });
          setIsSubmitting(false);
          return;
        }
        if (status === "REVIEW" || payload.status === "REVIEW") {
          payload.status = "REVIEW";
        }
        payload.review_comments = reviewComments.trim();
        payload.comments = reviewComments.trim();
        payload.review_attachments = reviewAttachments.map((a) => ({
          id: a.id,
          name: a.name,
          size: a.size,
          url: a.url || a.dataUrl || (typeof a === "string" ? a : ""),
          type: a.type || "image/png",
        }));
        payload.review_submitted_at = new Date().toISOString();
      }

      const res = await authFetch(`/api/projects/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("project-task-updated", {
              detail: { taskId: task.id, status: payload.status || task.status, new: data.task, project_id: project?.id },
            })
          );
        }
        if (onTaskUpdated) onTaskUpdated();
        onClose();
      } else {
        setFeedbackMsg({
          text: data.message || "Failed to update task.",
          type: data.code === "SPRINT_NOT_STARTED" ? "warning" : "error",
        });
        setTimeout(() => setFeedbackMsg({ text: "", type: "" }), 2500);
      }
    } catch (err) {
      console.error("Update task error:", err);
      setFeedbackMsg({
        text: "Network error updating task. Please try again.",
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproveReview = async () => {
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
        }),
      });

      const data = await res.json();
      if (res.ok) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("project-task-updated", {
              detail: { taskId: task.id, status: "COMPLETED", new: data.task, project_id: project?.id },
            })
          );
        }
        if (onTaskUpdated) onTaskUpdated();
        onClose();
      } else {
        setFeedbackMsg({
          text: data.message || "Failed to approve deliverable.",
          type: "error",
        });
      }
    } catch (err) {
      console.error("Approve review error:", err);
      setFeedbackMsg({
        text: "Network error approving deliverable.",
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitSuggestions = async () => {
    if (!suggestionNotes.trim()) {
      setFeedbackMsg({
        text: "Please provide suggestions or instructions for the employee.",
        type: "error",
      });
      return;
    }

    setIsSubmitting(true);
    setFeedbackMsg({ text: "", type: "" });
    try {
      const reviewerFullName = employeeProfile?.full_name || "Reviewer";
      const payload = {
        status: "TODO",
        progress: 0,
        title: title.trim() || task.title,
        priority: priority || "MEDIUM",
        assigned_to: assigneeId || task.assigned_to || null,
        assignee_id: assigneeId || task.assigned_to || null,
        review_feedback: suggestionNotes.trim(),
        review_feedback_by: employeeProfile?.id || null,
        comments: `[Review Suggestions by ${reviewerFullName}]: ${suggestionNotes.trim()}`,
      };

      const res = await authFetch(`/api/projects/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("project-task-updated", {
              detail: { taskId: task.id, status: "TODO", new: data.task, project_id: project?.id },
            })
          );
        }
        if (onTaskUpdated) onTaskUpdated();
        onClose();
      } else {
        setFeedbackMsg({
          text: data.message || "Failed to submit suggestions.",
          type: "error",
        });
      }
    } catch (err) {
      console.error("Suggestions submit error:", err);
      setFeedbackMsg({
        text: "Network error submitting suggestions.",
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartWorking = async () => {
    setIsSubmitting(true);
    try {
      const res = await authFetch(`/api/projects/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "IN_PROGRESS" }),
      });
      if (res.ok) {
        if (onTaskUpdated) onTaskUpdated();
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !task || !mounted) return null;

  const modalContent = (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn overflow-y-auto"
    >
      <div className="relative w-full max-w-xl bg-white rounded-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-scaleIn m-auto my-auto">
        {/* Top Header strictly matching Add Task format with 2 Features: Task Details & Review Task */}
        <div className="px-6 pt-4 pb-2.5 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-3 text-base">
            <span className="font-bold text-slate-900 text-sm">Update:</span>
            <div className="flex items-center gap-4 text-sm">
              <button
                type="button"
                onClick={() => setActiveTab("TASK_DETAILS")}
                className={`transition-colors cursor-pointer pb-0.5 ${
                  activeTab === "TASK_DETAILS"
                    ? "text-blue-600 font-semibold border-b-2 border-blue-600"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Task Details
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("REVIEW_TASK")}
                className={`transition-colors cursor-pointer pb-0.5 flex items-center gap-1.5 ${
                  activeTab === "REVIEW_TASK"
                    ? "text-blue-600 font-semibold border-b-2 border-blue-600"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>Review Task</span>
                {isTaskInReview && (
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block animate-pulse" title="Submitted for Review" />
                )}
              </button>
            </div>
          </div>

          {/* Red square close button */}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="w-6 h-6 border border-rose-300 hover:border-rose-400 text-rose-400 hover:text-rose-600 rounded flex items-center justify-center text-xs transition cursor-pointer disabled:opacity-50 shrink-0"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Unified Form Body */}
        <form onSubmit={handleSubmit} className="px-6 py-3 space-y-2.5 max-h-[85vh] overflow-y-auto">
          {/* Feedback Alert */}
          {feedbackMsg.text && (
            <div
              className={`p-2 rounded text-xs font-medium ${
                feedbackMsg.type === "error" || feedbackMsg.type === "warning"
                  ? "bg-rose-50 border border-rose-200 text-rose-700"
                  : "bg-emerald-50 border border-emerald-200 text-emerald-700"
              }`}
            >
              {feedbackMsg.text}
            </div>
          )}

          {/* ======================================================== */}
          {/* FEATURE TAB 1: TASK DETAILS                              */}
          {/* ======================================================== */}
          {activeTab === "TASK_DETAILS" && (
            <>
              {/* Section Header */}
              <div className="text-blue-600 font-semibold border-b border-blue-500 pb-0.5 text-xs pt-1">
                Task Details
              </div>

              {/* Row: Task Name with red underline indicator */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                <label className="sm:w-32 text-xs text-slate-700 font-medium shrink-0">
                  <span className="border-b-2 border-rose-500 pb-0.5">
                    Task Name
                  </span>
                </label>
                <div className="flex-1">
                  <input
                    type="text"
                    required
                    readOnly={!canEditManagementFields}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Implement employee attendance export"
                    className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-0.5 text-xs bg-transparent text-slate-900 transition-colors placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Row: Description */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1">
                <label className="sm:w-32 text-xs text-slate-700 font-medium shrink-0 pt-0.5">
                  Description
                </label>
                <div className="flex-1">
                  <textarea
                    rows={2}
                    readOnly={!canEditManagementFields}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional description or details…"
                    className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-0.5 text-xs bg-transparent text-slate-900 resize-none transition-colors placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Row: Status */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:items-center gap-2 pt-0.5">
                <label className="sm:w-32 text-xs text-slate-700 font-medium shrink-0">
                  Status
                </label>
                <div className="flex-1 space-y-1">
                  <div className="relative">
                    <select
                      value={status}
                      disabled={isStatusSelectDisabled}
                      onChange={(e) => setStatus(e.target.value)}
                      className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-0.5 text-xs bg-transparent text-slate-900 appearance-none pr-6 cursor-pointer disabled:opacity-60"
                    >
                      {availableStatuses.map((st) => {
                        const labels = {
                          TODO: "To Do",
                          IN_PROGRESS: "In Progress",
                          REVIEW: "In Review",
                          COMPLETED: "Completed",
                        };
                        return (
                          <option key={st} value={st}>
                            {labels[st] || st}
                          </option>
                        );
                      })}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center text-blue-600 text-xs">
                      ▼
                    </div>
                  </div>
                  {isCompletedLockedForEmployee && (
                    <div className="text-[10px] text-emerald-800 flex items-center gap-1 font-medium bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      <span>🔒</span>
                      <span>This deliverable is completed and finalized. Reopening is restricted to Team Leads &amp; Managers.</span>
                    </div>
                  )}
                  {isInReviewLockedForEmployee && (
                    <div className="text-[10px] text-purple-800 flex items-center gap-1 font-medium bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                      <span>⏳</span>
                      <span>Deliverable submitted for review. Awaiting Team Lead or Project Manager verification.</span>
                    </div>
                  )}
                  {isManagerInDevLocked && (
                    <div className="text-[10px] text-slate-600 flex items-center gap-1 font-medium bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                      <span>ℹ️</span>
                      <span>In active development by assigned developer. Review &amp; Approval actions become available once deliverables are submitted.</span>
                    </div>
                  )}

                </div>
              </div>


              {/* Row: Owner (Assignee) */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-0.5">
                <label className="sm:w-32 text-xs text-slate-700 font-medium shrink-0 pt-0.5">
                  Owner
                </label>
                <div className="flex-1 space-y-1">
                  <div className="relative">
                    <select
                      value={assigneeId}
                      disabled={!canEditManagementFields}
                      onChange={(e) => setAssigneeId(e.target.value)}
                      className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-0.5 text-xs bg-transparent text-slate-900 appearance-none pr-6 cursor-pointer disabled:opacity-60"
                    >
                      <option value="">Unassigned</option>
                      {assignableProjectEmployees.map((emp) => {
                        const roleLabel = emp.designation || (emp.role ? (emp.role.charAt(0).toUpperCase() + emp.role.slice(1).replace(/_/g, " ")) : "Employee");
                        return (
                          <option key={emp.id} value={emp.id}>
                            {emp.full_name} ({roleLabel})
                          </option>
                        );
                      })}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center text-blue-600 text-xs pb-0.5">
                      ▼
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500 flex items-start gap-1 pt-0.5 bg-slate-50/80 p-1.5 rounded border border-slate-100">
                    <span className="text-blue-600 font-semibold shrink-0">ℹ️ Note:</span>
                    <span>
                      Only members included in this project are shown. To assign tasks to other colleagues, first add them to this project via the <strong>Team</strong> tab.
                    </span>
                  </div>
                </div>
              </div>

              {/* Row: Sprint Allocation (Scrum / Custom Agile only) */}
              {!isKanban && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-0.5">
                  <label className="sm:w-32 text-xs text-slate-700 font-medium shrink-0">
                    Sprint
                  </label>
                  <div className="flex-1 relative">
                    <select
                      value={sprintId}
                      disabled={!canEditManagementFields}
                      onChange={(e) => handleSprintChange(e.target.value)}
                      className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-0.5 text-xs bg-transparent text-slate-900 appearance-none pr-6 cursor-pointer disabled:opacity-60"
                    >
                      <option value="">Backlog (Unscheduled)</option>
                      {effectiveSprints
                        .filter((s) => s.status !== "COMPLETED" || s.id === sprintId)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.status})
                          </option>
                        ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center text-blue-600 text-xs">
                      ▼
                    </div>
                  </div>
                </div>
              )}

              {/* Row: Priority */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-0.5">
                <label className="sm:w-32 text-xs text-slate-700 font-medium shrink-0">
                  Priority
                </label>
                <div className="flex-1 relative">
                  <select
                    value={priority}
                    disabled={!canEditManagementFields}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-0.5 text-xs bg-transparent text-slate-900 appearance-none pr-6 cursor-pointer disabled:opacity-60"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center text-blue-600 text-xs">
                    ▼
                  </div>
                </div>
              </div>

              {/* Row: Story Points */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-0.5">
                <label className="sm:w-32 text-xs text-slate-700 font-medium shrink-0">
                  Story Points
                </label>
                <div className="flex-1 relative">
                  <select
                    value={storyPoints}
                    disabled={!canEditManagementFields}
                    onChange={(e) => setStoryPoints(Number(e.target.value))}
                    className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-0.5 text-xs bg-transparent text-slate-900 appearance-none pr-6 cursor-pointer disabled:opacity-60"
                  >
                    {[1, 2, 3, 5, 8, 13, 21].map((pts) => (
                      <option key={pts} value={pts}>
                        {pts} {pts === 1 ? "point" : "points"}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center text-blue-600 text-xs">
                    ▼
                  </div>
                </div>
              </div>

              {/* Row: Epic */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-0.5">
                <label className="sm:w-32 text-xs text-slate-700 font-medium shrink-0">
                  Epic
                </label>
                <div className="flex-1 relative">
                  <select
                    value={epicId}
                    disabled={!canEditManagementFields}
                    onChange={(e) => setEpicId(e.target.value)}
                    className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-0.5 text-xs bg-transparent text-slate-900 appearance-none pr-6 cursor-pointer disabled:opacity-60"
                  >
                    <option value="">--None--</option>
                    {effectiveEpics.map((epic) => (
                      <option key={epic.id} value={epic.id}>
                        {epic.name}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center text-blue-600 text-xs">
                    ▼
                  </div>
                </div>
              </div>

              {/* Row: Due Date */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-0.5">
                <label className="sm:w-32 text-xs text-slate-700 font-medium shrink-0 pt-0.5">
                  Due Date
                </label>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      readOnly={!canEditManagementFields}
                      disabled={!canEditManagementFields}
                      min={sprintMinDate || undefined}
                      max={sprintMaxDate || undefined}
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="flex-1 border-b border-slate-300 focus:border-blue-600 outline-none pb-0.5 text-xs bg-transparent text-slate-900 disabled:opacity-60"
                    />
                    {!canEditManagementFields && task.status !== "COMPLETED" && extensionStatus !== "PENDING" && (
                      <button
                        type="button"
                        onClick={() => setIsExtensionModalOpen(true)}
                        className="px-2.5 py-0.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium transition cursor-pointer shrink-0"
                      >
                        Request Extension
                      </button>
                    )}
                  </div>
                  {selectedSprint && (
                    <p className="text-[10px] text-blue-700 font-medium pt-0.5">
                      Locked to sprint window: {sprintMinDate || "Start"} to {sprintMaxDate || "End"}
                    </p>
                  )}
                  {!dateValidation.isValid && (
                    <p className="text-[10px] text-rose-600 font-semibold pt-0.5">
                      ❌ {dateValidation.error}
                    </p>
                  )}

                  {/* Team Lead Extension Request Banner */}
                  {canEditManagementFields && extensionStatus === "PENDING" && (
                    <div className="mt-1.5 p-1.5 rounded bg-amber-50 border border-amber-200 flex items-center justify-between gap-2 text-xs">
                      <span className="text-amber-900">
                        Extension Requested: <strong className="font-mono text-blue-700">{task.extension_requested_date}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsReviewExtensionModalOpen(true)}
                        className="px-2.5 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs transition cursor-pointer shrink-0"
                      >
                        Review Request
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Action Buttons matching Add Task */}
              <div className="pt-3 pb-1 flex items-center gap-3">
                {canEditManagementFields ? (
                  <>
                    <button
                      type="submit"
                      disabled={isSubmitting || !title.trim() || !dateValidation.isValid}
                      className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs transition cursor-pointer disabled:opacity-50 shadow-xs"
                    >
                      {isSubmitting ? "Saving…" : "Save Changes"}
                    </button>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={onClose}
                      className="px-4 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-xs transition cursor-pointer disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-xs transition cursor-pointer"
                  >
                    Close
                  </button>
                )}
              </div>
            </>
          )}

          {/* ======================================================== */}
          {/* FEATURE TAB 2: REVIEW TASK                               */}
          {/* ======================================================== */}
          {activeTab === "REVIEW_TASK" && (
            <>
              {/* Section Header: Review Task Feature */}
              <div className="text-blue-600 font-semibold border-b border-blue-500 pb-0.5 text-xs pt-1 flex items-center justify-between">
                <span>Review Task Feature</span>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    isTaskCompleted
                      ? "text-emerald-600"
                      : isTaskInReview
                      ? "text-amber-600"
                      : "text-slate-500"
                  }`}
                >
                  Status: {isTaskCompleted ? "Completed" : isTaskInReview ? "In Review" : task.status}
                </span>
              </div>

              {/* Row: Submitter Name */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-0.5">
                <label className="sm:w-32 text-xs text-slate-700 font-medium shrink-0">
                  Submitter Name
                </label>
                <div className="flex-1 flex items-center justify-between text-xs text-slate-900">
                  <span className="font-semibold">
                    {submitterName}
                  </span>
                  {deliverableData.submittedAt && (
                    <span className="text-[11px] text-slate-500 font-mono">
                      {new Date(deliverableData.submittedAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
              </div>

              {/* Row: Reviewer Name (Shown when reviewed / completed / in review) */}
              {(reviewerData || isTaskCompleted || isTaskInReview) && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-0.5">
                  <label className="sm:w-32 text-xs text-slate-700 font-medium shrink-0">
                    Reviewer Name
                  </label>
                  <div className="flex-1 flex items-center justify-between text-xs text-slate-900">
                    <div className="flex items-center gap-2">
                      {reviewerData?.isPending ? (
                        <span className="text-slate-500 font-medium italic">
                          Pending Review (Team Lead / Project Manager)
                        </span>
                      ) : (
                        <>
                          <span className="font-semibold text-slate-900">
                            {reviewerData?.reviewerName || "Reviewer"}
                          </span>
                          {reviewerData?.decision && (
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                reviewerData.isApproved
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-blue-50 text-blue-700 border border-blue-200"
                              }`}
                            >
                              {reviewerData.decision}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    {reviewerData?.reviewedAt && (
                      <span className="text-[11px] text-slate-500 font-mono">
                        {new Date(reviewerData.reviewedAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Row: Completion Notes */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-0.5">
                <label className="sm:w-32 text-xs text-slate-700 font-medium shrink-0 pt-0.5">
                  Completion Notes
                </label>
                <div className="flex-1 text-xs text-slate-800 border-b border-slate-200 pb-1.5 whitespace-pre-wrap leading-relaxed">
                  {deliverableData.comments}
                </div>
              </div>

              {/* Row: Attachments / Screenshots */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-0.5">
                <label className="sm:w-32 text-xs text-slate-700 font-medium shrink-0 pt-0.5">
                  Attachments {deliverableData.attachments.length > 0 ? `(${deliverableData.attachments.length})` : ""}
                </label>
                <div className="flex-1 space-y-2">
                  {deliverableData.attachments.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {deliverableData.attachments.map((att, idx) => {
                        const imgSrc = att.dataUrl || att.url || att;
                        const imgName = att.name || `Screenshot ${idx + 1}`;
                        return (
                          <button
                            key={`att-proof-${idx}`}
                            type="button"
                            onClick={() => setActiveScreenshotModal(att)}
                            className="group relative rounded border border-slate-200 bg-white overflow-hidden p-1 text-left hover:border-blue-600 transition cursor-pointer"
                          >
                            <div className="h-16 w-full bg-slate-100 rounded overflow-hidden relative flex items-center justify-center">
                              <img
                                src={imgSrc}
                                alt={imgName}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              />
                              <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <span className="px-2 py-0.5 rounded bg-black/75 text-white text-[10px] font-semibold">
                                  Expand
                                </span>
                              </div>
                            </div>
                            <p className="text-[10px] font-medium text-slate-700 truncate pt-1 px-0.5">{imgName}</p>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No image attachments provided.</p>
                  )}

                  {/* Allow adding attachments if submitting deliverable */}
                  {(!isTaskInReview && !isTaskCompleted) && (
                    <div className="pt-1 space-y-1.5">
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`border border-dashed rounded p-2 text-center cursor-pointer transition ${
                          isDraggingOver ? "border-blue-600 bg-blue-50/50" : "border-slate-300 hover:border-blue-600 bg-slate-50/50"
                        }`}
                      >
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          accept="image/*"
                          multiple
                          className="hidden"
                        />
                        <p className="text-xs text-slate-600 font-medium">
                          <span className="text-blue-600 font-semibold">Upload screenshots</span> or paste (Ctrl+V)
                        </p>
                      </div>

                      {reviewAttachments.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                          {reviewAttachments.map((att) => {
                            const imgSrc = att.url || att.dataUrl || att;
                            const imgName = att.name || "Screenshot";
                            return (
                              <div key={att.id} className="relative group rounded border border-slate-200 p-1 bg-white overflow-hidden flex flex-col">
                                <div className="h-14 w-full rounded overflow-hidden bg-slate-100 flex items-center justify-center relative cursor-pointer" onClick={() => !att.isUploading && setActiveScreenshotModal(att)}>
                                  <img src={imgSrc} alt={imgName} className="w-full h-full object-cover" />
                                  {att.isUploading && (
                                    <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center text-white text-[10px]">
                                      Uploading…
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center justify-between pt-1 text-[10px] px-0.5">
                                  <span className="truncate max-w-[80px] text-slate-700">{imgName}</span>
                                  <button type="button" onClick={() => handleRemoveAttachment(att.id)} className="text-rose-500 hover:text-rose-700 font-bold px-1 cursor-pointer">
                                    ✕
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Row: Process of Approve & Given Suggestions (Lead / Manager when in REVIEW) */}
              {canReviewTask && isTaskInReview && (
                <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1.5 border-t border-slate-100">
                  <label className="sm:w-32 text-xs text-slate-700 font-medium shrink-0 pt-1">
                    Review Decision
                  </label>
                  <div className="flex-1 space-y-2">
                    {!showSuggestionsForm ? (
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={handleApproveReview}
                          className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs transition cursor-pointer disabled:opacity-50 shadow-xs"
                        >
                          Approve (100%)
                        </button>
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => setShowSuggestionsForm(true)}
                          className="px-4 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-xs transition cursor-pointer disabled:opacity-50"
                        >
                          Give Suggestions
                        </button>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded bg-slate-50 border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-800">
                            Provide Suggestions &amp; Send to To Do
                          </span>
                          <span className="text-[10px] text-slate-500">Employee will rework</span>
                        </div>
                        <textarea
                          rows={2}
                          autoFocus
                          value={suggestionNotes}
                          onChange={(e) => setSuggestionNotes(e.target.value)}
                          placeholder="Specify requested improvements, modifications, or bug fixes…"
                          className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-0.5 text-xs bg-white text-slate-900 resize-none transition-colors placeholder:text-slate-400 p-1.5 rounded"
                        />
                        <div className="flex items-center gap-2 pt-0.5">
                          <button
                            type="button"
                            disabled={isSubmitting || !suggestionNotes.trim()}
                            onClick={handleSubmitSuggestions}
                            className="px-3.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs transition cursor-pointer disabled:opacity-50 shadow-xs"
                          >
                            {isSubmitting ? "Submitting…" : "Submit Suggestions"}
                          </button>
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => setShowSuggestionsForm(false)}
                            className="px-3.5 py-1 rounded border border-slate-300 hover:bg-slate-100 text-slate-700 font-medium text-xs transition cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Previous Review Feedback (When in Rework / To Do) */}
              {teamLeadSuggestion && task.status === "TODO" && (
                <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-0.5 border-t border-slate-100">
                  <label className="sm:w-32 text-xs text-amber-700 font-medium shrink-0 pt-0.5">
                    Review Feedback
                  </label>
                  <div className="flex-1 space-y-1.5">
                    <div className="p-2 rounded bg-amber-50 border border-amber-200 text-xs text-amber-900">
                      <div className="flex items-center justify-between text-[11px] pb-1 border-b border-amber-200 font-medium">
                        <span>Reviewed by: <strong>{teamLeadSuggestion.leadName}</strong></span>
                        {teamLeadSuggestion.timestamp && (
                          <span className="text-slate-500 font-mono">
                            {new Date(teamLeadSuggestion.timestamp).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <p className="pt-1 whitespace-pre-wrap">{teamLeadSuggestion.text}</p>
                    </div>
                    {isAssignedToMe && (
                      <button
                        type="button"
                        onClick={handleStartWorking}
                        disabled={isSubmitting}
                        className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs transition cursor-pointer disabled:opacity-50 shadow-xs"
                      >
                        Start Working (Move to In Progress)
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Review History Records */}
              {reviewHistoryIterations.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-0.5 border-t border-slate-100">
                  <label className="sm:w-32 text-xs text-slate-700 font-medium shrink-0 pt-0.5">
                    Review Records
                  </label>
                  <div className="flex-1 space-y-1">
                    <button
                      type="button"
                      onClick={() => setShowReviewHistory((prev) => !prev)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <span>{showReviewHistory ? "Hide Review Records" : `View Past Records (${reviewHistoryIterations.length})`}</span>
                      <span>{showReviewHistory ? "▲" : "▼"}</span>
                    </button>
                    {showReviewHistory && (
                      <div className="p-2 rounded bg-slate-50 border border-slate-200 space-y-2 mt-1">
                        {reviewHistoryIterations.map((entry, idx) => (
                          <div key={entry.id || idx} className="text-xs border-b border-slate-200 pb-1.5 last:border-0 last:pb-0">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-semibold text-slate-800">{entry.changedBy}</span>
                              <span className="text-slate-400 font-mono">{entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : ""}</span>
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              {entry.oldStatus || "CREATED"} → <strong className="text-blue-600">{entry.newStatus}</strong>
                            </div>
                            {entry.comments && <p className="text-[11px] text-slate-700 pt-0.5 whitespace-pre-wrap">{entry.comments}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Bottom Action Footer for Review Tab */}
              <div className="pt-3 pb-1 flex items-center gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-xs transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </form>
      </div>

      {/* Task Extension Modal */}
      {isExtensionModalOpen && (
        <TaskExtensionModal
          isOpen={isExtensionModalOpen}
          onClose={() => setIsExtensionModalOpen(false)}
          task={task}
          project={project}
          sprint={selectedSprint}
          sprints={effectiveSprints}
          onTaskUpdated={(updated) => {
            if (onTaskUpdated) onTaskUpdated(updated);
            onClose();
          }}
        />
      )}

      {/* Task Extension Review Modal */}
      {isReviewExtensionModalOpen && (
        <TaskExtensionReviewModal
          isOpen={isReviewExtensionModalOpen}
          onClose={() => setIsReviewExtensionModalOpen(false)}
          task={task}
          project={project}
          sprint={selectedSprint}
          sprints={effectiveSprints}
          onDecisionMade={(decision, updatedTask) => {
            setExtensionStatus(decision === "APPROVE" ? "APPROVED" : "REJECTED");
            if (decision === "APPROVE") {
              setDueDate(updatedTask?.due_date || task.extension_requested_date || dueDate);
              setFeedbackMsg({
                text: `✓ Extension approved until ${updatedTask?.due_date || task.extension_requested_date}.`,
                type: "success",
              });
            } else {
              setFeedbackMsg({
                text: `Extension request rejected. Due date remains ${dueDate}.`,
                type: "info",
              });
            }
            if (onTaskUpdated) onTaskUpdated(updatedTask);
          }}
        />
      )}

      {/* Fullscreen Screenshot Preview Lightbox Modal */}
      {activeScreenshotModal && (
        <div
          onClick={() => setActiveScreenshotModal(null)}
          className="fixed inset-0 z-[10000] bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-fadeIn cursor-zoom-out"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl max-h-[90vh] bg-slate-900 rounded-lg overflow-hidden shadow-2xl border border-slate-700 flex flex-col cursor-default"
          >
            <div className="px-4 py-2 bg-slate-800 flex items-center justify-between border-b border-slate-700 text-white text-xs">
              <span className="font-semibold truncate">
                {activeScreenshotModal.name || "Screenshot Preview"}
              </span>
              <button
                type="button"
                onClick={() => setActiveScreenshotModal(null)}
                className="text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-slate-700 cursor-pointer font-bold"
              >
                ✕ Close
              </button>
            </div>
            <div className="p-2 overflow-auto max-h-[80vh] flex items-center justify-center bg-black">
              <img
                src={activeScreenshotModal.dataUrl || activeScreenshotModal.url || activeScreenshotModal}
                alt={activeScreenshotModal.name || "Screenshot"}
                className="max-w-full max-h-[75vh] object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(modalContent, document.body);
}
