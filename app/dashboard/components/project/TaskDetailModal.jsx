/* eslint-disable react-hooks/set-state-in-effect, @next/next/no-img-element */
"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import {
  checkTaskSprintOverdue,
  validateTaskSprintBounds,
  getEmployeeSprintWorkload,
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
  employeeProfile,
  currentUserId,
  isOpen,
  onClose,
  onTaskUpdated,
}) {
  const [mounted, setMounted] = useState(false);
  const [taskType, setTaskType] = useState("TASK");
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
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // Due Date Extension Request & Review States
  const [isExtensionModalOpen, setIsExtensionModalOpen] = useState(false);
  const [isReviewExtensionModalOpen, setIsReviewExtensionModalOpen] = useState(false);
  const [extensionDecisionNote, setExtensionDecisionNote] = useState("");
  const [isDecidingExtension, setIsDecidingExtension] = useState(false);
  const [extensionStatus, setExtensionStatus] = useState(task?.extension_status || null);

  // Suggestions / Revision Form States
  const [suggestionTitle, setSuggestionTitle] = useState("");
  const [suggestionPriority, setSuggestionPriority] = useState("MEDIUM");
  const [suggestionNotes, setSuggestionNotes] = useState("");
  const [suggestionAssigneeId, setSuggestionAssigneeId] = useState("");

  const [activeScreenshotModal, setActiveScreenshotModal] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [internalSprints, setInternalSprints] = useState([]);
  const [internalEpics, setInternalEpics] = useState([]);

  const [reviewComments, setReviewComments] = useState("");
  const [reviewAttachments, setReviewAttachments] = useState([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef(null);

  // Compress & optimize uploaded images to keep payload responsive (<300KB)
  const processImageFiles = useCallback((files) => {
    const fileList = Array.from(files);
    fileList.forEach((file) => {
      if (!file.type.startsWith("image/")) {
        setFeedbackMsg({ text: "Please upload image files only (PNG, JPG, WebP, GIF).", type: "warning" });
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setFeedbackMsg({ text: "Image size exceeds 10MB limit.", type: "warning" });
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const rawDataUrl = e.target.result;
        const img = new window.Image();
        img.onload = () => {
          try {
            const maxDim = 1600;
            let width = img.width;
            let height = img.height;

            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);

            const optimizedDataUrl = canvas.toDataURL("image/jpeg", 0.85);
            const approxKb = Math.round((optimizedDataUrl.length * 0.75) / 1024);

            setReviewAttachments((prev) => [
              ...prev,
              {
                id: `att-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                name: file.name || `Screenshot-${new Date().toLocaleTimeString().replace(/:/g, "-")}.jpg`,
                size: `${approxKb} KB`,
                dataUrl: optimizedDataUrl,
                type: "image/jpeg",
              },
            ]);
          } catch (canvasErr) {
            console.warn("Canvas compression fallback:", canvasErr);
            setReviewAttachments((prev) => [
              ...prev,
              {
                id: `att-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                name: file.name || `Screenshot-${new Date().toLocaleTimeString().replace(/:/g, "-")}.png`,
                size: `${(file.size / 1024).toFixed(1)} KB`,
                dataUrl: rawDataUrl,
                type: file.type,
              },
            ]);
          }
        };
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const cleanRole = (employeeProfile?.role || "").toLowerCase().replace(/[\s_-]+/g, "");
  const isOwnerOrAdmin = cleanRole.includes("admin") || cleanRole.includes("owner") || cleanRole.includes("hr");
  const isProjectOwnerOrCreator = project?.owner_id === employeeProfile?.id || project?.created_by === employeeProfile?.id;
  const isAssignedLead = project?.team_lead_id === employeeProfile?.id;
  const isManagerRole = cleanRole.includes("manager") || cleanRole.includes("lead");
  const canReviewTask = isOwnerOrAdmin || isProjectOwnerOrCreator || isAssignedLead || isManagerRole;
  const canEditManagementFields = canReviewTask;

  // Automatically fetch sprints and epics if not provided via props
  useEffect(() => {
    if (!isOpen || !task) return;
    const effectiveProjId = task.project_id || task.project?.id || project?.id;
    if (!effectiveProjId) return;

    if (!sprints || sprints.length === 0) {
      const fetchSprints = async () => {
        try {
          const supabase = createClient();
          const { data: { session } } = await supabase.auth.getSession();
          const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
          const res = await fetch(`/api/projects/${effectiveProjId}/sprints?t=${Date.now()}`, { headers });
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
          const supabase = createClient();
          const { data: { session } } = await supabase.auth.getSession();
          const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
          const res = await fetch(`/api/projects/${effectiveProjId}/epics?t=${Date.now()}`, { headers });
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

  // Fetch status history on open to get real-time lead suggestions and review audit
  useEffect(() => {
    if (!isOpen || !task?.id) return;
    let isSubscribed = true;

    const fetchHistory = async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("task_status_history")
          .select("*, changed_by_employee:employees!task_status_history_changed_by_fkey(id, full_name, email, role, designation)")
          .eq("task_id", task.id)
          .order("created_at", { ascending: false });

        if (!error && Array.isArray(data) && isSubscribed) {
          setHistoryItems(data);
        } else {
          // Fallback query without relational join
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

  // Deep extract deliverable metadata & screenshot attachments from all potential fields, payloads, and history
  const deliverableData = useMemo(() => {
    let attachments = [];
    let comments = "";
    let submittedAt = task?.review_submitted_at || null;
    let submittedBy = task?.review_submitted_by || null;

    // 1. Direct task.review_attachments
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

    // 2. Search embedded DELIVERABLE_PAYLOAD across all string fields and history
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

    // 3. Fallback direct comments
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

  // Extract Team Lead Suggestions & Review Feedback from review_feedback column, comments, last_status_comment, or history
  const teamLeadSuggestion = useMemo(() => {
    if (task?.review_feedback && typeof task.review_feedback === "string" && task.review_feedback.trim().length > 0) {
      const leadObj = task.review_feedback_lead || project?.teamLead || (teamLeads || []).find((l) => l.id === task.review_feedback_by || l.id === project?.team_lead_id);
      return {
        text: task.review_feedback.trim(),
        leadName: leadObj?.full_name || project?.team_lead_name || "Team Lead",
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
    ];

    // 1. Check for explicit suggestion prefixes
    for (const raw of candidates) {
      for (const prefix of prefixes) {
        if (raw.includes(prefix)) {
          const text = raw.substring(raw.indexOf(prefix) + prefix.length).trim();
          const cleaned = text.replace(/<!--DELIVERABLE_PAYLOAD:[\s\S]*?-->/g, "").trim();
          if (cleaned) {
            const matchingHistory = historyItems.find((h) => h.comments === raw);
            const historyLeadName = matchingHistory?.changed_by_employee?.full_name;
            const leadObj = project?.teamLead || (teamLeads || []).find((l) => l.id === project?.team_lead_id);
            return {
              text: cleaned,
              leadName: historyLeadName || leadObj?.full_name || project?.team_lead_name || "Team Lead",
              timestamp: matchingHistory?.created_at || task?.updated_at || null,
            };
          }
        }
      }
    }

    // 2. Check history items where status changed from REVIEW to TODO or IN_PROGRESS
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
          const leadObj = project?.teamLead || (teamLeads || []).find((l) => l.id === project?.team_lead_id);
          return {
            text: cleaned,
            leadName: h.changed_by_employee?.full_name || leadObj?.full_name || project?.team_lead_name || "Team Lead",
            timestamp: h.created_at || task?.updated_at || null,
          };
        }
      }
    }

    // 3. Fallback: If task is in TODO or IN_PROGRESS and has custom comments not matching deliverable payload
    if (task?.status === "TODO" || task?.status === "IN_PROGRESS") {
      for (const raw of candidates) {
        const cleaned = raw.replace(/<!--DELIVERABLE_PAYLOAD:[\s\S]*?-->/g, "").trim();
        if (
          cleaned &&
          cleaned !== "No detailed submission comments provided." &&
          !cleaned.startsWith("Status changed to") &&
          !cleaned.startsWith("Created item") &&
          !cleaned.startsWith("Deliverable submitted")
        ) {
          const leadObj = project?.teamLead || (teamLeads || []).find((l) => l.id === project?.team_lead_id);
          return {
            text: cleaned,
            leadName: leadObj?.full_name || project?.team_lead_name || "Team Lead",
            timestamp: task?.updated_at || null,
          };
        }
      }
    }

    return null;
  }, [task, project, teamLeads, historyItems]);

  const isKanban = (project?.project_type || "").toLowerCase() === "kanban";

  // Effective unified sprints & epics (merging props, fetched lists, and task-embedded objects)
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

  const isSprintActive = Boolean(
    isKanban || (currentSprint && String(currentSprint.status).toUpperCase() === "ACTIVE")
  );
  const isStatusLockedForEmployee = !isSprintActive && !canReviewTask;

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

  const allEmployees = useMemo(() => {
    const map = new Map();

    // 1. Team Lead
    if (project?.teamLead?.id) {
      map.set(project.teamLead.id, { ...project.teamLead, roleTag: "Team Lead" });
    } else if (project?.team_lead_id) {
      const lead =
        teamLeads.find((l) => l.id === project.team_lead_id) ||
        departmentEmployees.find((e) => e.id === project.team_lead_id);
      if (lead) map.set(lead.id, { ...lead, roleTag: "Team Lead" });
    }

    // 2. Project Owner / Creator
    if (project?.creator?.id) {
      map.set(project.creator.id, { ...project.creator, roleTag: "Project Owner" });
    } else if (project?.created_by || project?.owner_id) {
      const creatorId = project.created_by || project.owner_id;
      const creator =
        departmentEmployees.find((e) => e.id === creatorId) ||
        teamLeads.find((l) => l.id === creatorId);
      if (creator) map.set(creator.id, { ...creator, roleTag: "Project Owner" });
    }

    // 3. Project Team Members (from project.teamMembers objects or project.team_members IDs)
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
            departmentEmployees.find((e) => e.id === cleanId) ||
            teamLeads.find((l) => l.id === cleanId);
          if (emp) {
            map.set(cleanId, {
              ...emp,
              roleTag: project?.project_group ? project.project_group : (emp.designation || emp.role || "Squad Member"),
            });
          }
        }
      });
    }

    // 4. Always preserve current task assignee in options so existing assignments are never lost
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
  }, [project, departmentEmployees, teamLeads, task]);

  // Sync state whenever task changes or modal opens
  useEffect(() => {
    if (task && isOpen) {
      setTaskType(task.task_type === "BUG" ? "BUG" : "TASK");
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
      setShowAdvancedSettings(task.status !== "REVIEW");
      setExtensionStatus(task.extension_status || null);
      setExtensionDecisionNote("");

      // Suggestion form pre-fills
      setSuggestionTitle(task.title || "");
      setSuggestionPriority(task.priority || "MEDIUM");
      setSuggestionNotes("");
      setSuggestionAssigneeId(currentAssignee);

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
      // Don't intercept paste if user is focusing a normal text input (unless in review mode)
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

  const selectedEpic = useMemo(() => {
    const effectiveEpicId = epicId || task?.epic_id;
    return effectiveEpics.find((e) => e.id === effectiveEpicId) || task?.epic || null;
  }, [effectiveEpics, epicId, task?.epic_id, task?.epic]);

  const sprintMinDate = useMemo(() => {
    return selectedSprint?.start_date ? selectedSprint.start_date.split("T")[0] : "";
  }, [selectedSprint]);

  const sprintMaxDate = useMemo(() => {
    return selectedSprint?.end_date ? selectedSprint.end_date.split("T")[0] : "";
  }, [selectedSprint]);

  // When user changes sprint selection, clamp or auto-populate due date to sprint end date
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

  // Real-time validation of due date within sprint bounds
  const dateValidation = useMemo(() => {
    if (isKanban) return { isValid: true, error: "" };
    return validateTaskSprintBounds(dueDate, selectedSprint);
  }, [dueDate, selectedSprint, isKanban]);

  const sprintOverdueWarning = useMemo(() => {
    if (isKanban) return null;
    return checkTaskSprintOverdue(dueDate, selectedSprint);
  }, [dueDate, selectedSprint, isKanban]);

  const isTaskDueToday = useMemo(() => {
    if (!dueDate || status === "COMPLETED") return false;
    try {
      const d = new Date(dueDate);
      if (isNaN(d.getTime())) return false;
      const today = new Date();
      return (
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate()
      );
    } catch {
      return false;
    }
  }, [dueDate, status]);

  const isTaskModalOverdue = useMemo(() => {
    if (!dueDate || status === "COMPLETED") return false;
    try {
      const d = new Date(dueDate);
      if (isNaN(d.getTime())) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const target = new Date(d);
      target.setHours(0, 0, 0, 0);
      return target < today;
    } catch {
      return false;
    }
  }, [dueDate, status]);

  // Real-time selected assignee details & sprint workload
  const selectedAssignee = useMemo(() => {
    return allEmployees.find((e) => e.id === assigneeId) || null;
  }, [allEmployees, assigneeId]);

  const assigneeSprintWorkload = useMemo(() => {
    if (!assigneeId) return { count: 0, completedCount: 0, inProgressCount: 0, points: 0 };
    return getEmployeeSprintWorkload(assigneeId, sprintId, tasks);
  }, [assigneeId, sprintId, tasks]);

  const sprintTotalTasksCount = useMemo(() => {
    if (!sprintId) return 0;
    return tasks.filter((t) => t.sprint_id === sprintId).length;
  }, [sprintId, tasks]);

  // Handle Team Lead Extension Approval / Rejection Decision
  const handleDecideExtension = async (decision) => {
    setIsDecidingExtension(true);
    setFeedbackMsg({ text: "", type: "" });
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      const res = await fetch(`/api/projects/tasks/${task.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          action: "decide_extension",
          decision,
          decision_note: extensionDecisionNote.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to submit extension decision.");
      }

      if (decision === "APPROVE") {
        setDueDate(data.task?.due_date || task.extension_requested_date || dueDate);
        setExtensionStatus("APPROVED");
        setFeedbackMsg({
          text: `✓ Extension approved until ${data.task?.due_date || task.extension_requested_date}.`,
          type: "success",
        });
      } else {
        setExtensionStatus("REJECTED");
        setFeedbackMsg({
          text: `Extension request rejected. Due date remains ${dueDate}.`,
          type: "info",
        });
      }

      if (onTaskUpdated && data.task) {
        onTaskUpdated(data.task);
      }

      window.dispatchEvent(
        new CustomEvent("project-task-updated", {
          detail: data.task || { id: task.id, extension_status: decision === "APPROVE" ? "APPROVED" : "REJECTED" },
        })
      );
    } catch (err) {
      setFeedbackMsg({ text: err.message || "Error processing decision.", type: "error" });
    } finally {
      setIsDecidingExtension(false);
    }
  };

  if (!isOpen || !task || !mounted) return null;

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
    e.preventDefault();
    if (!title.trim()) {
      setFeedbackMsg({ text: "Please enter a title.", type: "error" });
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
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers = {
        "Content-Type": "application/json",
        ...(session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {}),
      };

      const payload = {
        title: title.trim(),
        description: description.trim(),
        task_type: taskType,
        priority,
        story_points: Number(storyPoints) || 1,
        assigned_to: assigneeId || null,
        assignee_id: assigneeId || null,
        sprint_id: sprintId || null,
        epic_id: epicId || null,
        due_date: dueDate || null,
      };

      if (status && status !== task.status) {
        if (status === "COMPLETED" && !canReviewTask) {
          setFeedbackMsg({
            text: "Deliverable Approval Required: Only the Project Manager or Team Lead can mark this task as Completed after reviewing the deliverable.",
            type: "warning",
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
        payload.status = status;
      }

      // If status is REVIEW (or was updated to REVIEW), include deliverables
      if (status === "REVIEW" || payload.status === "REVIEW" || reviewComments.trim() || reviewAttachments.length > 0) {
        if (status === "REVIEW" || payload.status === "REVIEW") {
          payload.status = "REVIEW";
        }
        payload.review_comments = reviewComments.trim();
        payload.comments = reviewComments.trim();
        payload.review_attachments = reviewAttachments.map((a) => ({
          id: a.id,
          name: a.name,
          size: a.size,
          dataUrl: a.dataUrl || a.url || a,
        }));
        payload.review_submitted_at = new Date().toISOString();
      }

      const res = await fetch(`/api/projects/tasks/${task.id}`, {
        method: "PATCH",
        headers,
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
          text: data.message || "Failed to update item.",
          type: data.code === "SPRINT_NOT_STARTED" ? "warning" : "error",
        });
        setTimeout(() => setFeedbackMsg({ text: "", type: "" }), 2500);
      }
    } catch (err) {
      console.error("Update task error:", err);
      setFeedbackMsg({
        text: "Network error updating item. Please try again.",
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
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers = {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      const res = await fetch(`/api/projects/tasks/${task.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          status: "COMPLETED",
          progress: 100,
          comments: "Approved and marked completed by Reviewer",
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
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers = {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      const payload = {
        status: "TODO",
        progress: 0,
        title: suggestionTitle.trim() || task.title,
        priority: suggestionPriority || "MEDIUM",
        assigned_to: suggestionAssigneeId || task.assigned_to || null,
        assignee_id: suggestionAssigneeId || task.assigned_to || null,
        review_feedback: suggestionNotes.trim(),
        comments: `[Team Lead Suggestions]: ${suggestionNotes.trim()}`,
      };

      const res = await fetch(`/api/projects/tasks/${task.id}`, {
        method: "PATCH",
        headers,
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
    setFeedbackMsg({ text: "", type: "" });
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers = {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      const res = await fetch(`/api/projects/tasks/${task.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          status: "IN_PROGRESS",
          progress: 25,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("project-task-updated", {
              detail: { taskId: task.id, status: "IN_PROGRESS", new: data.task, project_id: project?.id },
            })
          );
        }
        if (onTaskUpdated) onTaskUpdated();
        setStatus("IN_PROGRESS");
        setFeedbackMsg({
          text: "Task moved to In Progress! You can now start addressing the suggestions.",
          type: "success",
        });
      } else {
        setFeedbackMsg({
          text: data.message || "Failed to move task to In Progress.",
          type: "error",
        });
      }
    } catch (err) {
      console.error("Error moving task to In Progress:", err);
      setFeedbackMsg({
        text: "Network error updating task status.",
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn overflow-y-auto"
    >
      <div className="relative w-full max-w-xl bg-white rounded-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-scaleIn m-auto">
        {/* Top Header matching exact Create Sprint format */}
        <div className="px-6 pt-5 pb-3 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-3 text-base">
            <span className="font-bold text-slate-900">{canEditManagementFields ? "Update:" : "Task:"}</span>
            {canEditManagementFields ? (
              <div className="flex items-center gap-4 text-sm">
                <button
                  type="button"
                  onClick={() => setTaskType("TASK")}
                  className={`transition-colors cursor-pointer pb-0.5 ${
                    taskType === "TASK"
                      ? "text-blue-600 font-semibold border-b-2 border-blue-600"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Task
                </button>
                <button
                  type="button"
                  onClick={() => setTaskType("BUG")}
                  className={`transition-colors cursor-pointer pb-0.5 ${
                    taskType === "BUG"
                      ? "text-blue-600 font-semibold border-b-2 border-blue-600"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Bug
                </button>
              </div>
            ) : (
              <span className="text-blue-600 font-semibold border-b-2 border-blue-600 pb-0.5 text-sm">
                {taskType === "BUG" ? "Bug Details" : "Task Details"}
              </span>
            )}
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

        {/* Form Body matching Create Sprint layout */}
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4 max-h-[82vh] overflow-y-auto">
          {feedbackMsg.text && (
            <div
              className={`p-2.5 rounded text-xs font-medium ${
                feedbackMsg.type === "error" || feedbackMsg.type === "warning"
                  ? "bg-rose-50 border border-rose-200 text-rose-700"
                  : "bg-emerald-50 border border-emerald-200 text-emerald-700"
              }`}
            >
              {feedbackMsg.text}
            </div>
          )}

          {/* Sprint in Planned State Notice */}
          {isStatusLockedForEmployee && (
            <div className="p-2.5 rounded bg-slate-50 border border-slate-200 text-xs text-slate-700">
              <strong className="text-slate-900 font-semibold">Planned Sprint:</strong> Status updates are locked until the sprint is officially started.
            </div>
          )}

          {/* Team Lead Review Suggestions & Action Items */}
          {teamLeadSuggestion && (
            <div className="space-y-3 pt-1">
              <div className="text-blue-600 font-semibold border-b border-blue-500 pb-1 text-sm flex items-center justify-between">
                <span>Team Lead Review Suggestions</span>
                <span className="text-xs text-slate-500 font-normal">
                  {task.status === "TODO" ? "Status: To Do (Revision Required)" : "Status: In Progress"}
                </span>
              </div>

              {/* Reviewer Row */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                  Reviewed by
                </label>
                <div className="flex-1 flex items-center justify-between border-b border-slate-300 pb-1 text-sm text-slate-900">
                  <span className="font-semibold">{teamLeadSuggestion.leadName}</span>
                  {teamLeadSuggestion.timestamp && (
                    <span className="text-xs text-slate-500 font-mono">
                      {new Date(teamLeadSuggestion.timestamp).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
              </div>

              {/* Instructions Row */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0 pt-0.5">
                  <span className="border-b-2 border-rose-500 pb-0.5">Instructions</span>
                </label>
                <div className="flex-1">
                  <div className="w-full p-2.5 rounded bg-slate-50 border border-slate-200 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed font-sans">
                    {teamLeadSuggestion.text}
                  </div>
                </div>
              </div>

              {/* Action Button for assigned employee if in TODO */}
              {task.status === "TODO" && isAssignedToMe && (
                <div className="pt-1 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={handleStartWorking}
                    disabled={isSubmitting}
                    className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition cursor-pointer disabled:opacity-50 shadow-xs"
                  >
                    Start Working (Move to In Progress)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Deliverable Review & Proof of Work */}
          {(task.status === "REVIEW" || deliverableData.attachments.length > 0 || (task.status === "COMPLETED" && deliverableData.comments !== "No detailed submission comments provided.")) && (
            <div className="space-y-3 pt-1">
              <div className="text-blue-600 font-semibold border-b border-blue-500 pb-1 text-sm flex items-center justify-between">
                <span>Deliverable Proof of Work</span>
                <span className="text-xs text-slate-500 font-normal">
                  {task.status === "COMPLETED" ? "Status: Completed" : "Status: In Review"}
                </span>
              </div>

              {/* Submitter & Time */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                  Submitter
                </label>
                <div className="flex-1 flex items-center justify-between border-b border-slate-300 pb-1 text-sm text-slate-900">
                  <span className="font-semibold">{task.assignee?.full_name || task.planned_assignee?.full_name || "Assigned Employee"}</span>
                  {deliverableData.submittedAt && (
                    <span className="text-xs text-slate-500 font-mono">
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

              {/* Submitter's Notes */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0 pt-0.5">
                  Completion Notes
                </label>
                <div className="flex-1">
                  <div className="w-full p-2.5 rounded bg-slate-50 border border-slate-200 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed font-sans">
                    {deliverableData.comments}
                  </div>
                </div>
              </div>

              {/* Screenshot Proof */}
              {deliverableData.attachments.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1">
                  <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0 pt-0.5">
                    Screenshots ({deliverableData.attachments.length})
                  </label>
                  <div className="flex-1">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {deliverableData.attachments.map((att, idx) => {
                        const imgSrc = att.dataUrl || att.url || att;
                        const imgName = att.name || `Screenshot ${idx + 1}`;
                        const keyId = att.id ? `deliv-att-${att.id}` : `deliv-att-idx-${idx}`;
                        return (
                          <button
                            key={keyId}
                            type="button"
                            onClick={() => setActiveScreenshotModal(att)}
                            className="group relative rounded border border-slate-200 bg-white overflow-hidden p-1 text-left hover:border-blue-500 hover:shadow-xs transition cursor-pointer"
                          >
                            <div className="h-20 w-full bg-slate-100 rounded overflow-hidden relative flex items-center justify-center">
                              <img
                                src={imgSrc}
                                alt={imgName}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              />
                              <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
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
                  </div>
                </div>
              )}

              {/* Reviewer Action Controls (Manager & Team Lead only) */}
              {canReviewTask && task.status === "REVIEW" && (
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  {!showSuggestionsForm && (
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                      <span className="text-xs text-slate-700 font-medium">Review Decisions:</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={handleApproveReview}
                          className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition cursor-pointer shadow-xs disabled:opacity-50"
                        >
                          Approve (100%)
                        </button>
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => setShowSuggestionsForm(true)}
                          className="px-4 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-sm transition cursor-pointer disabled:opacity-50"
                        >
                          Give Suggestions
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Suggestion Form */}
                  {showSuggestionsForm && (
                    <div className="space-y-3 p-3 rounded bg-slate-50 border border-slate-200 text-xs">
                      <div className="text-blue-600 font-semibold border-b border-blue-500 pb-1 text-xs">
                        Give Suggestions &amp; Move to To Do
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-slate-700 font-medium block">
                          <span className="border-b-2 border-rose-500 pb-0.5">Suggestions &amp; Instructions *</span>
                        </label>
                        <textarea
                          rows={3}
                          value={suggestionNotes}
                          onChange={(e) => setSuggestionNotes(e.target.value)}
                          placeholder="Detail the improvements or suggestions for the employee…"
                          className="w-full text-xs p-2.5 rounded border border-slate-300 bg-white focus:outline-none focus:border-blue-600 resize-none text-slate-800"
                          autoFocus
                        />
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={isSubmitting || !suggestionNotes.trim()}
                          onClick={handleSubmitSuggestions}
                          className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs cursor-pointer disabled:opacity-50 shadow-xs"
                        >
                          Submit Suggestions &amp; Move to To Do
                        </button>
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => setShowSuggestionsForm(false)}
                          className="px-4 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-xs cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Employee Deliverable Submission Section (When moving status to REVIEW) */}
          {task.status !== "REVIEW" && status === "REVIEW" && (
            <div className="space-y-3 pt-1">
              <div className="text-blue-600 font-semibold border-b border-blue-500 pb-1 text-sm pt-2">
                Submit Deliverable for Review
              </div>

              {/* Completion Notes */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0 pt-0.5">
                  <span className="border-b-2 border-rose-500 pb-0.5">Completion Notes *</span>
                </label>
                <div className="flex-1">
                  <textarea
                    rows={2}
                    value={reviewComments}
                    onChange={(e) => setReviewComments(e.target.value)}
                    placeholder="Describe completed work or deliverable notes…"
                    className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-1 text-sm bg-transparent text-slate-900 resize-none placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Screenshot Dropzone */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0 pt-0.5">
                  Screenshots
                </label>
                <div className="flex-1 space-y-2">
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border border-dashed rounded p-3 text-center cursor-pointer transition ${
                      isDraggingOver
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-300 hover:border-blue-500 bg-white"
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
                    <p className="text-xs text-slate-700 font-medium">
                      <span className="text-blue-600 font-bold">Click to upload</span> or drag &amp; drop screenshot files
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">PNG, JPG, WebP up to 10MB</p>
                  </div>

                  {/* Thumbnail List */}
                  {reviewAttachments.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                      {reviewAttachments.map((att, idx) => {
                        const imgSrc = att.dataUrl || att.url || att;
                        const imgName = att.name || "Screenshot";
                        const keyId = att.id ? `review-att-${att.id}` : `review-att-idx-${idx}`;
                        return (
                          <div
                            key={keyId}
                            className="relative group rounded border border-slate-200 p-1 bg-white overflow-hidden flex flex-col shadow-2xs"
                          >
                            <div
                              className="h-16 w-full rounded overflow-hidden bg-slate-100 flex items-center justify-center relative cursor-pointer"
                              onClick={() => setActiveScreenshotModal(att)}
                            >
                              <img
                                src={imgSrc}
                                alt={imgName}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              />
                              <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-semibold">
                                Expand
                              </span>
                            </div>
                            <div className="flex items-center justify-between pt-1 text-[10px] px-0.5">
                              <span className="truncate max-w-[80px] text-slate-700 font-medium" title={imgName}>
                                {imgName}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveAttachment(att.id)}
                                className="text-rose-500 hover:text-rose-700 font-bold px-1 cursor-pointer"
                                title="Remove screenshot"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Standard Task Fields matching Create Sprint layout */}
          <div className="space-y-4 pt-1">
            {/* Row: Name with red underline indicator */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
              <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                <span className="border-b-2 border-rose-500 pb-0.5">
                  {taskType === "BUG" ? "Bug Name" : "Task Name"}
                </span>
              </label>
              <div className="flex-1">
                <input
                  type="text"
                  required
                  readOnly={!canEditManagementFields}
                  autoFocus={canEditManagementFields && task.status !== "REVIEW"}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={
                    taskType === "BUG"
                      ? "e.g., Task title fails to update on save"
                      : "e.g., Implement employee attendance export"
                  }
                  className={`w-full border-b outline-none pb-1 text-sm bg-transparent text-slate-900 transition-colors placeholder:text-slate-400 ${
                    canEditManagementFields
                      ? "border-slate-300 focus:border-blue-600"
                      : "border-slate-300 cursor-default"
                  }`}
                />
              </div>
            </div>

            {/* Row: Description */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1">
              <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0 pt-1">
                Description
              </label>
              <div className="flex-1">
                <textarea
                  rows={2}
                  readOnly={!canEditManagementFields}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description or details…"
                  className={`w-full border-b border-slate-300 outline-none pb-1 text-sm bg-transparent text-slate-900 resize-none transition-colors placeholder:text-slate-400 ${
                    canEditManagementFields ? "focus:border-blue-600" : "cursor-default"
                  }`}
                />
              </div>
            </div>

            {/* Section Divider: Default Section */}
            <div className="text-blue-600 font-semibold border-b border-blue-500 pb-1 text-sm pt-2">
              Default Section
            </div>

            {/* Row: Status */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
              <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                Status
              </label>
              <div className="flex-1 relative">
                <select
                  value={status}
                  disabled={isStatusLockedForEmployee || (status === "COMPLETED" && !canReviewTask)}
                  onChange={(e) => {
                    const newStatus = e.target.value;
                    if (newStatus === "COMPLETED" && !canReviewTask) {
                      setFeedbackMsg({
                        text: "Deliverable Approval Required: Only the Project Manager or Team Lead can mark this task as Completed.",
                        type: "warning",
                      });
                      setTimeout(() => setFeedbackMsg({ text: "", type: "" }), 3000);
                      return;
                    }
                    setStatus(newStatus);
                  }}
                  className={`w-full border-b outline-none pb-1 text-sm bg-transparent text-slate-900 appearance-none pr-6 ${
                    isStatusLockedForEmployee
                      ? "border-slate-200 text-slate-500 cursor-not-allowed"
                      : "border-slate-300 focus:border-blue-600 cursor-pointer"
                  }`}
                >
                  <option value="TODO">To Do</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="REVIEW">In Review</option>
                  {canReviewTask && <option value="COMPLETED">Completed</option>}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center text-blue-600 text-xs">
                  {isStatusLockedForEmployee ? "🔒" : "▼"}
                </div>
              </div>
            </div>

            {/* Row: Owner (Assignee) */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
              <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                Owner
              </label>
              <div className="flex-1 relative">
                <select
                  value={assigneeId}
                  disabled={!canEditManagementFields}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className={`w-full border-b border-slate-300 outline-none pb-1 text-sm bg-transparent text-slate-900 appearance-none pr-6 ${
                    !canEditManagementFields ? "cursor-default text-slate-900" : "focus:border-blue-600 cursor-pointer"
                  }`}
                >
                  <option value="">Unassigned</option>
                  {allEmployees.map((emp, idx) => {
                    const empId = emp.id || `emp-fallback-${idx}`;
                    const load = getEmployeeSprintWorkload(empId, sprintId, tasks);
                    const tag = emp.roleTag ? `[${emp.roleTag}] ` : "";
                    return (
                      <option key={`assignee-opt-${empId}-${idx}`} value={empId}>
                        {tag}{emp.full_name || "Employee"} {emp.designation ? `(${emp.designation})` : ""} {sprintId ? `— ${load.count} sp` : `— ${load.count} active`}
                      </option>
                    );
                  })}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center text-blue-600 text-xs">
                  ▼
                </div>
              </div>
            </div>

            {/* Row: Sprint Allocation */}
            {!isKanban && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                  Sprint
                </label>
                <div className="flex-1 relative">
                  <select
                    value={sprintId}
                    disabled={!canEditManagementFields}
                    onChange={(e) => handleSprintChange(e.target.value)}
                    className={`w-full border-b border-slate-300 outline-none pb-1 text-sm bg-transparent text-slate-900 appearance-none pr-6 ${
                      !canEditManagementFields ? "cursor-default text-slate-900" : "focus:border-blue-600 cursor-pointer"
                    }`}
                  >
                    <option value="">Backlog (Unscheduled)</option>
                    {effectiveSprints.map((s, idx) => (
                      <option key={`sprint-opt-${s.id || idx}-${idx}`} value={s.id}>
                        {s.name} {s.status ? `(${s.status})` : ""}
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
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
              <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                Priority
              </label>
              <div className="flex-1 relative">
                <select
                  value={priority}
                  disabled={!canEditManagementFields}
                  onChange={(e) => setPriority(e.target.value)}
                  className={`w-full border-b border-slate-300 outline-none pb-1 text-sm bg-transparent text-slate-900 appearance-none pr-6 ${
                    !canEditManagementFields ? "cursor-default text-slate-900" : "focus:border-blue-600 cursor-pointer"
                  }`}
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
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
              <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                Story Points
              </label>
              <div className="flex-1 relative">
                <select
                  value={storyPoints}
                  disabled={!canEditManagementFields}
                  onChange={(e) => setStoryPoints(Number(e.target.value))}
                  className={`w-full border-b border-slate-300 outline-none pb-1 text-sm bg-transparent text-slate-900 appearance-none pr-6 ${
                    !canEditManagementFields ? "cursor-default text-slate-900" : "focus:border-blue-600 cursor-pointer"
                  }`}
                >
                  {[1, 2, 3, 5, 8, 13, 21].map((pts) => (
                    <option key={`storypoint-opt-${pts}`} value={pts}>
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
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
              <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
                Epic
              </label>
              <div className="flex-1 relative">
                <select
                  value={epicId}
                  disabled={!canEditManagementFields}
                  onChange={(e) => setEpicId(e.target.value)}
                  className={`w-full border-b border-slate-300 outline-none pb-1 text-sm bg-transparent text-slate-900 appearance-none pr-6 ${
                    !canEditManagementFields ? "cursor-default text-slate-900" : "focus:border-blue-600 cursor-pointer"
                  }`}
                >
                  <option value="">--None--</option>
                  {effectiveEpics.map((epic, idx) => (
                    <option key={`epic-opt-${epic.id || idx}-${idx}`} value={epic.id}>
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
            <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-1">
              <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0 pt-1">
                Due Date
              </label>
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <input
                      type="date"
                      readOnly={!canEditManagementFields}
                      disabled={!canEditManagementFields}
                      min={sprintMinDate || undefined}
                      max={sprintMaxDate || undefined}
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className={`w-full border-b border-slate-300 outline-none pb-1 text-sm bg-transparent text-slate-900 ${
                        !canEditManagementFields ? "cursor-default text-slate-900" : "focus:border-blue-600"
                      }`}
                    />
                  </div>

                  {/* Employee Request Extension Button */}
                  {!canEditManagementFields && task.status !== "COMPLETED" && extensionStatus !== "PENDING" && (
                    <button
                      type="button"
                      onClick={() => setIsExtensionModalOpen(true)}
                      className="px-2.5 py-1 rounded bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-300 hover:border-blue-300 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      title="Request a deadline extension from your Team Lead"
                    >
                      <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Request Extension</span>
                    </button>
                  )}
                </div>

                {selectedSprint && (
                  <p className="text-xs text-blue-700 font-medium">
                    Sprint window: {sprintMinDate || "Start"} to {sprintMaxDate || "End"}
                  </p>
                )}

                {/* Team Lead Extension Request Banner Triggering Review Popup */}
                {canEditManagementFields && extensionStatus === "PENDING" && (
                  <div className="mt-3 p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 animate-fadeIn">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                          <span>Extension Requested:</span>
                          <span className="font-mono text-blue-700">
                            {task.extension_requested_date ? new Date(task.extension_requested_date).toLocaleDateString() : "New Date"}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          Reason: "{task.extension_reason || "More time requested"}"
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsReviewExtensionModalOpen(true)}
                      className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-xs transition shrink-0 cursor-pointer shadow-2xs flex items-center gap-1.5"
                    >
                      <span>Review Request</span>
                      <span>→</span>
                    </button>
                  </div>
                )}

                {/* Employee Extension Status Notice (Pending) */}
                {!canEditManagementFields && extensionStatus === "PENDING" && (
                  <div className="mt-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-xs space-y-1 animate-fadeIn">
                    <div className="flex items-center gap-2 font-bold text-slate-900">
                      <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                      <span>Extension Request Pending Team Lead Review</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      You requested an extension to <strong className="font-mono text-blue-700">{task.extension_requested_date}</strong>. Reason: "{task.extension_reason}". Your Team Lead will review shortly.
                    </p>
                  </div>
                )}

                {/* Approved Extension Notice */}
                {extensionStatus === "APPROVED" && (
                  <div className="mt-2 p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-xs flex items-center justify-between gap-2 animate-fadeIn">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span><strong>Extension Approved:</strong> Due date updated to <span className="font-mono font-bold text-blue-700">{dueDate}</span>.{task.extension_decision_note ? ` Note: "${task.extension_decision_note}"` : ""}</span>
                    </div>
                  </div>
                )}

                {/* Rejected Extension Notice */}
                {extensionStatus === "REJECTED" && (
                  <div className="mt-2 p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-xs flex items-center justify-between gap-2 animate-fadeIn">
                    <div className="flex items-center gap-2">
                      <span className="text-rose-600 font-bold">✕</span>
                      <span><strong>Extension Rejected:</strong> Deadline remains <span className="font-mono font-bold">{dueDate}</span>.{task.extension_decision_note ? ` Note: "${task.extension_decision_note}"` : ""}</span>
                    </div>
                  </div>
                )}

                {isTaskDueToday && (
                  <div className="mt-1.5 flex items-center gap-2 p-2 rounded-lg bg-amber-50 border border-amber-300/80 text-amber-950 text-xs font-semibold animate-fadeIn">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                    <span>⏰ Deliverable Due Today · Please analyze status and prioritize remaining work for on-time completion.</span>
                  </div>
                )}
                {isTaskModalOverdue && (
                  <div className="mt-1.5 flex items-center gap-2 p-2 rounded-lg bg-rose-50 border border-rose-300/80 text-rose-950 text-xs font-semibold animate-fadeIn">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
                    <span>⚠️ Target Deadline Passed ({dueDate}) · Please analyze blockers and update status immediately.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Action Buttons matching Create Sprint format */}
            <div className="pt-6 pb-2 flex items-center gap-3">
              {canEditManagementFields ? (
                <>
                  <button
                    type="submit"
                    disabled={isSubmitting || !title.trim() || !dateValidation.isValid}
                    className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition cursor-pointer disabled:opacity-50 shadow-xs"
                  >
                    {isSubmitting ? "Saving…" : "Update"}
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={onClose}
                    className="px-4 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-sm transition cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={onClose}
                  className="px-4 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-sm transition cursor-pointer disabled:opacity-50"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* Task Extension Modal Triggered from inside Task Detail */}
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

      {/* Task Extension Review Modal Triggered for Team Leads */}
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
            className="relative max-w-4xl max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-700 flex flex-col cursor-default"
          >
            <div className="px-4 py-2.5 bg-slate-800 flex items-center justify-between border-b border-slate-700 text-white text-xs">
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
    </div>,
    document.body
  );
}
