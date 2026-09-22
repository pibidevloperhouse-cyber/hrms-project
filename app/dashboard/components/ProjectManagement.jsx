/* eslint-disable react-hooks/purity, react-hooks/preserve-manual-memoization, react-hooks/refs */
"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import CreateProjectModal from "./CreateProjectModal";
import ProjectWorkspace from "./project/ProjectWorkspace";
import TaskProgressUpdateModal from "./project/TaskProgressUpdateModal";
import TaskSuggestionModal from "./project/TaskSuggestionModal";
import TaskDetailModal from "./project/TaskDetailModal";
import TaskExtensionModal from "./project/TaskExtensionModal";
import TaskExtensionReviewModal from "./project/TaskExtensionReviewModal";
import SprintPerformanceModal from "./project/SprintPerformanceModal";
import { calculateFinalPerformanceScore } from "@/lib/performanceUtils";

const PRIORITY_CONFIG = {
  LOW: { label: "Low", color: "text-slate-600", bg: "bg-slate-100 border-slate-200" },
  MEDIUM: { label: "Medium", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  HIGH: { label: "High", color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
  URGENT: { label: "Urgent", color: "text-rose-700", bg: "bg-rose-50 border-rose-200" },
};

const STATUS_CONFIG = {
  PLANNING: { label: "Planning", color: "text-slate-700", bg: "bg-slate-100 border-slate-200", dot: "bg-slate-400" },
  IN_PROGRESS: { label: "In Progress", color: "text-sky-700", bg: "bg-sky-50 border-sky-200", dot: "bg-sky-500 animate-pulse" },
  COMPLETED: { label: "Completed", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500" },
  ON_HOLD: { label: "On Hold", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", dot: "bg-amber-500" },
  CANCELLED: { label: "Cancelled", color: "text-rose-700", bg: "bg-rose-50 border-rose-200", dot: "bg-rose-500" },
};
const PROJECT_STATUS_CONFIG = STATUS_CONFIG;

const TASK_STATUS_CONFIG = {
  TODO: { label: "To Do", color: "text-slate-700", bg: "bg-slate-100 border-slate-200", badge: "bg-slate-100 text-slate-700 border-slate-200" },
  IN_PROGRESS: { label: "In Progress", color: "text-sky-700", bg: "bg-sky-50 border-sky-200", badge: "bg-sky-50 text-sky-700 border-sky-200" },
  REVIEW: { label: "In Review", color: "text-purple-700", bg: "bg-purple-50 border-purple-200", badge: "bg-purple-50 text-purple-700 border-purple-200" },
  COMPLETED: { label: "Completed", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  BLOCKED: { label: "Blocked", color: "text-rose-700", bg: "bg-rose-50 border-rose-200", badge: "bg-rose-50 text-rose-700 border-rose-200" },
};

function TaskStatusIcon({ status, className = "w-3.5 h-3.5" }) {
  if (status === "COMPLETED") {
    return (
      <svg className={`${className} text-emerald-600 shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (status === "IN_PROGRESS") {
    return (
      <svg className={`${className} text-sky-600 shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    );
  }
  if (status === "REVIEW") {
    return (
      <svg className={`${className} text-purple-600 shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    );
  }
  if (status === "BLOCKED") {
    return (
      <svg className={`${className} text-rose-600 shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
      </svg>
    );
  }
  return (
    <svg className={`${className} text-slate-500 shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

const TASK_PRIORITY_CONFIG = {
  LOW: { label: "Low", color: "text-slate-600", bg: "bg-slate-50 border-slate-200", dot: "bg-slate-400" },
  MEDIUM: { label: "Medium", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", dot: "bg-amber-500" },
  HIGH: { label: "High", color: "text-orange-700", bg: "bg-orange-50 border-orange-200", dot: "bg-orange-500" },
  URGENT: { label: "Urgent", color: "text-rose-700", bg: "bg-rose-50 border-rose-200", dot: "bg-rose-500" },
};

export default function ProjectManagement({ userRole, employeeProfile, company, onlineUserIds = new Set() }) {
  const [projects, setProjects] = useState([]);
  const [teamLeads, setTeamLeads] = useState([]);
  const [departmentEmployees, setDepartmentEmployees] = useState([]);
  const [allEmployeesList, setAllEmployeesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tableNotReady, setTableNotReady] = useState(false);
  const [updatingProjectId, setUpdatingProjectId] = useState(null);
  const [activeWorkspaceProject, setActiveWorkspaceProject] = useState(null);

  // Subtasks State
  const [projectTasks, setProjectTasks] = useState({}); // { [projectId]: Array<Task> }
  const [loadingTasks, setLoadingTasks] = useState({}); // { [projectId]: boolean }
  const [collapsedProjects, setCollapsedProjects] = useState(new Set()); // Set of project IDs with subtask view collapsed
  const [updatingTaskId, setUpdatingTaskId] = useState(null);
  const inFlightUpdatesRef = useRef(new Map()); // Map<taskId, { status: string, progress: number, timestamp: number }>

  // Subtask Modal State
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [selectedProjectForTask, setSelectedProjectForTask] = useState(null);
  const [taskFormData, setTaskFormData] = useState({
    title: "",
    description: "",
    assignee_id: "",
    priority: "MEDIUM",
    due_date: "",
  });
  const [taskFormError, setTaskFormError] = useState("");
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sprintScopeFilter, setSprintScopeFilter] = useState("active"); // "active" | "planned" | "backlog" | "all"

  // Project & Role Context
  const cleanRole = (userRole || "").toLowerCase();
  const isManager = cleanRole === "manager";
  const isTeamLead = cleanRole === "team_lead";
  const isAdmin = cleanRole === "admin";
  const isEmployee = !isManager && !isTeamLead && !isAdmin;
  const canCreate = isManager || isAdmin;

  const [leadAssigneeFilter, setLeadAssigneeFilter] = useState({}); // { [projectId]: employeeId | "all" }
  const [activeViewMode, setActiveViewMode] = useState(isEmployee ? "my-tasks" : "projects"); // "projects" | "analytics" | "my-tasks"
  const [employeeViewLayout, setEmployeeViewLayout] = useState("board"); // "board" | "table"
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dragOverColId, setDragOverColId] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  useEffect(() => {
    if (toastMsg) {
      const timer = setTimeout(() => setToastMsg(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [toastMsg]);

  const showNotificationToast = (message, type = "info") => {
    setToastMsg({ message, type });
  };
  const [expandedAnalyticsEmpId, setExpandedAnalyticsEmpId] = useState(null);

  // Member Status & Progress Modal
  const [selectedMemberModal, setSelectedMemberModal] = useState(null); // { project, member, tasks }
  const [progressModalTask, setProgressModalTask] = useState(null); // { task, targetStatus, projectId }
  const [isUpdatingProgressModal, setIsUpdatingProgressModal] = useState(false);
  const [selectedTaskForSuggestion, setSelectedTaskForSuggestion] = useState(null);
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState(null);
  const [selectedTaskForExtension, setSelectedTaskForExtension] = useState(null);
  const [selectedTaskForExtensionReview, setSelectedTaskForExtensionReview] = useState(null);
  const [selectedSprintForPerfEval, setSelectedSprintForPerfEval] = useState(null);
  const [perfViewMode, setPerfViewMode] = useState("overview"); // "overview" | "monthly"
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [monthlyData, setMonthlyData] = useState(null);
  const [loadingMonthlyData, setLoadingMonthlyData] = useState(false);

  const fetchMonthlyPerformance = useCallback(async (monthStr) => {
    setLoadingMonthlyData(true);
    try {
      const res = await fetch(`/api/projects/performance/monthly?month=${monthStr || selectedMonth}`);
      const data = await res.json();
      if (res.ok) {
        setMonthlyData(data);
      }
    } catch (err) {
      console.error("Fetch monthly performance error:", err);
    } finally {
      setLoadingMonthlyData(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    if (activeViewMode === "analytics" && perfViewMode === "monthly") {
      fetchMonthlyPerformance(selectedMonth);
    }
  }, [activeViewMode, perfViewMode, selectedMonth, fetchMonthlyPerformance]);

  // Helper: Check if task has active Team Lead feedback / suggestions
  const hasActiveTlSuggestions = (task) => {
    if (!task) return false;
    if (task.status !== "TODO" && task.status !== "IN_PROGRESS") return false;
    if (task.review_feedback && typeof task.review_feedback === "string" && task.review_feedback.trim().length > 0) {
      return true;
    }
    const comm = task.comments || task.last_status_comment || "";
    if (typeof comm === "string") {
      return (
        comm.includes("[Team Lead Suggestions]:") ||
        comm.includes("[Team Lead Revision Feedback]:") ||
        comm.includes("[Scope Revision Instructions]:")
      );
    }
    return false;
  };

  // Helper: Extract employee initials for avatar badge
  const getEmployeeInitials = (name) => {
    if (!name || typeof name !== "string") return "??";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase() || "??";
  };

  // Manager Analytics Filters & Data
  const [analyticsEmployeeFilter, setAnalyticsEmployeeFilter] = useState("");
  const [analyticsDeptFilter, setAnalyticsDeptFilter] = useState("all");
  const [analyticsProjectFilter, setAnalyticsProjectFilter] = useState("all");
  const [analyticsDateRange, setAnalyticsDateRange] = useState("all"); // "all" | "7d" | "30d" | "this_month" | "this_quarter"
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Close modal on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (selectedMemberModal) setSelectedMemberModal(null);
        else if (isTaskModalOpen) setIsTaskModalOpen(false);
        else if (isModalOpen) setIsModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen, isTaskModalOpen, selectedMemberModal]);

  // Helper to reliably retrieve authenticated token with hydration retries
  const getAuthHeaders = useCallback(async (supabase) => {
    let session = (await supabase.auth.getSession()).data?.session;
    if (!session?.access_token) {
      for (let attempt = 0; attempt < 3 && !session?.access_token; attempt++) {
        await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
        const retry = await supabase.auth.getSession();
        session = retry.data?.session;
      }
    }
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  }, []);

  // Fetch projects from API
  const fetchProjects = useCallback(async () => {
    try {
      const supabase = createClient();
      const headers = await getAuthHeaders(supabase);

      const res = await fetch(`/api/projects?t=${Date.now()}`, {
        headers,
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.tableNotReady) {
          setTableNotReady(true);
        } else {
          setTableNotReady(false);
        }
        if (Array.isArray(data.projects)) {
          setProjects(data.projects);
        }
      }
    } catch (err) {
      console.error("fetchProjects error:", err);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  // Batch fetch all company project tasks in a single optimized query
  const fetchBatchTasks = useCallback(async () => {
    try {
      const supabase = createClient();
      const headers = await getAuthHeaders(supabase);

      const res = await fetch(`/api/projects/tasks?t=${Date.now()}`, {
        headers,
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.tasksByProject) {
          // Merge with any in-flight mutation locks to prevent race conditions
          const merged = {};
          for (const [projId, tList] of Object.entries(data.tasksByProject)) {
            merged[projId] = (tList || []).map((task) => {
              const lock = inFlightUpdatesRef.current.get(task.id);
              if (lock && (Date.now() - lock.timestamp < 4000)) {
                return {
                  ...task,
                  status: lock.status,
                  progress: lock.progress !== undefined ? lock.progress : task.progress,
                };
              }
              return task;
            });
          }
          setProjectTasks(merged);
        }
      }
    } catch (err) {
      console.error("fetchBatchTasks error:", err);
    }
  }, [getAuthHeaders]);

  // Fetch subtasks for a specific project
  const fetchProjectTasks = useCallback(async (projectId) => {
    try {
      setLoadingTasks((prev) => ({ ...prev, [projectId]: true }));
      const supabase = createClient();
      const headers = await getAuthHeaders(supabase);

      const res = await fetch(`/api/projects/${projectId}/tasks?t=${Date.now()}`, {
        headers,
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.tasks)) {
          setProjectTasks((prev) => ({ ...prev, [projectId]: data.tasks }));
        }
      }
    } catch (err) {
      console.error(`fetchProjectTasks error for ${projectId}:`, err);
    } finally {
      setLoadingTasks((prev) => ({ ...prev, [projectId]: false }));
    }
  }, [getAuthHeaders]);

  // Fetch available team leads and department employees
  const fetchEmployeesAndLeads = useCallback(async () => {
    try {
      const supabase = createClient();
      const headers = await getAuthHeaders(supabase);

      const res = await fetch("/api/employees/list", { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.employees)) {
          setAllEmployeesList(data.employees);

          // Team Leads
          const leads = data.employees.filter((e) => {
            const r = (e.role || "").toLowerCase().replace(/\s+/g, "_");
            return r === "team_lead";
          });
          setTeamLeads(leads);

          // Department Employees eligible for subtask assignment
          const emps = data.employees.filter((e) => {
            const r = (e.role || "").toLowerCase().replace(/\s+/g, "_");
            return r === "employee" || !r;
          });
          setDepartmentEmployees(emps);
          if (emps.length > 0) {
            setAnalyticsEmployeeFilter((prev) => (prev && emps.some((e) => e.id === prev) ? prev : emps[0].id));
          }
        }
      }
    } catch (err) {
      console.error("fetchEmployeesAndLeads error:", err);
    }
  }, [getAuthHeaders]);

  // Resolved department member for analytics, defaults to first employee if not set
  const effectiveAnalyticsEmpId = useMemo(() => {
    if (analyticsEmployeeFilter && departmentEmployees.some((e) => e.id === analyticsEmployeeFilter)) {
      return analyticsEmployeeFilter;
    }
    return departmentEmployees[0]?.id || "";
  }, [analyticsEmployeeFilter, departmentEmployees]);

  // Fetch performance analytics for Manager / Team Lead
  const fetchAnalytics = useCallback(async (showLoading = true) => {
    if (isEmployee) return;
    if (showLoading) setLoadingAnalytics(true);
    try {
      const supabase = createClient();
      const headers = await getAuthHeaders(supabase);

      const params = new URLSearchParams({
        employeeId: effectiveAnalyticsEmpId,
        department: analyticsDeptFilter,
        projectId: analyticsProjectFilter,
        dateRange: analyticsDateRange,
        t: String(Date.now()),
      });

      const res = await fetch(`/api/projects/analytics?${params.toString()}`, {
        headers,
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.analytics) {
          setAnalyticsData(data.analytics);
        }
      }
    } catch (err) {
      console.error("fetchAnalytics error:", err);
    } finally {
      if (showLoading) setLoadingAnalytics(false);
    }
  }, [isEmployee, effectiveAnalyticsEmpId, analyticsDeptFilter, analyticsProjectFilter, analyticsDateRange, getAuthHeaders]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      await fetchProjects();
      if (isMounted) {
        await Promise.all([
          fetchEmployeesAndLeads(),
          fetchBatchTasks(),
        ]);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [fetchProjects, fetchEmployeesAndLeads, fetchBatchTasks]);

  // Auth State Listener to immediately refresh whenever session hydrates or changes
  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.access_token) {
        fetchProjects();
        fetchBatchTasks();
        fetchEmployeesAndLeads();
      }
    });

    return () => {
      authSub?.unsubscribe();
    };
  }, [fetchProjects, fetchBatchTasks, fetchEmployeesAndLeads]);

  // Real-Time Supabase Subscription for Projects, Project Tasks & Task Status History
  useEffect(() => {
    if (!company?.id) return;
    const supabase = createClient();

    const projectChannel = supabase
      .channel(`projects-live-${company.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects" },
        (payload) => {
          const pCompanyId = payload.new?.company_id || payload.old?.company_id;
          if (pCompanyId && pCompanyId !== company.id) return;
          fetchProjects();
          if (!isEmployee) fetchAnalytics();
        }
      )
      .subscribe();

    const taskChannel = supabase
      .channel(`project-tasks-live-${company.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_tasks" },
        (payload) => {
          const taskCompanyId = payload.new?.company_id || payload.old?.company_id;
          if (taskCompanyId && taskCompanyId !== company.id) return;

          const updatedRow = payload.new;
          const oldRow = payload.old;
          const projId = updatedRow?.project_id || oldRow?.project_id;

          if (payload.eventType === "DELETE" && oldRow?.id && projId) {
            setProjectTasks((prev) => ({
              ...prev,
              [projId]: (prev[projId] || []).filter((t) => t.id !== oldRow.id),
            }));
            return;
          }

          if (updatedRow?.id && projId) {
            const activeLock = inFlightUpdatesRef.current.get(updatedRow.id);
            const isFreshLock = activeLock && (Date.now() - activeLock.timestamp < 4000);

            const effectiveStatus = isFreshLock
              ? activeLock.status
              : (updatedRow.status || "TODO").toUpperCase().replace(/[\s-]+/g, "_");
            const effectiveProgress =
              isFreshLock && activeLock.progress !== undefined
                ? activeLock.progress
                : updatedRow.progress;

            setProjectTasks((prev) => {
              const current = prev[projId] || [];
              const exists = current.some((t) => t.id === updatedRow.id);
              if (exists) {
                return {
                  ...prev,
                  [projId]: current.map((t) =>
                    t.id === updatedRow.id
                      ? {
                          ...t,
                          ...updatedRow,
                          status: effectiveStatus,
                          progress: effectiveProgress !== undefined ? effectiveProgress : t.progress,
                        }
                      : t
                  ),
                };
              } else {
                return {
                  ...prev,
                  [projId]: [...current, { ...updatedRow, status: effectiveStatus }],
                };
              }
            });

            if (activeLock && updatedRow.status === activeLock.status) {
              inFlightUpdatesRef.current.delete(updatedRow.id);
            }
          } else {
            fetchBatchTasks();
          }

          if (!isEmployee && activeViewMode === "analytics") fetchAnalytics();
        }
      )
      .subscribe();

    const employeeChannel = supabase
      .channel(`employees-live-${company.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employees" },
        (payload) => {
          const empCompanyId = payload.new?.company_id || payload.old?.company_id;
          if (empCompanyId && empCompanyId !== company.id) return;
          fetchEmployeesAndLeads();
        }
      )
      .subscribe();

    const handleTaskUpdated = (e) => {
      const payload = e.detail;
      const projectId = payload?.new?.project_id || payload?.old?.project_id || payload?.project_id;
      if (projectId && payload?.new) {
        setProjectTasks((prev) => {
          const current = prev[projectId] || [];
          const exists = current.some((t) => t.id === payload.new.id);
          return {
            ...prev,
            [projectId]: exists
              ? current.map((t) => (t.id === payload.new.id ? { ...t, ...payload.new } : t))
              : [...current, payload.new],
          };
        });
      } else {
        fetchBatchTasks();
      }
      if (!isEmployee && activeViewMode === "analytics") fetchAnalytics();
    };

    window.addEventListener("project-task-updated", handleTaskUpdated);

    // Periodic auto-sync fallback (every 60s) to keep tab fresh without rate limit pressure
    const syncInterval = setInterval(() => {
      fetchProjects();
      fetchBatchTasks();
      fetchEmployeesAndLeads();
    }, 60000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchProjects();
        fetchBatchTasks();
        fetchEmployeesAndLeads();
        if (!isEmployee && activeViewMode === "analytics") fetchAnalytics();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      supabase.removeChannel(projectChannel);
      supabase.removeChannel(taskChannel);
      supabase.removeChannel(employeeChannel);
      window.removeEventListener("project-task-updated", handleTaskUpdated);
      clearInterval(syncInterval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [company?.id, isEmployee, activeViewMode, fetchProjects, fetchAnalytics, fetchBatchTasks, fetchEmployeesAndLeads]);

  // Open Create Modal
  const openModal = () => {
    setIsModalOpen(true);
  };

  // Quick Status Update Handler (Team Lead or Manager)
  const handleStatusChange = async (projectId, newStatus) => {
    setUpdatingProjectId(projectId);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        setProjects((prev) =>
          prev.map((p) => (p.id === projectId ? { ...p, status: newStatus } : p))
        );
      }
    } catch (err) {
      console.error("Failed to update status:", err);
    } finally {
      setUpdatingProjectId(null);
    }
  };

  // Delete Project Handler (Manager / Admin)
  const handleDelete = async (projectId, projectName) => {
    if (!confirm(`Are you sure you want to delete project "${projectName}"?`)) return;

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};

      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
        headers,
      });

      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== projectId));
      }
    } catch (err) {
      console.error("Failed to delete project:", err);
    }
  };

  // Toggle Subtasks section for a project card
  const toggleProjectExpand = (projectId) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  // Open "Assign Subtask" Modal for a project
  const openTaskModal = (project) => {
    setSelectedProjectForTask(project);
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 7);
    const defaultDueDate = project.end_date || targetDate.toISOString().split("T")[0];

    // Filter department employees for this project
    const eligibleEmployees = departmentEmployees.filter(
      (e) => !project.department || e.department?.toLowerCase() === project.department?.toLowerCase()
    );

    setTaskFormData({
      title: "",
      description: "",
      assignee_id: "",
      priority: "MEDIUM",
      due_date: defaultDueDate,
    });
    setTaskFormError("");
    setIsTaskModalOpen(true);
  };

  // Handle Subtask Creation
  const handleCreateTaskSubmit = async (e) => {
    e.preventDefault();
    setTaskFormError("");

    if (!taskFormData.title.trim()) {
      setTaskFormError("Subtask title is required.");
      return;
    }

    setIsCreatingTask(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      const res = await fetch(`/api/projects/${selectedProjectForTask.id}/tasks`, {
        method: "POST",
        headers,
        body: JSON.stringify(taskFormData),
      });

      const data = await res.json();
      if (!res.ok) {
        setTaskFormError(data.message || "Failed to create subtask.");
      } else {
        if (data.task) {
          setProjectTasks((prev) => {
            const current = prev[selectedProjectForTask.id] || [];
            return {
              ...prev,
              [selectedProjectForTask.id]: [data.task, ...current],
            };
          });
          // Ensure this project card is expanded to show the new subtask
          setCollapsedProjects((prev) => {
            const next = new Set(prev);
            next.delete(selectedProjectForTask.id);
            return next;
          });
        }
        setIsTaskModalOpen(false);
      }
    } catch (err) {
      setTaskFormError("Network error. Please try again.");
    } finally {
      setIsCreatingTask(false);
    }
  };

  // Subtask Status Switcher (Assigned employee only updates status; automatically synchronizes parent project status)
  const handleTaskStatusChange = async (
    projectId,
    taskId,
    newStatus,
    comments = null,
    action = null,
    progress = undefined,
    review_comments = null,
    review_attachments = null,
    review_submitted_at = null
  ) => {
    const normStatus = (newStatus || "TODO").toUpperCase().replace(/[\s-]+/g, "_");
    setUpdatingTaskId(taskId);

    // Record In-Flight Mutation Lock
    inFlightUpdatesRef.current.set(taskId, {
      status: normStatus,
      progress,
      timestamp: Date.now(),
    });

    // Instant local optimistic UI update (<1ms)
    setProjectTasks((prev) => {
      const current = prev[projectId] || [];
      return {
        ...prev,
        [projectId]: current.map((t) => (t.id === taskId ? {
          ...t,
          status: normStatus,
          ...(progress !== undefined ? { progress } : {}),
        } : t)),
      };
    });

    // Optimistic UI update for parent project status based on task deliverables
    setProjects((prevProjects) => {
      return prevProjects.map((p) => {
        if (p.id !== projectId) return p;
        const currentTasks = (projectTasks[projectId] || []).map((t) =>
          t.id === taskId ? { ...t, status: normStatus } : t
        );
        if (currentTasks.length > 0) {
          const allCompleted = currentTasks.every((t) => t.status === "COMPLETED");
          const anyActive = currentTasks.some((t) => t.status === "IN_PROGRESS" || t.status === "COMPLETED" || t.status === "REVIEW");
          const targetStatus = allCompleted ? "COMPLETED" : (anyActive ? "IN_PROGRESS" : "PLANNING");
          return { ...p, status: targetStatus };
        }
        return p;
      });
    });

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      const payload = { status: normStatus };
      if (comments) payload.comments = comments;
      if (action) payload.action = action;
      if (progress !== undefined) payload.progress = progress;
      if (review_comments) payload.review_comments = review_comments;
      if (review_attachments) payload.review_attachments = review_attachments;
      if (review_submitted_at) payload.review_submitted_at = review_submitted_at;

      const res = await fetch(`/api/projects/tasks/${taskId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        inFlightUpdatesRef.current.delete(taskId);
        const errData = await res.json().catch(() => ({}));
        showNotificationToast(errData.message || "Failed to update task status.", "warning");
        fetchBatchTasks();
      } else {
        const resData = await res.json();
        showNotificationToast("Item status updated.", "success");
        if (resData.task) {
          setProjectTasks((prev) => {
            const current = prev[projectId] || [];
            return {
              ...prev,
              [projectId]: current.map((t) => (t.id === taskId ? { ...t, ...resData.task, status: normStatus } : t)),
            };
          });
        }
        if (resData.project_status) {
          setProjects((prev) =>
            prev.map((p) => (p.id === projectId ? { ...p, status: resData.project_status } : p))
          );
        }
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("project-task-updated", {
              detail: { new: resData.task, project_id: projectId },
            })
          );
        }
        if (activeViewMode === "analytics") {
          fetchAnalytics();
        }
        setTimeout(() => {
          inFlightUpdatesRef.current.delete(taskId);
        }, 1500);
      }
    } catch (err) {
      inFlightUpdatesRef.current.delete(taskId);
      console.error("Failed to update task status:", err);
      showNotificationToast("Network error. Could not sync task status.", "warning");
      fetchBatchTasks();
    } finally {
      setUpdatingTaskId(null);
    }
  };

  // Employee Drag & Drop Direct Status Update Handler with Real-Time Optimistic Sync
  const executeEmployeeTaskStatusUpdate = async (taskId, newStatus) => {
    const task = myAssignedTasks.find((t) => t.id === taskId);
    if (!task) return;

    const normStatus = (newStatus || "TODO").toUpperCase().replace(/[\s-]+/g, "_");
    if (task.status === normStatus) return;

    // Scrum Review & Completion Rule: Only Project Manager / Team Lead can mark as Completed
    if (normStatus === "COMPLETED") {
      setProgressModalTask({
        task,
        targetStatus: "REVIEW",
        projectId: task.project_id || task.project?.id,
      });
      showNotificationToast(
        "Deliverable Approval Required: Only the Project Manager or Team Lead can mark tasks as Completed. Please submit for Review.",
        "warning"
      );
      return;
    }

    if (normStatus === "REVIEW") {
      setProgressModalTask({
        task,
        targetStatus: "REVIEW",
        projectId: task.project_id || task.project?.id,
      });
      return;
    }

    let nextProgress = Number(task.progress) || 0;
    if (normStatus === "TODO") {
      nextProgress = 0;
    } else if (normStatus === "IN_PROGRESS") {
      nextProgress = nextProgress > 0 && nextProgress < 100 ? nextProgress : 50;
    }

    const projectId = task.project_id || task.project?.id;
    handleTaskStatusChange(projectId, taskId, normStatus, null, null, nextProgress);
    showNotificationToast("Item status updated.", "success");
  };

  const handleEmployeeDragStart = (e, task) => {
    e.dataTransfer.setData("text/plain", task.id);
    e.dataTransfer.effectAllowed = "move";
    setDraggedTaskId(task.id);
  };

  const handleEmployeeDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverColId(null);
  };

  const handleEmployeeDragOver = (e, colId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverColId !== colId) {
      setDragOverColId(colId);
    }
  };

  const handleEmployeeDragLeave = (e, colId) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    if (dragOverColId === colId) {
      setDragOverColId(null);
    }
  };

  const handleEmployeeDrop = (e, targetColId) => {
    e.preventDefault();
    setDragOverColId(null);
    const taskId = e.dataTransfer.getData("text/plain") || draggedTaskId;
    setDraggedTaskId(null);
    if (!taskId) return;

    executeEmployeeTaskStatusUpdate(taskId, targetColId);
  };


  // Delete Subtask Handler (Lead, Manager, Admin)
  const handleDeleteTask = async (projectId, taskId, taskTitle) => {
    if (!confirm(`Are you sure you want to delete subtask "${taskTitle}"?`)) return;

    setProjectTasks((prev) => {
      const current = prev[projectId] || [];
      return {
        ...prev,
        [projectId]: current.filter((t) => t.id !== taskId),
      };
    });

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};

      await fetch(`/api/projects/tasks/${taskId}`, {
        method: "DELETE",
        headers,
      });
    } catch (err) {
      console.error("Failed to delete subtask:", err);
      fetchProjectTasks(projectId);
    }
  };

  // Scoped Projects for current user
  const scopedProjects = useMemo(() => {
    if (isTeamLead && employeeProfile?.id) {
      // Team Lead receives and sees projects assigned directly to them
      return projects.filter((p) => p.team_lead_id === employeeProfile.id);
    }
    if (isEmployee) {
      const empId = employeeProfile?.id;
      const authId = employeeProfile?.auth_user_id;
      const userDept = employeeProfile?.department?.toLowerCase().trim();

      // If backend returned projects for employee, show them
      if (projects.length > 0) {
        return projects.filter((p) => {
          // If project department matches employee department
          if (userDept && p.department?.toLowerCase().trim() === userDept) return true;
          // If employee is in team_members
          if (Array.isArray(p.team_members) && (p.team_members.includes(empId) || p.team_members.includes(authId))) return true;
          // If tasks exist for this employee
          const tasks = projectTasks[p.id] || [];
          if (
            tasks.some(
              (t) =>
                (empId && (t.assigned_to === empId || t.assignee_id === empId || t.planned_assignee_id === empId)) ||
                (authId && (t.assigned_to === authId || t.assignee_id === authId || t.planned_assignee_id === authId))
            )
          ) {
            return true;
          }
          return true;
        });
      }
      return projects;
    }
    return projects;
  }, [projects, isTeamLead, isEmployee, employeeProfile, projectTasks]);

  // Filtered Projects
  const filteredProjects = useMemo(() => {
    return scopedProjects.filter((p) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        p.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.teamLead?.full_name?.toLowerCase().includes(q) ||
        p.department?.toLowerCase().includes(q);

      const matchesStatus = statusFilter === "all" || p.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || p.priority === priorityFilter;

      return matchesQuery && matchesStatus && matchesPriority;
    });
  }, [scopedProjects, searchQuery, statusFilter, priorityFilter]);

  // Statistics
  const totalCount = scopedProjects.length;
  const inProgressCount = scopedProjects.filter((p) => p.status === "IN_PROGRESS").length;
  const completedCount = scopedProjects.filter((p) => p.status === "COMPLETED").length;
  const urgentCount = scopedProjects.filter((p) => p.priority === "URGENT" || p.priority === "HIGH").length;
  const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const totalPendingReviewsCount = useMemo(() => {
    let count = 0;
    Object.values(projectTasks).forEach((list) => {
      if (Array.isArray(list)) {
        list.forEach((t) => {
          if (t.status === "REVIEW") count++;
        });
      }
    });
    return count;
  }, [projectTasks]);

  // Aggregate all subtasks assigned to the logged-in user (Strict employee scoping with multi-factor matching)
  const empId = employeeProfile?.id;
  const authUserId = employeeProfile?.auth_user_id || employeeProfile?.user_id;
  const userEmail = employeeProfile?.email?.toLowerCase().trim();

  const myAssignedTasks = useMemo(() => {
    const list = [];
    for (const [projId, tasks] of Object.entries(projectTasks)) {
      const proj = projects.find((p) => p.id === projId);
      if (Array.isArray(tasks)) {
        for (const t of tasks) {
          const tAssigneeEmail = (t.assignee?.email || t.planned_assignee?.email || "")?.toLowerCase().trim();
          const tAssigneeId = t.assigned_to || t.assignee_id || t.planned_assignee_id;
          const tAssigneeAuthId = t.assignee?.auth_user_id;
          const tAssigneeObjId = t.assignee?.id || t.planned_assignee?.id;

          const isMine =
            Boolean(empId && (tAssigneeId === empId || tAssigneeObjId === empId)) ||
            Boolean(authUserId && (tAssigneeId === authUserId || tAssigneeAuthId === authUserId || tAssigneeObjId === authUserId)) ||
            Boolean(userEmail && tAssigneeEmail && tAssigneeEmail === userEmail);

          if (isMine) {
            const rawStatus = t.status || "TODO";
            const normalizedStatus = rawStatus.toUpperCase().replace(/[\s-]+/g, "_");
            list.push({
              ...t,
              status: normalizedStatus,
              project: t.project || proj,
            });
          }
        }
      }
    }
    return list;
  }, [projectTasks, projects, empId, authUserId, userEmail]);

  const activeScopedMyTasks = useMemo(() => {
    return myAssignedTasks.filter((t) => {
      const isKanbanProject = (t.project?.project_type || "").toLowerCase() === "kanban";
      const isSprintActive = Boolean(
        t.is_sprint_active ||
        (t.sprint && String(t.sprint.status).toUpperCase() === "ACTIVE") ||
        isKanbanProject
      );
      const isSprintPlanned = Boolean(
        t.is_sprint_planned ||
        (t.sprint && String(t.sprint.status).toUpperCase() === "PLANNED")
      );
      const isInBacklog = Boolean(t.is_in_backlog || (!t.sprint_id && !isKanbanProject));

      if (sprintScopeFilter === "active") return isSprintActive;
      if (sprintScopeFilter === "planned") return isSprintPlanned;
      if (sprintScopeFilter === "backlog") return isInBacklog;
      return true;
    });
  }, [myAssignedTasks, sprintScopeFilter]);

  const filteredMyTasks = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return activeScopedMyTasks.filter((t) => {
      const matchesQuery =
        !q ||
        t.title?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.project?.name?.toLowerCase().includes(q) ||
        t.project?.teamLead?.full_name?.toLowerCase().includes(q) ||
        t.sprint?.name?.toLowerCase().includes(q);

      const tStatus = (t.status || "TODO").toUpperCase().replace(/[\s-]+/g, "_");
      const matchesStatus = statusFilter === "all" || tStatus === statusFilter;
      const matchesPriority = priorityFilter === "all" || (t.priority || "MEDIUM").toUpperCase() === priorityFilter;

      return matchesQuery && matchesStatus && matchesPriority;
    });
  }, [activeScopedMyTasks, searchQuery, statusFilter, priorityFilter]);

  const isDueToday = (dueDateStr) => {
    if (!dueDateStr) return false;
    try {
      const d = new Date(dueDateStr);
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
  };

  const isTaskOverdue = (dueDateStr, status) => {
    if (!dueDateStr || status === "COMPLETED") return false;
    try {
      const d = new Date(dueDateStr);
      if (isNaN(d.getTime())) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const target = new Date(d);
      target.setHours(0, 0, 0, 0);
      return target < today;
    } catch {
      return false;
    }
  };

  const myTotalCount = activeScopedMyTasks.length;
  const myTodoCount = activeScopedMyTasks.filter((t) => (t.status || "TODO") === "TODO").length;
  const myInProgressCount = activeScopedMyTasks.filter((t) => t.status === "IN_PROGRESS").length;
  const myReviewCount = activeScopedMyTasks.filter((t) => t.status === "REVIEW").length;
  const myCompletedCount = activeScopedMyTasks.filter((t) => t.status === "COMPLETED").length;
  const myDueTodayTasks = useMemo(() => {
    return activeScopedMyTasks.filter((t) => isDueToday(t.due_date) && t.status !== "COMPLETED");
  }, [activeScopedMyTasks]);
  const myDueTodayCount = myDueTodayTasks.length;
  const myOverdueTasksList = useMemo(() => {
    return activeScopedMyTasks.filter((t) => isTaskOverdue(t.due_date, t.status));
  }, [activeScopedMyTasks]);
  const myOverdueCount = myOverdueTasksList.length;
  const myCompletionRate = myTotalCount > 0 ? Math.round((myCompletedCount / myTotalCount) * 100) : 0;

  // Aggregated Employee Task Analytics for Team Leads & Managers
  const employeeTaskAnalytics = useMemo(() => {
    const empMap = new Map();
    let totalDepartmentTasks = 0;
    let totalDepartmentCompleted = 0;
    let totalDepartmentInProgress = 0;
    let totalDepartmentPending = 0;
    const statusCounts = {
      TODO: 0,
      IN_PROGRESS: 0,
      REVIEW: 0,
      COMPLETED: 0,
      BLOCKED: 0,
    };

    scopedProjects.forEach((proj) => {
      const tasks = projectTasks[proj.id] || [];
      tasks.forEach((task) => {
        totalDepartmentTasks += 1;
        const st = task.status || "TODO";
        if (statusCounts[st] !== undefined) {
          statusCounts[st] += 1;
        } else {
          statusCounts.TODO += 1;
        }

        if (st === "COMPLETED") {
          totalDepartmentCompleted += 1;
        } else if (st === "IN_PROGRESS" || st === "REVIEW") {
          totalDepartmentInProgress += 1;
        } else {
          totalDepartmentPending += 1;
        }

        const assigneeId = task.assigned_to || task.assignee_id;
        if (assigneeId) {
          if (!empMap.has(assigneeId)) {
            const assigneeInfo =
              task.assignee ||
              departmentEmployees.find((e) => e.id === assigneeId) || {
                id: assigneeId,
                full_name: "Team Member",
                email: "",
                designation: "Department Member",
              };
            empMap.set(assigneeId, {
              employee: assigneeInfo,
              tasks: [],
              total: 0,
              completed: 0,
              inProgress: 0,
              pending: 0,
            });
          }

          const entry = empMap.get(assigneeId);
          entry.tasks.push({ ...task, projectName: proj.name });
          entry.total += 1;
          if (st === "COMPLETED") entry.completed += 1;
          else if (st === "IN_PROGRESS" || st === "REVIEW") entry.inProgress += 1;
          else entry.pending += 1;
        }
      });
    });

    // Also include other department employees with 0 tasks so Team Lead / Manager sees full capacity
    departmentEmployees.forEach((emp) => {
      if (!empMap.has(emp.id)) {
        empMap.set(emp.id, {
          employee: emp,
          tasks: [],
          total: 0,
          completed: 0,
          inProgress: 0,
          pending: 0,
        });
      }
    });

    const employeeList = Array.from(empMap.values()).map((entry) => {
      const rate = entry.total > 0 ? Math.round((entry.completed / entry.total) * 100) : 0;
      return {
        ...entry,
        completionRate: rate,
      };
    });

    // Sort by total tasks descending, then by completion rate descending
    employeeList.sort((a, b) => b.total - a.total || b.completionRate - a.completionRate);

    const overallRate =
      totalDepartmentTasks > 0
        ? Math.round((totalDepartmentCompleted / totalDepartmentTasks) * 100)
        : 0;

    const topPerformer =
      employeeList.filter((e) => e.completed > 0).length > 0
        ? employeeList.reduce((best, curr) => (curr.completed > (best?.completed || 0) ? curr : best), null)
        : null;

    return {
      employees: employeeList,
      totalDepartmentTasks,
      totalDepartmentCompleted,
      totalDepartmentInProgress,
      totalDepartmentPending,
      statusCounts,
      overallRate,
      topPerformer,
    };
  }, [scopedProjects, projectTasks, departmentEmployees]);

  // Filtered employees for analytics search
  const filteredAnalyticsEmployees = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return employeeTaskAnalytics.employees;
    return employeeTaskAnalytics.employees.filter(
      (e) =>
        e.employee.full_name?.toLowerCase().includes(q) ||
        e.employee.email?.toLowerCase().includes(q) ||
        e.employee.designation?.toLowerCase().includes(q)
    );
  }, [employeeTaskAnalytics.employees, searchQuery]);

  const availableDepartments = useMemo(() => {
    const set = new Set();
    projects.forEach((p) => {
      if (p.department) set.add(p.department.trim());
    });
    departmentEmployees.forEach((e) => {
      if (e.department) set.add(e.department.trim());
    });
    return Array.from(set).sort();
  }, [projects, departmentEmployees]);

  // Project List with aggregated deliverable metrics for the Project Status Bar Chart
  const projectListForChart = useMemo(() => {
    if (analyticsData?.projectPerformance && analyticsData.projectPerformance.length > 0) {
      return analyticsData.projectPerformance;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return scopedProjects.map((p) => {
      const tasks = projectTasks[p.id] || [];
      const totalTasks = tasks.length;
      let completedTasks = 0;
      let inProgressTasks = 0;
      let reviewTasks = 0;
      let todoTasks = 0;
      let overdueTasks = 0;

      tasks.forEach((t) => {
        const st = t.status || "TODO";
        const isOverdue = t.due_date && new Date(t.due_date) < today && st !== "COMPLETED";
        if (st === "COMPLETED") completedTasks += 1;
        else if (st === "IN_PROGRESS") inProgressTasks += 1;
        else if (st === "REVIEW") reviewTasks += 1;
        else todoTasks += 1;
        if (isOverdue) overdueTasks += 1;
      });

      const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      return {
        id: p.id,
        name: p.name,
        department: p.department || "General",
        status: p.status || "PLANNING",
        totalTasks,
        completedTasks,
        inProgressTasks,
        reviewTasks,
        todoTasks,
        overdueTasks,
        completionRate,
      };
    });
  }, [analyticsData?.projectPerformance, scopedProjects, projectTasks]);

  // Project Lifecycle Distribution counts for Project Status Overview Bar Chart
  const projectLifecycleCounts = useMemo(() => {
    if (analyticsData?.projectStatusDistribution) {
      return analyticsData.projectStatusDistribution;
    }
    const counts = { PLANNING: 0, IN_PROGRESS: 0, REVIEW: 0, COMPLETED: 0, ON_HOLD: 0 };
    scopedProjects.forEach((p) => {
      const st = (p.status || "PLANNING").toUpperCase();
      if (counts[st] !== undefined) counts[st] += 1;
      else counts.PLANNING += 1;
    });
    return counts;
  }, [analyticsData?.projectStatusDistribution, scopedProjects]);

  // Selected Employee detailed analytics when filtered
  const selectedEmployeeAnalytics = useMemo(() => {
    const targetEmpId =
      analyticsEmployeeFilter && analyticsEmployeeFilter !== "all"
        ? analyticsEmployeeFilter
        : departmentEmployees.length > 0
        ? departmentEmployees[0].id
        : null;
    if (!targetEmpId) return null;

    const perfEntry = analyticsData?.employeePerformance?.find((e) => e.id === targetEmpId);
    const taskEntry = employeeTaskAnalytics.employees.find((e) => e.employee.id === targetEmpId);
    const empInfo =
      departmentEmployees.find((e) => e.id === targetEmpId) ||
      taskEntry?.employee || {
        id: targetEmpId,
        full_name: perfEntry?.name || "Department Member",
        designation: perfEntry?.designation || "Employee",
        department: perfEntry?.department || employeeProfile?.department || "General",
      };

    const tasks = taskEntry?.tasks || [];
    const total = perfEntry?.totalTasks ?? taskEntry?.total ?? tasks.length;
    const completed = perfEntry?.completedTasks ?? taskEntry?.completed ?? tasks.filter((t) => t.status === "COMPLETED").length;
    const inProgress = perfEntry?.inProgressTasks ?? taskEntry?.inProgress ?? tasks.filter((t) => t.status === "IN_PROGRESS").length;
    const review = perfEntry?.reviewTasks ?? tasks.filter((t) => t.status === "REVIEW").length;
    const todo = perfEntry?.todoTasks ?? taskEntry?.pending ?? tasks.filter((t) => !t.status || t.status === "TODO").length;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdue = perfEntry?.overdueTasks ?? tasks.filter((t) => t.due_date && new Date(t.due_date) < today && t.status !== "COMPLETED").length;

    // Factual delay & on-time calculations against effective_due_date
    let delayedTasks = 0;
    let totalDelayDays = 0;
    let activeProgressSum = 0;
    let activeProgressCount = 0;

    tasks.forEach((t) => {
      const isComp = t.status === "COMPLETED";
      const targetDue = t.effective_due_date || t.original_due_date || t.due_date;
      if (targetDue) {
        const dueDate = new Date(targetDue);
        dueDate.setHours(23, 59, 59, 999);
        if (isComp) {
          const compDate = t.completed_at ? new Date(t.completed_at) : (t.updated_at ? new Date(t.updated_at) : today);
          if (compDate > dueDate) {
            const days = Math.max(1, Math.ceil((compDate - dueDate) / (1000 * 60 * 60 * 24)));
            delayedTasks += 1;
            totalDelayDays += days;
          }
        } else {
          if (today > dueDate) {
            const days = Math.max(1, Math.ceil((today - dueDate) / (1000 * 60 * 60 * 24)));
            delayedTasks += 1;
            totalDelayDays += days;
          }
        }
      }
      if (t.status === "IN_PROGRESS") {
        activeProgressSum += Number(t.progress || 0);
        activeProgressCount += 1;
      }
    });

    const avgProgress = activeProgressCount > 0
      ? Math.round(activeProgressSum / activeProgressCount)
      : (completed > 0 ? 100 : 0);

    const onTimePunctualityScore = total > 0 ? Math.max(0, Math.round(((total - delayedTasks) / total) * 100 - (totalDelayDays * 2))) : 100;
    const executionDisplay = `${completed}/${total}`;
    const calculatedScoreObj = calculateFinalPerformanceScore(8.0, onTimePunctualityScore, avgProgress);

    const completionRate = perfEntry?.completionRate ?? (total > 0 ? Math.round((completed / total) * 100) : 0);
    const onTimeRate = perfEntry?.onTimeCompletionRate ?? 100;
    const reworkRate = perfEntry?.reworkRate ?? 0;
    const avgDays = perfEntry?.avgCompletionTimeDays ?? 0;

    return {
      employee: empInfo,
      total,
      completed,
      inProgress,
      review,
      todo,
      overdue,
      delayedTasks,
      totalDelayDays,
      avgProgress,
      executionDisplay,
      calculatedScore: calculatedScoreObj.finalScore,
      performanceBadge: calculatedScoreObj.performanceBadge,
      completionRate,
      onTimeRate,
      reworkRate,
      avgDays,
      tasks,
    };
  }, [analyticsEmployeeFilter, analyticsData, employeeTaskAnalytics, departmentEmployees, employeeProfile?.department]);

  if (activeWorkspaceProject) {
    return (
      <ProjectWorkspace
        project={activeWorkspaceProject}
        onBack={() => {
          setActiveWorkspaceProject(null);
          fetchProjects();
        }}
        onProjectUpdated={(updated) => {
          if (updated?.id) {
            setActiveWorkspaceProject((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
            setProjects((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
          }
        }}
        departmentEmployees={allEmployeesList.length > 0 ? allEmployeesList : departmentEmployees}
        teamLeads={teamLeads}
        allEmployees={allEmployeesList.length > 0 ? allEmployeesList : departmentEmployees}
        userRole={userRole}
        employeeProfile={employeeProfile}
      />
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner & Header */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center border border-sky-200/60 shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                {isEmployee
                  ? "My Assigned Deliverables"
                  : isTeamLead
                  ? "My Assigned Deliverables & Projects"
                  : isManager
                  ? `${employeeProfile?.department || "Department"} Project Management`
                  : "Company Project Deliverables"}
              </h2>
              {!isEmployee && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {isManager && "Create, configure, and assign department deliverables directly to Team Leads."}
                  {isTeamLead && "Monitor and process project subtasks, assign work to department employees, and track progress."}
                  {isAdmin && "Company-wide project tracking, deliverables, and team leadership assignments."}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {!isEmployee && (
              <div className="flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setActiveViewMode("projects")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    activeViewMode === "projects"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span>Deliverables &amp; Projects</span>
                  {scopedProjects.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-700 font-bold font-mono border border-slate-200">
                      {scopedProjects.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveViewMode("analytics")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    activeViewMode === "analytics"
                      ? "bg-white text-blue-700 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span>Individual Member Performance</span>
                  {departmentEmployees.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 text-blue-800 font-bold font-mono">
                      {departmentEmployees.length}
                    </span>
                  )}
                </button>
              </div>
            )}

            {canCreate && (
              <button
                type="button"
                onClick={openModal}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors shadow-xs shadow-blue-600/20 cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                <span>Create Project</span>
              </button>
            )}

            <button
              type="button"
              onClick={fetchProjects}
              className="p-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/80 text-slate-600 transition-colors shadow-2xs cursor-pointer flex items-center justify-center"
              title="Refresh Projects"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>



        {/* Database Table Setup Guidance Banner */}
        {tableNotReady && (
          <div className="p-4 rounded-xl bg-amber-50/90 border border-amber-200/90 text-amber-900 space-y-2 text-xs shadow-xs animate-fadeIn">
            <div className="flex items-center gap-2 font-bold text-sm text-amber-950">
              <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Supabase Database Table Setup Required</span>
            </div>
            <p className="text-amber-800 leading-relaxed">
              The <code className="px-1.5 py-0.5 rounded bg-white border border-amber-200 font-mono text-[11px] font-bold">public.projects</code> table has not been initialized in Supabase yet.
              Please open your <strong>Supabase Dashboard → SQL Editor</strong>, run the script from <code className="px-1.5 py-0.5 rounded bg-white border border-amber-200 font-mono text-[11px]">supabase/migrations/20260907_create_projects_table.sql</code>, and click <strong>Run</strong>.
            </p>
          </div>
        )}

        {/* Stat Cards & Search Toolbar */}
        {(isEmployee || activeViewMode === "projects") && (
          <>
            {/* Summary Stat Cards: Modern product metrics ribbon */}
            {isEmployee ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Tasks</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                  </div>
                  <div className="text-2xl font-extrabold text-slate-900 font-mono">{myTotalCount}</div>
                  <p className="text-[10px] text-slate-400">Assigned deliverables</p>
                </div>
                <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">TODO</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  </div>
                  <div className="text-2xl font-extrabold text-slate-800 font-mono">{myTodoCount}</div>
                  <p className="text-[10px] text-slate-400">Not started yet</p>
                </div>
                <div className="p-4 rounded-2xl bg-white border border-sky-200/80 shadow-2xs hover:shadow-xs transition-all space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-sky-700 uppercase tracking-wider">In Progress</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                  </div>
                  <div className="text-2xl font-extrabold text-sky-800 font-mono">{myInProgressCount}</div>
                  <p className="text-[10px] text-sky-600">Active execution</p>
                </div>
                {myReviewCount > 0 ? (
                  <div className="p-4 rounded-2xl bg-white border border-purple-200/80 shadow-2xs hover:shadow-xs transition-all space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">In Review</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    </div>
                    <div className="text-2xl font-extrabold text-purple-800 font-mono">{myReviewCount}</div>
                    <p className="text-[10px] text-purple-600">Pending review</p>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-white border border-indigo-200/80 shadow-2xs hover:shadow-xs transition-all space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Completion</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    </div>
                    <div className="text-2xl font-extrabold text-indigo-800 font-mono">{myCompletionRate}%</div>
                    <p className="text-[10px] text-indigo-600">Of assigned tasks</p>
                  </div>
                )}
                <div className="p-4 rounded-2xl bg-white border border-emerald-200/80 shadow-2xs hover:shadow-xs transition-all space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Completed</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  </div>
                  <div className="text-2xl font-extrabold text-emerald-800 font-mono">{myCompletedCount}</div>
                  <p className="text-[10px] text-emerald-600">{myCompletionRate}% completion rate</p>
                </div>
                <div className="p-4 rounded-2xl bg-white border border-rose-200/80 shadow-2xs hover:shadow-xs transition-all space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider">Overdue</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  </div>
                  <div className="text-2xl font-extrabold text-rose-800 font-mono">{myOverdueCount}</div>
                  <p className="text-[10px] text-rose-600">Past target date</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
                <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      {isTeamLead ? "Assigned Projects" : "Total Projects"}
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                  </div>
                  <div className="text-2xl font-extrabold text-slate-900 font-mono">{totalCount}</div>
                  <p className="text-[10px] text-slate-400">Department portfolio</p>
                </div>
                <div className="p-4 rounded-2xl bg-white border border-blue-200/80 shadow-2xs hover:shadow-xs transition-all space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">In Progress</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  </div>
                  <div className="text-2xl font-extrabold text-blue-700 font-mono">{inProgressCount}</div>
                  <p className="text-[10px] text-blue-600">Active execution</p>
                </div>
                <div className={`p-4 rounded-2xl bg-white border shadow-2xs hover:shadow-xs transition-all space-y-1 ${
                  totalPendingReviewsCount > 0 ? "border-purple-300 ring-2 ring-purple-400/20" : "border-purple-200/80"
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">
                      Deliverable Reviews
                    </span>
                    <span className={`w-1.5 h-1.5 rounded-full ${totalPendingReviewsCount > 0 ? "bg-purple-600 animate-pulse" : "bg-purple-300"}`} />
                  </div>
                  <div className="text-2xl font-extrabold text-purple-800 font-mono">{totalPendingReviewsCount}</div>
                  <p className="text-[10px] text-purple-600">Pending review</p>
                </div>
                <div className="p-4 rounded-2xl bg-white border border-emerald-200/80 shadow-2xs hover:shadow-xs transition-all space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Completed</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  </div>
                  <div className="text-2xl font-extrabold text-emerald-700 font-mono">{completedCount}</div>
                  <p className="text-[10px] text-emerald-600">{completionRate}% completion rate</p>
                </div>
                <div className="p-4 rounded-2xl bg-white border border-indigo-200/80 shadow-2xs hover:shadow-xs transition-all space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">High Priority</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  </div>
                  <div className="text-2xl font-extrabold text-indigo-700 font-mono">{urgentCount}</div>
                  <p className="text-[10px] text-indigo-600">Needs attention</p>
                </div>
              </div>
            )}

            {/* Filter & Search Toolbar (Clean floating bar) */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-2.5 rounded-2xl bg-slate-100/70 border border-slate-200/70">
              <div className="relative flex-1 w-full sm:max-w-xs">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </span>
                <input
                  type="text"
                  placeholder={
                    isEmployee
                      ? "Search my tasks, deliverables, leads…"
                      : "Search project, lead, department…"
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-slate-200/90 rounded-xl pl-9 pr-7 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition shadow-2xs"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto flex-wrap">
                {isEmployee && (
                  <div className="flex items-center bg-white p-0.5 rounded-xl border border-slate-200/90 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setEmployeeViewLayout("board")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        employeeViewLayout === "board"
                          ? "bg-sky-600 text-white shadow-xs shadow-sky-600/20"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                      title="Kanban Board View (Drag & Drop)"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="5" height="18" rx="1" />
                        <rect x="10" y="3" width="5" height="12" rx="1" />
                        <rect x="17" y="3" width="5" height="15" rx="1" />
                      </svg>
                      <span>Board (Drag & Drop)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEmployeeViewLayout("table")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        employeeViewLayout === "table"
                          ? "bg-sky-600 text-white shadow-xs shadow-sky-600/20"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                      title="Table / List View"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                      <span>List</span>
                    </button>
                  </div>
                )}

                {isEmployee && (
                  <select
                    value={sprintScopeFilter}
                    onChange={(e) => setSprintScopeFilter(e.target.value)}
                    className="bg-white border border-slate-200/90 text-slate-800 text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
                  >
                    <option value="all">All Deliverables</option>
                    <option value="active">⚡ Active Sprint Only</option>
                    <option value="planned">⏳ Planned Sprints</option>
                    <option value="backlog">📦 Backlog Items</option>
                  </select>
                )}

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-white border border-slate-200/90 text-slate-800 text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
                >
                  <option value="all">All Statuses</option>
                  {isEmployee ? (
                    <>
                      <option value="TODO">To Do</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="REVIEW">In Review</option>
                      <option value="COMPLETED">Completed</option>
                    </>
                  ) : (
                    <>
                      <option value="PLANNING">Planning</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="ON_HOLD">On Hold</option>
                      <option value="CANCELLED">Cancelled</option>
                    </>
                  )}
                </select>

                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="bg-white border border-slate-200/90 text-slate-800 text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
                >
                  <option value="all">All Priorities</option>
                  <option value="URGENT">Urgent</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>

                <span className="text-xs font-mono font-bold text-slate-600 bg-white px-3 py-2 rounded-xl border border-slate-200/90 shadow-2xs whitespace-nowrap">
                  {isEmployee
                    ? `${filteredMyTasks.length} of ${activeScopedMyTasks.length}`
                    : `${filteredProjects.length} of ${scopedProjects.length}`}
                </span>
              </div>
            </div>
          </>
        )}

        {/* Main Content Area */}
        {loading ? (
          <div className="py-16 flex items-center justify-center gap-2.5 text-slate-500 text-xs">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span>Loading projects and deliverables…</span>
          </div>
        ) : (isEmployee || activeViewMode === "my-tasks") ? (
          /* Employee Dedicated "My Assigned Deliverables" View */
          filteredMyTasks.length === 0 ? (
            <div className="py-16 text-center space-y-2 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
              <div className="w-10 h-10 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center mx-auto">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <p className="text-xs font-bold text-slate-800">
                {myAssignedTasks.length === 0
                  ? "No Subtasks Assigned to You Yet"
                  : sprintScopeFilter === "active"
                  ? "No Active Sprint Deliverables"
                  : "No Matching Deliverables Found"}
              </p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {myAssignedTasks.length === 0
                  ? "When your Department Team Lead assigns deliverables to you, they will appear here with live tracking."
                  : sprintScopeFilter === "active"
                  ? "Tasks in upcoming or planned sprints will become visible on your board once your Team Lead starts the sprint."
                  : `No deliverables match your search "${searchQuery}".`}
              </p>
            </div>
          ) : employeeViewLayout === "board" ? (
            /* KANBAN BOARD VIEW (DRAG & DROP) */
            <div className="space-y-4 animate-fadeIn">
              {/* Due Today Attention Banner */}
              {myDueTodayTasks.length > 0 && (
                <div className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-r from-amber-50 via-orange-50/40 to-white border border-amber-300/80 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fadeIn">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-300 text-amber-700 flex items-center justify-center shrink-0 shadow-2xs">
                      <svg className="w-5 h-5 text-amber-600 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                          Deadline Alert · {myDueTodayTasks.length} Deliverable{myDueTodayTasks.length > 1 ? "s" : ""} Due Today
                        </h4>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200/70 text-amber-900 border border-amber-300">
                          Priority Action Required
                        </span>
                      </div>
                      <p className="text-[12px] text-amber-900/90 mt-0.5 font-medium leading-relaxed">
                        The scheduled target deadline is today. Please analyze the current status of your deliverables, inspect feedback, and prioritize remaining work for on-time delivery.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => {
                        if (myDueTodayTasks[0]) {
                          if (hasActiveTlSuggestions(myDueTodayTasks[0])) {
                            setSelectedTaskForSuggestion(myDueTodayTasks[0]);
                          } else {
                            setSelectedTaskForDetail(myDueTodayTasks[0]);
                          }
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-bold shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Analyze Status</span>
                      <span>→</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Guidance Ribbon */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600 bg-sky-50/60 px-4 py-2.5 rounded-2xl border border-sky-100">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-sky-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    ⚡
                  </span>
                  <p className="font-medium text-slate-700">
                    <strong className="font-bold text-slate-900">Drag & Drop Workflow Active:</strong> Drag task cards across columns to update execution status in real time.
                  </p>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto font-mono text-[11px] text-sky-800 font-bold bg-white px-2.5 py-1 rounded-xl border border-sky-200/80 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Live Sync</span>
                </div>
              </div>

              {/* 4 Workflow Columns Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
                {[
                  { id: "TODO", label: "To Do", bg: "bg-slate-50/80", border: "border-slate-200/90", headerBg: "bg-slate-200/80 text-slate-800", dot: "bg-slate-400", hint: "Drop here to queue task" },
                  { id: "IN_PROGRESS", label: "In Progress", bg: "bg-sky-50/50", border: "border-sky-200/90", headerBg: "bg-sky-100 text-sky-800", dot: "bg-sky-500 animate-pulse", hint: "Drop here to start work" },
                  { id: "REVIEW", label: "In Review", bg: "bg-purple-50/50", border: "border-purple-200/90", headerBg: "bg-purple-100 text-purple-800", dot: "bg-purple-500", hint: "Drop here to request review" },
                  { id: "COMPLETED", label: "Completed", bg: "bg-emerald-50/50", border: "border-emerald-200/90", headerBg: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500", hint: "Drop here to finish task" },
                ].map((col) => {
                  const colTasks = filteredMyTasks.filter((t) => {
                    const normSt = (t.status || "TODO").toUpperCase().replace(/[\s-]+/g, "_");
                    return normSt === col.id;
                  });
                  const isOver = dragOverColId === col.id;

                  return (
                    <div
                      key={col.id}
                      onDragOver={(e) => handleEmployeeDragOver(e, col.id)}
                      onDragLeave={(e) => handleEmployeeDragLeave(e, col.id)}
                      onDrop={(e) => handleEmployeeDrop(e, col.id)}
                      className={`flex flex-col rounded-2xl border transition-all duration-200 ${col.bg} ${col.border} ${
                        isOver
                          ? "ring-2 ring-sky-500 border-sky-400 bg-sky-100/70 shadow-lg scale-[1.01]"
                          : "shadow-2xs"
                      }`}
                    >
                      {/* Column Header */}
                      <div className="p-3.5 flex items-center justify-between border-b border-slate-200/70">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                          <h4 className="text-xs font-bold text-slate-900 tracking-tight">{col.label}</h4>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${col.headerBg}`}>
                            {colTasks.length}
                          </span>
                        </div>
                        {isOver && (
                          <span className="text-[10px] font-bold text-sky-700 animate-pulse font-mono">
                            Drop ➔
                          </span>
                        )}
                      </div>

                      {/* Droppable Task List */}
                      <div className="p-2.5 space-y-3 min-h-[420px] max-h-[calc(100vh-270px)] overflow-y-auto custom-scroll">
                        {colTasks.length === 0 ? (
                          <div
                            className={`h-44 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center p-4 text-center transition-all ${
                              isOver
                                ? "border-sky-500 bg-sky-50/90 text-sky-800 shadow-inner"
                                : "border-slate-200/80 text-slate-400 bg-white/40"
                            }`}
                          >
                            <svg className="w-6 h-6 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                            <p className="text-[11px] font-bold">{isOver ? col.hint : `No tasks in ${col.label}`}</p>
                            <p className="text-[10px] opacity-70 mt-0.5">Drag a task card here to move</p>
                          </div>
                        ) : (
                          colTasks.map((task, idx) => {
                            const resolvedProject = task.project || projects.find((p) => p.id === task.project_id);
                            const projKey = resolvedProject?.name
                              ? resolvedProject.name.trim().split(/\s+/).length >= 2
                                ? (resolvedProject.name.trim().split(/\s+/)[0][0] + resolvedProject.name.trim().split(/\s+/)[1][0]).toUpperCase()
                                : resolvedProject.name.slice(0, 2).toUpperCase()
                              : "TP";
                            const taskCode =
                              task.task_code ||
                              task.task_number ||
                              `${projKey}-I${task.item_number || (idx + 1)}`;

                            const assignee =
                              task.assignee ||
                              task.planned_assignee ||
                              allEmployeesList.find((e) => e.id === (task.assigned_to || task.planned_assignee_id || task.assignee_id)) ||
                              employeeProfile;
                            const initials = getEmployeeInitials(assignee?.full_name || assignee?.name || employeeProfile?.full_name);

                            const linkedEpic = task.epic || null;
                            const isDueTodayTask = isDueToday(task.due_date) && task.status !== "COMPLETED";
                            const isOverdue = isTaskOverdue(task.due_date, task.status);

                            const isBeingDragged = draggedTaskId === task.id;

                            return (
                              <div
                                key={task.id}
                                draggable={true}
                                onDragStart={(e) => handleEmployeeDragStart(e, task)}
                                onDragEnd={handleEmployeeDragEnd}
                                onClick={() => {
                                  if (hasActiveTlSuggestions(task)) {
                                    setSelectedTaskForSuggestion(task);
                                  } else {
                                    setSelectedTaskForDetail(task);
                                  }
                                }}
                                className={`relative p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-2xs hover:shadow-md hover:border-slate-300 transition-all duration-150 group select-none cursor-grab active:cursor-grabbing ${
                                  isBeingDragged ? "opacity-30 scale-95 border-dashed border-blue-500" : ""
                                } ${
                                  updatingTaskId === task.id ? "opacity-50 pointer-events-none" : ""
                                }`}
                                title={
                                  hasActiveTlSuggestions(task)
                                    ? "Team Lead provided suggestions. Click to view instructions."
                                    : isDueTodayTask
                                    ? "Deliverable is due today. Click to inspect details and prioritize work."
                                    : "Drag to change workflow status, or click to view task details"
                                }
                              >
                                {/* Left vertical accent bar */}
                                <div
                                  className={`absolute left-0 top-3 bottom-3 w-1 rounded-r ${
                                    task.task_type === "BUG"
                                      ? "bg-rose-500"
                                      : task.priority === "URGENT"
                                      ? "bg-rose-500"
                                      : task.priority === "HIGH"
                                      ? "bg-orange-500"
                                      : "bg-emerald-500"
                                  }`}
                                />

                                {/* Top Row: Task Icon + Task Code (Left) & Assignee Avatar (Right) */}
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {task.task_type === "BUG" ? (
                                      <svg
                                        className="w-3.5 h-3.5 text-rose-500 shrink-0"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.2"
                                      >
                                        <circle cx="12" cy="12" r="9" />
                                        <path d="M12 8v4m0 4h.01" />
                                      </svg>
                                    ) : (
                                      <svg
                                        className="w-3.5 h-3.5 text-emerald-600 shrink-0"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.2"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                        />
                                      </svg>
                                    )}
                                    <span className="font-semibold text-slate-800 text-xs tracking-tight truncate">
                                      {taskCode}
                                    </span>
                                  </div>

                                  {/* Assignee Avatar Initials Badge */}
                                  <div
                                    className="w-6 h-6 rounded bg-slate-100/90 border border-slate-200/80 text-slate-700 font-bold text-[10px] flex items-center justify-center shrink-0 shadow-2xs"
                                    title={assignee?.full_name ? `Assignee: ${assignee.full_name}` : "Unassigned"}
                                  >
                                    {initials}
                                  </div>
                                </div>

                                {/* Middle: Clean Task Title */}
                                <h5 className="font-medium text-slate-900 text-[13px] leading-snug group-hover:text-blue-600 transition pt-1.5 pb-0.5">
                                  {task.title}
                                </h5>

                                {/* Epic / Category Pill */}
                                {linkedEpic && (
                                  <div className="pt-1">
                                    <span
                                      className="inline-flex items-center text-[11px] font-medium text-slate-800 bg-slate-100/80 px-2 py-0.5 rounded border-l-[3px] truncate max-w-full"
                                      style={{ borderLeftColor: linkedEpic.color || "#2563eb" }}
                                      title={`Epic: ${linkedEpic.name}`}
                                    >
                                      {linkedEpic.name}
                                    </span>
                                  </div>
                                )}

                                {/* Due Today Attention Badge */}
                                {isDueTodayTask && (
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedTaskForDetail(task);
                                    }}
                                    className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-amber-950 bg-gradient-to-r from-amber-100 via-orange-100 to-amber-100 border border-amber-300 hover:border-amber-400 px-2 py-1 rounded-md shadow-2xs w-fit cursor-pointer transition active:scale-95 animate-fadeIn"
                                    title="Due Today: Please analyze task progress and prioritize work."
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                    <span>⏱️ Due Today · Prioritize Work</span>
                                  </div>
                                )}

                                {/* Extension Request Pending Badge */}
                                {task.extension_status === "PENDING" && (
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!isEmployee) {
                                        setSelectedTaskForExtensionReview(task);
                                      } else {
                                        setSelectedTaskForDetail(task);
                                      }
                                    }}
                                    className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-slate-800 bg-slate-100 border border-slate-300 hover:border-blue-400 hover:text-blue-700 px-2 py-1 rounded-md shadow-2xs w-fit cursor-pointer transition active:scale-95 animate-fadeIn"
                                    title={`Extension requested to ${task.extension_requested_date ? new Date(task.extension_requested_date).toLocaleDateString() : "new date"}. Click to review.`}
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                                    <span>⏳ Extension Pending Review</span>
                                  </div>
                                )}

                                {/* Extension Approved Badge */}
                                {task.extension_status === "APPROVED" && (
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedTaskForDetail(task);
                                    }}
                                    className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-emerald-900 bg-emerald-50 border border-emerald-300 hover:border-emerald-400 px-2 py-0.5 rounded-md shadow-2xs w-fit cursor-pointer transition active:scale-95 animate-fadeIn"
                                    title="Deadline extension was approved by Team Lead."
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    <span>✓ Extension Approved</span>
                                  </div>
                                )}

                                {/* Team Lead Feedback notification banner if suggestions exist */}
                                {hasActiveTlSuggestions(task) && (
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedTaskForSuggestion(task);
                                    }}
                                    className="mt-2 flex items-center gap-1.5 text-[10px] font-extrabold text-amber-950 bg-gradient-to-r from-amber-100 via-orange-100 to-amber-100 border border-amber-300 hover:border-amber-400 px-2 py-1 rounded-md shadow-2xs w-fit cursor-pointer transition active:scale-95 animate-fadeIn"
                                    title="Team Lead requested improvements. Click to view suggestions."
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
                                    <span>💬 TL Review Suggestions</span>
                                  </div>
                                )}

                                {/* Bottom Toolbar with dashed divider */}
                                <div className="border-t border-dashed border-slate-200 mt-2.5 pt-2 flex items-center justify-between text-slate-400">
                                  {/* Left action icons */}
                                  <div className="flex items-center gap-2">
                                    {/* Timer / Due Date */}
                                    <div
                                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition cursor-pointer text-[11px] font-medium ${
                                        isDueTodayTask
                                          ? "text-amber-900 bg-amber-50 border border-amber-300/80 font-bold font-mono"
                                          : isOverdue
                                          ? "text-rose-700 bg-rose-50 border border-rose-300/80 font-bold font-mono"
                                          : "hover:text-slate-700"
                                      }`}
                                      title={
                                        isDueTodayTask
                                          ? "⏰ Due Today: Please analyze task progress and prioritize delivery"
                                          : isOverdue
                                          ? `⚠️ Overdue since ${new Date(task.due_date).toLocaleDateString()}`
                                          : task.due_date
                                          ? `Due Date: ${new Date(task.due_date).toLocaleDateString()}`
                                          : "No due date"
                                      }
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedTaskForDetail(task);
                                      }}
                                    >
                                      <svg
                                        className={`w-3.5 h-3.5 ${
                                          isDueTodayTask ? "text-amber-600 animate-pulse" : isOverdue ? "text-rose-500" : ""
                                        }`}
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                      >
                                        <circle cx="12" cy="12" r="10" />
                                        <polyline points="12 6 12 12 16 14" />
                                      </svg>
                                      <span>
                                        {isDueTodayTask
                                          ? "Due Today"
                                          : isOverdue
                                          ? "Overdue"
                                          : task.due_date
                                          ? new Date(task.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                                          : ""}
                                      </span>
                                    </div>

                                    {/* Story Points / Database icon */}
                                    <div
                                      className="flex items-center gap-0.5 hover:text-slate-700 transition cursor-pointer"
                                      title={`Story Points: ${task.story_points || 1} pts`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedTaskForDetail(task);
                                      }}
                                    >
                                      <svg
                                        className="w-3.5 h-3.5"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                      >
                                        <ellipse cx="12" cy="5" rx="9" ry="3" />
                                        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                                        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                                      </svg>
                                      {task.story_points ? (
                                        <span className="text-[10px] font-mono font-semibold text-slate-600">
                                          {task.story_points}
                                        </span>
                                      ) : null}
                                    </div>

                                    {/* Comments / Feedback icon */}
                                    <div
                                      className={`relative hover:text-slate-700 transition cursor-pointer ${
                                        hasActiveTlSuggestions(task) ? "text-amber-600" : ""
                                      }`}
                                      title={
                                        hasActiveTlSuggestions(task)
                                          ? "Team Lead Feedback Available - Click to view"
                                          : task.comments
                                          ? `Comments: ${task.comments}`
                                          : "Comments & Feedback"
                                      }
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (hasActiveTlSuggestions(task)) {
                                          setSelectedTaskForSuggestion(task);
                                        } else {
                                          setSelectedTaskForDetail(task);
                                        }
                                      }}
                                    >
                                      <svg
                                        className="w-3.5 h-3.5"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                      >
                                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                      </svg>
                                      {hasActiveTlSuggestions(task) && (
                                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500 animate-pulse ring-1 ring-white" />
                                      )}
                                    </div>

                                    {/* Request Extension Quick Trigger for Employee */}
                                    {isEmployee && task.status !== "COMPLETED" && (
                                      <div
                                        className={`hover:text-blue-600 transition cursor-pointer text-[11px] flex items-center gap-0.5 ${
                                          task.extension_status === "PENDING" ? "text-amber-600" : ""
                                        }`}
                                        title={
                                          task.extension_status === "PENDING"
                                            ? "Extension request pending Team Lead review"
                                            : "Request Deadline Extension from Team Lead"
                                        }
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedTaskForExtension(task);
                                        }}
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                      </div>
                                    )}

                                    {/* Ellipsis / Details Trigger */}
                                    <div
                                      className="hover:text-slate-700 transition cursor-pointer font-bold text-xs tracking-widest leading-none px-0.5"
                                      title="View task details"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedTaskForDetail(task);
                                      }}
                                    >
                                      •••
                                    </div>
                                  </div>

                                  {/* Right action icon: Tag / Priority */}
                                  <div className="flex items-center">
                                    <div
                                      className="hover:text-slate-700 transition cursor-pointer"
                                      title={`Priority: ${task.priority || "Medium"}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedTaskForDetail(task);
                                      }}
                                    >
                                      <svg
                                        className={`w-3.5 h-3.5 ${
                                          task.priority === "URGENT"
                                            ? "text-rose-500"
                                            : task.priority === "HIGH"
                                            ? "text-orange-500"
                                            : task.priority === "LOW"
                                            ? "text-slate-400"
                                            : "text-amber-500"
                                        }`}
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                      >
                                        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                                        <line x1="7" y1="7" x2="7.01" y2="7" />
                                      </svg>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="overflow-hidden bg-white border border-slate-200/90 rounded-2xl shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Task &amp; Project</th>
                      <th className="py-3 px-3">Priority</th>
                      <th className="py-3 px-3">Due Date</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredMyTasks.map((task) => {
                      const taskPriority = TASK_PRIORITY_CONFIG[task.priority] || TASK_PRIORITY_CONFIG.MEDIUM;
                      const taskStatus = TASK_STATUS_CONFIG[task.status] || TASK_STATUS_CONFIG.TODO;
                      const isDueTodayTask = isDueToday(task.due_date) && task.status !== "COMPLETED";
                      const isOverdue = isTaskOverdue(task.due_date, task.status);
                      const resolvedProject = task.project || projects.find((p) => p.id === task.project_id);
                      const projectName = resolvedProject?.name || "Project";
                      const leadName = resolvedProject?.teamLead?.full_name || "Team Lead";
                      const isUpdating = updatingTaskId === task.id;

                      const isSprintActive = Boolean(task.is_sprint_active || (task.sprint && task.sprint.status === "ACTIVE"));
                      const isSprintPlanned = Boolean(task.is_sprint_planned || (task.sprint && task.sprint.status === "PLANNED"));
                      const isInBacklog = Boolean(task.is_in_backlog || !task.sprint_id);

                      return (
                        <tr
                          key={task.id}
                          onClick={() => {
                            if (hasActiveTlSuggestions(task)) {
                              setSelectedTaskForSuggestion(task);
                            } else {
                              setSelectedTaskForDetail(task);
                            }
                          }}
                          className="hover:bg-slate-50/60 transition group cursor-pointer"
                        >
                          {/* Task & Project */}
                          <td className="py-3.5 px-4">
                            <div className="space-y-1 max-w-md">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-sky-50 text-sky-800 text-[10px] font-bold border border-sky-200/80">
                                  <svg className="w-3 h-3 text-sky-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                  </svg>
                                  <span className="truncate max-w-[180px]">{projectName}</span>
                                </span>

                                {isSprintActive ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                                    ⚡ {task.sprint?.name || "Active Sprint"}
                                  </span>
                                ) : isSprintPlanned ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 text-[10px] font-bold border border-amber-200" title={`Sprint "${task.sprint?.name}" has not started yet.`}>
                                    ⏳ {task.sprint?.name || "Planned Sprint"}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-semibold border border-slate-200" title="Item is currently in the project backlog">
                                    📦 Backlog
                                  </span>
                                )}

                                <span className="text-[10px] text-slate-400 font-mono">
                                  Lead: {leadName}
                                </span>
                              </div>
                              <p
                                onClick={() => {
                                  if (hasActiveTlSuggestions(task)) {
                                    setSelectedTaskForSuggestion(task);
                                  }
                                }}
                                className={`text-xs font-bold ${task.status === "COMPLETED" ? "text-slate-400 line-through" : "text-slate-900"} ${
                                  hasActiveTlSuggestions(task) ? "hover:text-amber-700 cursor-pointer" : ""
                                }`}
                              >
                                {task.title}
                              </p>
                              {hasActiveTlSuggestions(task) && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTaskForSuggestion(task);
                                  }}
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-300 text-[10px] font-bold hover:bg-amber-100 transition cursor-pointer"
                                  title="Click to view Team Lead revision suggestions"
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                  <span>💬 TL Review Suggestions (View)</span>
                                </button>
                              )}
                              {task.description && (
                                <p className="text-[11px] text-slate-500 line-clamp-1">
                                  {task.description}
                                </p>
                              )}
                            </div>
                          </td>

                          {/* Priority */}
                          <td className="py-3.5 px-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${taskPriority.bg} ${taskPriority.color}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${taskPriority.dot}`} />
                              <span>{taskPriority.label}</span>
                            </span>
                          </td>

                          {/* Due Date */}
                          <td className="py-3.5 px-3 whitespace-nowrap">
                            {task.due_date ? (
                              <div className="space-y-1">
                                <span className={`inline-flex items-center gap-1 text-[11px] font-mono font-medium ${
                                  isDueTodayTask ? "text-amber-800 font-bold" : isOverdue ? "text-rose-600 font-bold" : "text-slate-600"
                                }`}>
                                  <svg className="w-3 h-3 shrink-0 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                  <span>{new Date(task.due_date).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</span>
                                </span>
                                {task.extension_status === "PENDING" ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-300 text-amber-900 text-[9px] font-bold w-fit shadow-2xs">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                    <span>Extension Pending Review</span>
                                  </span>
                                ) : isDueTodayTask ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-300 text-amber-900 text-[9px] font-bold w-fit shadow-2xs">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                    <span>Due Today · Action Required</span>
                                  </span>
                                ) : task.extension_status === "APPROVED" ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-[9px] font-bold w-fit">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    <span>Extension Approved</span>
                                  </span>
                                ) : isOverdue ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[9px] font-bold w-fit">
                                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    <span>Overdue</span>
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px] italic">No due date</span>
                            )}
                          </td>

                          {/* Status Dropdown / Selector (Employee Direct Control) */}
                          <td className="py-3.5 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={!isSprintActive && task.status === "TODO"}
                                onClick={() => {
                                  if (!isSprintActive && task.status === "TODO") return;
                                  setProgressModalTask({
                                    task,
                                    targetStatus: task.status || "IN_PROGRESS",
                                    projectId: task.project_id,
                                  });
                                }}
                                className={`text-[11px] font-bold rounded-xl px-2.5 py-1.5 border shadow-2xs transition-all flex items-center gap-1.5 ${
                                  !isSprintActive && task.status === "TODO"
                                    ? "opacity-60 cursor-not-allowed bg-slate-100 text-slate-500 border-slate-200"
                                    : `${taskStatus.bg} ${taskStatus.color} cursor-pointer hover:ring-2 hover:ring-sky-500/20`
                                }`}
                                title={
                                  !isSprintActive && task.status === "TODO"
                                    ? isSprintPlanned
                                      ? `Sprint "${task.sprint?.name || "Sprint"}" has not started yet. Tasks can be started once the sprint is active.`
                                      : "Task is in the Backlog. It will unlock when assigned to an active sprint."
                                    : "Click to update task progress percentage and notes"
                                }
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                <span>{taskStatus.label}</span>
                                <span className="font-mono text-[10px] opacity-80">
                                  ({task.progress !== undefined ? task.progress : (task.status === "COMPLETED" ? 100 : task.status === "IN_PROGRESS" ? 50 : 0)}%)
                                </span>
                              </button>
                            </div>
                          </td>

                          {/* Actions: Start Task (TODO), Mark Completed (IN_PROGRESS), Reopen (COMPLETED), History */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              {task.status === "TODO" && (
                                isSprintActive ? (
                                  <button
                                    type="button"
                                    disabled={isUpdating}
                                    onClick={() =>
                                      setProgressModalTask({
                                        task,
                                        targetStatus: "IN_PROGRESS",
                                        projectId: task.project_id,
                                      })
                                    }
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-[11px] shadow-xs shadow-sky-600/20 transition cursor-pointer disabled:opacity-50"
                                  >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                    <span>Start Task ➔</span>
                                  </button>
                                ) : (
                                  <span
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 text-slate-500 border border-slate-200 text-[10px] font-medium"
                                    title={
                                      isSprintPlanned
                                        ? `Sprint "${task.sprint?.name || "Sprint"}" has not started yet. Team Lead/Manager will start the sprint.`
                                        : "Backlog item in planning. Task will activate when added to an active sprint."
                                    }
                                  >
                                    <span>{isSprintPlanned ? "⏳ Sprint Planned" : "📦 In Backlog"}</span>
                                  </span>
                                )
                              )}

                              {(task.status === "IN_PROGRESS" || task.status === "REVIEW") && (
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() =>
                                    setProgressModalTask({
                                      task,
                                      targetStatus: "COMPLETED",
                                      projectId: task.project_id,
                                    })
                                  }
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-xs shadow-emerald-600/20 transition cursor-pointer disabled:opacity-50"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                  <span>Mark Done ✓</span>
                                </button>
                              )}

                              {task.status === "COMPLETED" && (
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() =>
                                    setProgressModalTask({
                                      task,
                                      targetStatus: "IN_PROGRESS",
                                      projectId: task.project_id,
                                    })
                                  }
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-[11px] font-semibold transition cursor-pointer"
                                  title="Click to reopen task and resume progress"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                  </svg>
                                  <span>Reopen</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : activeViewMode === "analytics" ? (
          /* ========================================================================= */
          /* MANAGER & TEAM LEAD PERFORMANCE & PROGRESS BAR CHARTS DASHBOARD */
          /* ========================================================================= */
          <div className="space-y-6 animate-fadeIn">
            {/* Sleek Top Toolbar: Member Selector (Only Individual View) */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-xs shadow-blue-500/20 shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    <span>Individual Member Performance</span>
                    {loadingAnalytics && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-blue-600 font-normal">
                        <span className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        <span>Updating…</span>
                      </span>
                    )}
                  </h3>
                </div>
              </div>

              {/* Sleek Sub-Tab Switcher & Member Filter */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setPerfViewMode("overview")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      perfViewMode === "overview"
                        ? "bg-white text-blue-600 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    📊 Live Task Status &amp; KPIs
                  </button>
                  <button
                    type="button"
                    onClick={() => setPerfViewMode("monthly")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      perfViewMode === "monthly"
                        ? "bg-white text-blue-600 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    📅 Month-End Sprint Rollup
                  </button>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  {perfViewMode === "monthly" && (
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => {
                        setSelectedMonth(e.target.value);
                        fetchMonthlyPerformance(e.target.value);
                      }}
                      className="bg-white border border-blue-200 text-slate-800 text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-600 cursor-pointer shadow-2xs"
                    />
                  )}

                  <div className="flex items-center gap-2 bg-blue-50/50 px-3.5 py-1.5 rounded-xl border border-blue-100 shadow-2xs">
                    <span className="text-xs font-bold text-slate-700 shrink-0">Member:</span>
                    <select
                      value={analyticsEmployeeFilter}
                      onChange={(e) => setAnalyticsEmployeeFilter(e.target.value)}
                      className="bg-white border border-blue-200 text-slate-800 text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-600 cursor-pointer shadow-2xs"
                    >
                      {departmentEmployees.length === 0 ? (
                        <option value="">No department members found</option>
                      ) : (
                        departmentEmployees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.full_name} ({emp.designation || "Employee"})
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {perfViewMode === "monthly" ? (
              /* MONTHLY SPRINT ROLLUP TABLE */
              <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden space-y-4 p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <h4 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                      <span>Month-End Sprint Performance Rollup</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        {selectedMonth}
                      </span>
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Summarizes finalized sprint evaluation snapshots for this calendar month.
                    </p>
                  </div>

                  {loadingMonthlyData && (
                    <span className="text-xs text-blue-600 flex items-center gap-1.5">
                      <span className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      Loading rollup…
                    </span>
                  )}
                </div>

                {(!monthlyData?.employeeRollups || monthlyData.employeeRollups.length === 0) ? (
                  <div className="py-12 text-center text-xs text-slate-400 italic">
                    No finalized sprint evaluations found for {selectedMonth}. Sprint evaluations completed by Team Leads will appear here automatically.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-600 border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                          <th className="py-3 px-3">Employee</th>
                          <th className="py-3 px-3">Evaluated Sprints</th>
                          <th className="py-3 px-3">Story Points (Done/Total)</th>
                          <th className="py-3 px-3">Avg Progress</th>
                          <th className="py-3 px-3">Avg Exec Score</th>
                          <th className="py-3 px-3">Delayed Tasks</th>
                          <th className="py-3 px-3">Monthly Final Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {monthlyData.employeeRollups.map((row) => (
                          <tr key={row.employeeId} className="hover:bg-slate-50/70 transition">
                            <td className="py-3 px-3 font-semibold text-slate-900">
                              {row.employee?.full_name || "Employee"}
                              <span className="block text-[10px] text-slate-400 font-normal">
                                {row.employee?.designation || "Member"}
                              </span>
                            </td>
                            <td className="py-3 px-3 font-mono font-bold text-slate-700">
                              {row.evaluatedSprintsCount} Sprints
                            </td>
                            <td className="py-3 px-3 font-mono">
                              <span className="font-bold text-emerald-700">{row.totalCompletedPoints}</span> / {row.totalAssignedPoints} pts
                            </td>
                            <td className="py-3 px-3 font-mono font-bold text-blue-700">
                              {row.avgProgress}%
                            </td>
                            <td className="py-3 px-3 font-mono font-bold text-slate-800">
                              {row.avgExecutionScore} / 10
                            </td>
                            <td className="py-3 px-3 font-mono">
                              <span className={row.totalDelayedTasks > 0 ? "text-rose-600 font-bold" : "text-slate-600"}>
                                {row.totalDelayedTasks}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-black text-sm text-slate-900">
                                  {row.avgFinalScore}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  row.performanceBadge === "Exceptional"
                                    ? "bg-purple-100 text-purple-800 border border-purple-200"
                                    : row.performanceBadge === "High Performer"
                                    ? "bg-blue-100 text-blue-800 border border-blue-200"
                                    : row.performanceBadge === "On Track"
                                    ? "bg-amber-100 text-amber-800 border border-amber-200"
                                    : "bg-rose-100 text-rose-800 border border-rose-200"
                                }`}>
                                  {row.performanceBadge}
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : selectedEmployeeAnalytics ? (
              /* ========================================================================= */
              /* INDIVIDUAL EMPLOYEE TASK STATUS & DELIVERABLES VIEW */
              /* ========================================================================= */
              <div className="space-y-6">
                {/* 4 Clean Key KPI Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                  {/* Card 1: Execution */}
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-1">
                    <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                      <span>🎯 Execution</span>
                      <span className="text-blue-600 font-mono text-xs">{selectedEmployeeAnalytics.completionRate}%</span>
                    </div>
                    <div className="text-2xl font-black font-mono tracking-tight text-slate-900">
                      {selectedEmployeeAnalytics.executionDisplay}
                    </div>
                    <p className="text-[11px] text-slate-500">Completed / Total Tasks</p>
                  </div>

                  {/* Card 2: Delayed Tasks */}
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-1">
                    <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                      <span>⏰ Delayed Tasks</span>
                      <span className="text-purple-600 font-mono text-xs">{selectedEmployeeAnalytics.onTimeRate}% on-time</span>
                    </div>
                    <div className={`text-2xl font-black font-mono tracking-tight ${selectedEmployeeAnalytics.delayedTasks > 0 ? "text-rose-600" : "text-emerald-700"}`}>
                      {selectedEmployeeAnalytics.delayedTasks}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {selectedEmployeeAnalytics.totalDelayDays > 0 ? `${selectedEmployeeAnalytics.totalDelayDays} days delay` : "Zero delay against deadline"}
                    </p>
                  </div>

                  {/* Card 3: Active Progress */}
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-1">
                    <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                      <span>📈 Task Progress</span>
                      <span className="text-emerald-600 font-mono text-xs">Velocity</span>
                    </div>
                    <div className="text-2xl font-black font-mono tracking-tight text-blue-700">
                      {selectedEmployeeAnalytics.avgProgress}%
                    </div>
                    <p className="text-[11px] text-slate-500">Active Task Progress</p>
                  </div>

                  {/* Card 4: Performance Score */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-950 text-white shadow-2xs space-y-1">
                    <div className="flex items-center justify-between text-blue-300 text-[11px] font-bold uppercase tracking-wider">
                      <span>🏆 Overall Score</span>
                    </div>
                    <div className="text-2xl font-black font-mono tracking-tight text-white">
                      {selectedEmployeeAnalytics.calculatedScore}
                      <span className="text-xs font-normal text-slate-300 font-sans"> / 100</span>
                    </div>
                    <span className="inline-block text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-blue-500/30 text-blue-200 border border-blue-400/40">
                      {selectedEmployeeAnalytics.performanceBadge}
                    </span>
                  </div>
                </div>

                {/* Individual Employee Task Status Bar Chart Card */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 space-y-6 shadow-xs">
                  {/* Header: Employee Name, Role Badge, Department & Total Tasks */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-base flex items-center justify-center shadow-xs shadow-blue-500/20 shrink-0">
                        {selectedEmployeeAnalytics.employee?.full_name?.charAt(0).toUpperCase() || "E"}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-bold text-slate-900 tracking-tight">
                            {selectedEmployeeAnalytics.employee?.full_name}
                          </h3>
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200/80">
                            {selectedEmployeeAnalytics.employee?.designation || "Employee"}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {selectedEmployeeAnalytics.employee?.department || "Department"} • {selectedEmployeeAnalytics.total} Assigned Tasks
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      {/* Button to open Sprint Performance Evaluation Modal for this member */}
                      {scopedProjects.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            // Find active sprint or first sprint in scoped projects
                            const allSprints = scopedProjects.flatMap((p) => p.sprints || []);
                            const targetSprint = allSprints.find((s) => s.status === "ACTIVE") || allSprints[0] || {
                              id: "current-sprint",
                              name: "Sprint 1",
                              project_id: scopedProjects[0]?.id,
                            };
                            setSelectedSprintForPerfEval(targetSprint);
                          }}
                          className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition cursor-pointer shadow-2xs flex items-center gap-1.5"
                          title="Evaluate sprint performance and save finalized snapshot for this member"
                        >
                          <span>⭐</span>
                          <span>Evaluate Sprint Performance</span>
                        </button>
                      )}

                      <span className="text-xs font-mono font-bold text-blue-800 bg-blue-50/80 border border-blue-100 px-3 py-1 rounded-xl">
                        {selectedEmployeeAnalytics.total} Tasks Total
                      </span>
                    </div>
                  </div>

                  {/* 4 Vertical Bars: To Do, In Progress, Completed, Overdue */}
                  {(() => {
                    const maxVal = Math.max(
                      selectedEmployeeAnalytics.todo,
                      selectedEmployeeAnalytics.inProgress,
                      selectedEmployeeAnalytics.completed,
                      selectedEmployeeAnalytics.overdue,
                      1
                    );

                    const bars = [
                      {
                        label: "To Do",
                        count: selectedEmployeeAnalytics.todo,
                        color: "from-blue-300 to-blue-400",
                        textColor: "text-blue-800",
                        iconColor: "text-blue-500",
                        icon: (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                        ),
                      },
                      {
                        label: "In Progress",
                        count: selectedEmployeeAnalytics.inProgress,
                        color: "from-blue-500 to-blue-600",
                        textColor: "text-blue-700",
                        iconColor: "text-blue-600",
                        icon: (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        ),
                      },
                      {
                        label: "Completed",
                        count: selectedEmployeeAnalytics.completed,
                        color: "from-blue-700 to-indigo-700",
                        textColor: "text-blue-900",
                        iconColor: "text-blue-700",
                        icon: (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        ),
                      },
                      {
                        label: "Overdue",
                        count: selectedEmployeeAnalytics.overdue,
                        color: "from-indigo-800 to-blue-950",
                        textColor: "text-indigo-900",
                        iconColor: "text-indigo-800",
                        icon: (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        ),
                      },
                    ];

                    return (
                      <div className="pt-1">
                        <div className="h-56 flex items-end justify-between gap-3 sm:gap-6 px-4 sm:px-8 pb-4 pt-4 border border-blue-100 bg-blue-50/30 rounded-2xl">
                          {bars.map((bar, idx) => {
                            const heightPercent = Math.max(Math.round((bar.count / maxVal) * 100), bar.count > 0 ? 14 : 6);
                            const sharePercent = selectedEmployeeAnalytics.total > 0 ? Math.round((bar.count / selectedEmployeeAnalytics.total) * 100) : 0;

                            return (
                              <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                                <span className={`text-xs font-mono font-bold ${bar.textColor}`}>
                                  {bar.count}
                                </span>
                                <div className="w-full max-w-[56px] sm:max-w-[64px] bg-blue-50/80 rounded-t-xl overflow-hidden flex flex-col justify-end relative h-36 border border-blue-100/60 shadow-inner">
                                  <div
                                    style={{ height: `${heightPercent}%` }}
                                    className={`w-full rounded-t-xl bg-gradient-to-t ${bar.color} transition-all duration-500 shadow-xs group-hover:brightness-105`}
                                    title={`${bar.label}: ${bar.count} tasks (${sharePercent}%)`}
                                  />
                                </div>
                                <div className="text-center space-y-0.5 pt-1.5 flex flex-col items-center">
                                  <div className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-slate-700 whitespace-nowrap">
                                    <span className={bar.iconColor}>{bar.icon}</span>
                                    <span>{bar.label}</span>
                                  </div>
                                  <span className="text-[10px] font-mono text-blue-600 block">
                                    {sharePercent}%
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* 2. Assigned Deliverables List for this Employee */}
                <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
                  <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <span>Assigned Tasks for {selectedEmployeeAnalytics.employee?.full_name}</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        All active and completed tasks across projects
                      </p>
                    </div>
                    <span className="text-xs font-mono font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-xl">
                      {selectedEmployeeAnalytics.tasks.length} Deliverables
                    </span>
                  </div>

                  {selectedEmployeeAnalytics.tasks.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400 italic">
                      No subtasks currently assigned to this member.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {selectedEmployeeAnalytics.tasks.map((task) => {
                        const stConfig = TASK_STATUS_CONFIG[task.status] || TASK_STATUS_CONFIG.TODO;
                        const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== "COMPLETED";

                        return (
                          <div key={task.id} className="p-4 hover:bg-slate-50/70 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-slate-900">{task.title}</span>
                                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                  <svg className="w-3 h-3 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                  </svg>
                                  <span className="truncate max-w-[160px]">{task.projectName}</span>
                                </span>
                                {task.priority && (
                                  <span className="text-[9px] font-bold text-slate-500 uppercase border border-slate-200 px-1.5 py-0.2 rounded">
                                    {task.priority}
                                  </span>
                                )}
                              </div>
                              {task.description && (
                                <p className="text-[11px] text-slate-500 truncate">{task.description}</p>
                              )}
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              {task.due_date && (
                                <span className={`inline-flex items-center gap-1 text-[11px] font-mono font-medium ${isOverdue ? "text-rose-600 font-bold" : "text-slate-500"}`}>
                                  <svg className="w-3 h-3 shrink-0 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                  <span>{new Date(task.due_date).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                                </span>
                              )}
                              <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-lg border shadow-2xs ${stConfig.bg} ${stConfig.color}`}>
                                <TaskStatusIcon status={task.status} />
                                <span>{stConfig.label}</span>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200/80 rounded-2xl p-12 text-center space-y-3 shadow-xs">
                <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mx-auto border border-sky-100">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h4 className="text-sm font-bold text-slate-900">No Department Member Selected</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Select an individual member from the dropdown above to view their task status and assigned deliverables.
                </p>
              </div>
            )}
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="py-16 text-center space-y-3 bg-white rounded-2xl border border-dashed border-slate-200 shadow-2xs">
            <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mx-auto border border-sky-100">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-slate-800">
              {scopedProjects.length === 0
                ? isTeamLead
                  ? "No Projects Assigned to You Yet"
                  : isEmployee
                  ? "No Projects Assigned to You Yet"
                  : "No Projects Created Yet"
                : "No Matching Projects Found"}
            </p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {scopedProjects.length === 0
                ? isTeamLead
                  ? "Your Department Manager has not assigned any deliverables to you yet."
                  : isEmployee
                  ? "When deliverables in projects are assigned to you, the project product view will appear here with live tracking."
                  : "Click 'Create Project' above to create your first project and assign it to a Team Lead."
                : `No projects match "${searchQuery}". Try adjusting your filters.`}
            </p>
          </div>
        ) : (
          <div className="space-y-6 w-full">
            {filteredProjects.map((project) => {
              const priority = PRIORITY_CONFIG[project.priority] || PRIORITY_CONFIG.MEDIUM;
              const status = STATUS_CONFIG[project.status] || STATUS_CONFIG.PLANNING;
              const isLead = isTeamLead && project.team_lead_id === employeeProfile?.id;
              const isCreator = isManager && project.created_by === employeeProfile?.id;
              const isDeptManager = isManager && (project.created_by === employeeProfile?.id || project.department?.toLowerCase().trim() === employeeProfile?.department?.toLowerCase().trim());
              const canManageProjectTasks = isLead || isDeptManager || isAdmin;
              const leadName = project.teamLead?.full_name || "Unassigned";
              const leadInitial = leadName.charAt(0).toUpperCase();

              // Subtasks stats for this project
              const tasks = projectTasks[project.id] || [];
              const totalTasks = tasks.length;
              const completedTasks = tasks.filter((t) => t.status === "COMPLETED").length;
              const inProgressTasks = tasks.filter((t) => t.status === "IN_PROGRESS").length;
              const todoTasks = tasks.filter((t) => t.status === "TODO").length;

              const hasSubtasks = totalTasks > 0;
              const dynamicProgress = hasSubtasks
                ? Math.round((completedTasks / totalTasks) * 100)
                : project.status === "COMPLETED"
                ? 100
                : project.status === "IN_PROGRESS"
                ? 50
                : project.status === "PLANNING"
                ? 15
                : 0;

              const isExpanded = !collapsedProjects.has(project.id);
              const isLoadingThisTasks = loadingTasks[project.id];

              // Unique assigned team members in this project (from subtasks + project-level team members)
              const assignedMembers = Array.from(
                tasks.reduce((map, t) => {
                  const empObj =
                    t.assignee ||
                    departmentEmployees.find((e) => e.id === (t.assigned_to || t.assignee_id)) ||
                    teamLeads.find((l) => l.id === (t.assigned_to || t.assignee_id));
                  if (empObj && !map.has(empObj.id)) {
                    map.set(empObj.id, empObj);
                  }
                  return map;
                }, new Map()).values()
              );

              if (Array.isArray(project.teamMembers)) {
                project.teamMembers.forEach((m) => {
                  if (m && !assignedMembers.some((am) => am.id === m.id)) {
                    assignedMembers.push(m);
                  }
                });
              }

              const isProjectOverdue =
                project.end_date &&
                new Date(project.end_date) < new Date() &&
                project.status !== "COMPLETED";

              const statusAccentBorder =
                project.status === "COMPLETED"
                  ? "border-l-blue-700"
                  : project.status === "IN_PROGRESS"
                  ? "border-l-blue-600"
                  : project.status === "ON_HOLD"
                  ? "border-l-blue-400"
                  : project.status === "CANCELLED"
                  ? "border-l-slate-400"
                  : "border-l-blue-500";

              return (
                <div
                  key={project.id}
                  className={`rounded-2xl bg-white border border-slate-200/90 border-l-4 ${statusAccentBorder} hover:border-blue-200 transition-all duration-200 shadow-2xs hover:shadow-xs flex flex-col justify-between overflow-hidden group`}
                >
                  <div className="p-5 sm:p-6 space-y-4">
                    {/* Top Row: Product Identity & Status Control */}
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2 min-w-0 flex-1">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shrink-0 shadow-2xs">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                              </svg>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                              <h3
                                onClick={() => setActiveWorkspaceProject(project)}
                                className="text-base sm:text-lg font-bold text-slate-900 tracking-tight hover:text-blue-600 transition-colors truncate cursor-pointer"
                                title="Click to open Project Workspace (Overview, Backlog, Epics, Sprints, Board)"
                              >
                                {project.name}
                              </h3>
                              {project.project_type && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80 font-mono">
                                  🏃 {project.project_type}
                                </span>
                              )}
                              {project.project_group && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200/80">
                                  🏷️ {project.project_group}
                                </span>
                              )}
                              {project.creator && (
                                <span className="text-[10px] text-slate-500 font-medium hidden sm:inline">
                                  Owner: <strong className="text-slate-700">{project.creator.full_name}</strong>
                                </span>
                              )}
                            </div>
                          </div>

                          {project.description && (
                            <p className="text-xs text-slate-600 leading-relaxed max-w-3xl">
                              {project.description}
                            </p>
                          )}
                        </div>

                        {/* Status selector, Workspace & Delete Button */}
                        <div className="shrink-0 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveWorkspaceProject(project)}
                            className="px-2.5 py-1 text-xs font-semibold rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition cursor-pointer flex items-center gap-1 shadow-2xs"
                            title="Open Project Workspace (Overview, Backlog, Epics, Sprints, Board)"
                          >
                            <span>Workspace</span>
                            <span>→</span>
                          </button>
                          {isAdmin || isDeptManager || isCreator || isLead ? (
                            <div className="relative inline-block">
                              <select
                                value={project.status}
                                disabled={updatingProjectId === project.id}
                                onChange={(e) => handleStatusChange(project.id, e.target.value)}
                                className={`text-xs font-bold rounded-xl pl-3 pr-8 py-1.5 border transition cursor-pointer focus:outline-none appearance-none shadow-2xs ${status.bg} ${status.color}`}
                                title="Update Project Status"
                              >
                                <option value="PLANNING">Planning</option>
                                <option value="IN_PROGRESS">In Progress</option>
                                <option value="COMPLETED">Completed</option>
                                <option value="ON_HOLD">On Hold</option>
                                <option value="CANCELLED">Cancelled</option>
                              </select>
                              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-current opacity-70">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                              </div>
                            </div>
                          ) : (
                            <span className={`text-xs font-semibold rounded-full px-3 py-1 border inline-flex items-center gap-1.5 shadow-2xs ${status.bg} ${status.color}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${status.dot || "bg-slate-400"}`} />
                              <span>{status.label}</span>
                            </span>
                          )}

                          {(isCreator || isDeptManager || isAdmin) && (
                            <button
                              type="button"
                              onClick={() => handleDelete(project.id, project.name)}
                              className="text-slate-300 hover:text-rose-600 p-1.5 transition cursor-pointer rounded-lg hover:bg-rose-50"
                              title="Delete Project"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Prominent Feature Highlights: ASSIGNED TO & SCHEDULE DATE (Blue Theme Styling) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-3 pb-3 border-y border-blue-50/80 items-stretch text-xs">
                      {/* Feature 1: ASSIGNED TO */}
                      <div className="p-3 rounded-xl bg-blue-50/30 hover:bg-blue-50/60 border border-blue-100/80 transition-colors flex items-center justify-between gap-3 min-w-0 shadow-2xs">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="relative shrink-0">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-sm flex items-center justify-center shadow-xs">
                              {leadInitial}
                            </div>
                            {project.teamLead?.auth_user_id && onlineUserIds.has(project.teamLead.auth_user_id) && (
                              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                                ASSIGNED TO
                              </span>
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                                Team Lead
                              </span>
                            </div>
                            <p className="text-xs font-bold text-slate-900 truncate">
                              {leadName}
                            </p>
                            {project.teamLead?.designation && (
                              <p className="text-[10px] text-slate-500 truncate">
                                {project.teamLead.designation}
                              </p>
                            )}
                          </div>
                        </div>

                      </div>

                      {/* Feature 2: SCHEDULE DATE */}
                      <div className="p-3 rounded-xl bg-blue-50/30 hover:bg-blue-50/60 border border-blue-100/80 transition-colors flex items-center justify-between gap-3 min-w-0 shadow-2xs">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider block">
                              SCHEDULE DATE
                            </span>
                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 truncate">
                              <span>{project.start_date ? new Date(project.start_date).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "Start Date"}</span>
                              <span className="text-slate-400 font-normal">→</span>
                              <span>{project.end_date ? new Date(project.end_date).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "Ongoing"}</span>
                            </div>
                          </div>
                        </div>

                        {/* Status Tag on the right of Schedule Date */}
                        <div className="shrink-0 pl-2">
                          {isProjectOverdue ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-bold shadow-2xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                              Overdue
                            </span>
                          ) : project.status === "COMPLETED" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold shadow-2xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Delivered
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-100/80 border border-blue-200 text-blue-800 text-[11px] font-bold shadow-2xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                              On Schedule
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Assigned Team Members Section Action Bar */}
                    <div className="flex items-center justify-between pt-1 gap-3">
                      <button
                        type="button"
                        onClick={() => toggleProjectExpand(project.id)}
                        className="inline-flex items-center gap-2 text-xs font-bold text-slate-900 hover:text-blue-600 transition cursor-pointer"
                      >
                        <svg
                          className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? "rotate-180 text-blue-600" : "text-slate-400"}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                        <span>Assigned Team Members</span>
                        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold font-mono border border-blue-200">
                          {assignedMembers.length}
                        </span>
                      </button>

                      <div className="flex items-center gap-2">
                        {canManageProjectTasks && (
                          <button
                            type="button"
                            onClick={() => openTaskModal(project)}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs shadow-blue-600/20 transition cursor-pointer"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                            <span>Add Deliverable</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expandable Assigned Team Members List */}
                    {isExpanded && (
                      <div className="pt-2 animate-fadeIn space-y-2">
                        {isLoadingThisTasks && tasks.length === 0 ? (
                          <div className="py-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                            <span>Loading team members…</span>
                          </div>
                        ) : assignedMembers.length === 0 ? (
                          <div className="p-6 text-center rounded-xl bg-slate-50/50 border border-dashed border-slate-200 space-y-2">
                            <p className="text-xs text-slate-500">No team members assigned with deliverables yet.</p>
                            {canManageProjectTasks && (
                              <button
                                type="button"
                                onClick={() => openTaskModal(project)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 cursor-pointer transition"
                              >
                                <span>+</span>
                                <span>Add &amp; Assign First Deliverable</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200/80 bg-white overflow-hidden shadow-2xs">
                            {assignedMembers.map((member) => {
                              const memberTasks = tasks.filter(
                                (t) => t.assigned_to === member.id || t.assignee_id === member.id
                              );
                              const memberTotal = memberTasks.length;
                              const memberCompleted = memberTasks.filter((t) => t.status === "COMPLETED").length;
                              const memberInProgress = memberTasks.filter((t) => t.status === "IN_PROGRESS").length;
                              const memberTodo = memberTasks.filter((t) => t.status === "TODO").length;
                              const memberOverdue = memberTasks.filter(
                                (t) => t.due_date && new Date(t.due_date) < new Date() && t.status !== "COMPLETED"
                              ).length;
                              const memberProgressPct = memberTotal > 0 ? Math.round((memberCompleted / memberTotal) * 100) : 0;
                              const isOnline = member.auth_user_id && onlineUserIds.has(member.auth_user_id);

                              return (
                                <div
                                  key={member.id}
                                  onClick={() =>
                                    setSelectedMemberModal({
                                      project,
                                      member,
                                      tasks: memberTasks,
                                    })
                                  }
                                  className="p-3 sm:px-4 sm:py-3.5 hover:bg-blue-50/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 group/member cursor-pointer"
                                >
                                  {/* Left: Avatar, Full Name, Designation, Department */}
                                  <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <div className="relative shrink-0">
                                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                                        {member.full_name?.charAt(0).toUpperCase() || "M"}
                                      </div>
                                      {isOnline && (
                                        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <h4 className="text-xs font-bold text-slate-900 group-hover/member:text-blue-600 transition-colors truncate">
                                          {member.full_name}
                                        </h4>
                                        {member.designation && (
                                          <span className="text-[10px] font-medium px-2 py-0.2 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                            {member.designation}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[11px] text-slate-500 truncate">
                                        {member.department || project.department || "Department Member"}
                                      </p>
                                    </div>
                                  </div>

                                  {/* Right: Quick Progress Chips & "View Tasks & Progress" Action Button */}
                                  <div className="flex items-center gap-3 shrink-0 flex-wrap sm:flex-nowrap justify-between sm:justify-end">
                                    {/* Task Summary Badges */}
                                    <div className="flex items-center gap-1.5 text-[10px] font-semibold">
                                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono border border-slate-200">
                                        {memberTotal} {memberTotal === 1 ? "task" : "tasks"}
                                      </span>
                                      {memberCompleted > 0 && (
                                        <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-mono border border-emerald-200">
                                          {memberCompleted} done
                                        </span>
                                      )}
                                      {memberInProgress > 0 && (
                                        <span className="px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 font-mono border border-blue-200">
                                          {memberInProgress} active
                                        </span>
                                      )}
                                      {memberOverdue > 0 && (
                                        <span className="px-1.5 py-0.5 rounded-md bg-blue-100/90 text-blue-900 font-mono border border-blue-300">
                                          {memberOverdue} late
                                        </span>
                                      )}
                                    </div>

                                    {/* Progress Bar & Percentage */}
                                    <div className="hidden md:flex items-center gap-1.5 w-24">
                                      <div className="flex-1 h-1.5 rounded-full bg-blue-100/70 overflow-hidden">
                                        <div
                                          className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full transition-all duration-300"
                                          style={{ width: `${memberProgressPct}%` }}
                                        />
                                      </div>
                                      <span className="text-[10px] font-mono font-bold text-blue-800">
                                        {memberProgressPct}%
                                      </span>
                                    </div>

                                    {/* View Tasks Action Button */}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedMemberModal({
                                          project,
                                          member,
                                          tasks: memberTasks,
                                        });
                                      }}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200/90 text-xs font-bold transition shadow-2xs cursor-pointer group-hover/member:bg-blue-600 group-hover/member:text-white"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                      </svg>
                                      <span>View Tasks</span>
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
              );
            })}
          </div>
        )}
      </div>

      {/* --- CREATE PROJECT MODAL (Zoho Sprints Real-Time Engine) --- */}
      <CreateProjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onProjectCreated={(newProj) => {
          fetchProjects();
          if (newProj) {
            setActiveWorkspaceProject(newProj);
          }
        }}
        userRole={userRole}
        employeeProfile={employeeProfile}
        teamLeads={teamLeads}
        departmentEmployees={allEmployeesList.length > 0 ? allEmployeesList : departmentEmployees}
        allEmployees={allEmployeesList.length > 0 ? allEmployeesList : departmentEmployees}
        onlineUserIds={onlineUserIds}
      />

      {/* --- CREATE & ASSIGN SUBTASK MODAL (Team Lead / Manager) --- */}
      {isTaskModalOpen && selectedProjectForTask && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsTaskModalOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-6 bg-slate-900/60 backdrop-blur-xs animate-fadeIn overflow-hidden"
        >
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden animate-scaleUp">
            {/* Modal Header */}
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3 bg-gradient-to-r from-sky-50/60 to-indigo-50/60">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-sky-600 text-white flex items-center justify-center font-bold text-sm shadow-xs shadow-sky-600/30">
                  🎯
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                    Assign Subtask to Team Member
                  </h3>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                    <span className="font-semibold text-slate-700 truncate max-w-[180px]">{selectedProjectForTask.name}</span>
                    <span>•</span>
                    <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 text-[10px] font-bold">
                      {selectedProjectForTask.department || "Engineering"}
                    </span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsTaskModalOpen(false)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white/80 flex items-center justify-center transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body / Form */}
            <form id="create-subtask-form" onSubmit={handleCreateTaskSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto">
              {taskFormError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{taskFormError}</span>
                </div>
              )}

              {/* Task Title */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800">
                  Subtask Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Implement API endpoint, Design mockups, Write unit tests…"
                  value={taskFormData.title}
                  onChange={(e) => setTaskFormData((prev) => ({ ...prev, title: e.target.value }))}
                  className="w-full text-xs px-3 py-2 bg-slate-50/70 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500 focus:bg-white transition"
                />
              </div>

              {/* Task Description */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800">
                  Description &amp; Acceptance Criteria (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Specific requirements, checklist, or deliverable details for the employee…"
                  value={taskFormData.description}
                  onChange={(e) => setTaskFormData((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full text-xs px-3 py-2 bg-slate-50/70 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500 focus:bg-white transition resize-none"
                />
              </div>

              {/* Department Employee Assignee Selection */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                    Assign to Department Employee *
                  </label>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {selectedProjectForTask.department} Team
                  </span>
                </div>

                {departmentEmployees.filter(
                  (e) => !selectedProjectForTask.department || e.department?.toLowerCase() === selectedProjectForTask.department?.toLowerCase()
                ).length === 0 ? (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                    No employees found in department &quot;{selectedProjectForTask.department}&quot;.
                  </div>
                ) : (
                  <select
                    value={taskFormData.assignee_id}
                    onChange={(e) => setTaskFormData((prev) => ({ ...prev, assignee_id: e.target.value }))}
                    className="w-full text-xs px-3 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500 transition cursor-pointer font-medium text-slate-800"
                  >
                    {departmentEmployees
                      .filter(
                        (e) =>
                          !selectedProjectForTask.department ||
                          e.department?.toLowerCase() === selectedProjectForTask.department?.toLowerCase()
                      )
                      .map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.full_name} — {emp.designation || "Department Employee"} ({emp.email})
                        </option>
                      ))}
                  </select>
                )}

                {/* Selected Employee Preview Pill */}
                {taskFormData.assignee_id && (() => {
                  const emp = departmentEmployees.find((e) => e.id === taskFormData.assignee_id);
                  if (!emp) return null;
                  const isOnline = emp.auth_user_id && onlineUserIds.has(emp.auth_user_id);
                  return (
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
                        <div className="relative">
                          <div className="w-7 h-7 rounded-lg bg-sky-100 text-sky-800 font-bold text-xs flex items-center justify-center border border-sky-200">
                            {emp.full_name?.charAt(0).toUpperCase()}
                          </div>
                          {isOnline && (
                            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{emp.full_name}</p>
                          <p className="text-[10px] text-slate-500">{emp.designation || "Department Employee"}</p>
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        isOnline ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"
                      }`}>
                        {isOnline ? "🟢 Online Now" : "⚪ Offline"}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Priority & Due Date Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Priority */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-800">Priority</label>
                  <select
                    value={taskFormData.priority}
                    onChange={(e) => setTaskFormData((prev) => ({ ...prev, priority: e.target.value }))}
                    className="w-full text-xs px-3 py-2 bg-slate-50/70 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500 focus:bg-white transition cursor-pointer"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>

                {/* Due Date */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-800">Due Date</label>
                  <input
                    type="date"
                    value={taskFormData.due_date}
                    onChange={(e) => setTaskFormData((prev) => ({ ...prev, due_date: e.target.value }))}
                    className="w-full text-xs px-3 py-2 bg-slate-50/70 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-500 focus:bg-white transition font-mono"
                  />
                </div>
              </div>
            </form>

            {/* Modal Footer */}
            <div className="px-5 sm:px-6 py-3 border-t border-slate-100 bg-slate-50/80 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsTaskModalOpen(false)}
                className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 font-semibold transition border border-slate-200 text-xs cursor-pointer shadow-2xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="create-subtask-form"
                disabled={isCreatingTask || !taskFormData.title.trim() || !taskFormData.assignee_id}
                className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-bold transition cursor-pointer shadow-xs text-xs flex items-center gap-1.5"
              >
                {isCreatingTask ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Assigning…</span>
                  </>
                ) : (
                  <>
                    <span>🎯</span>
                    <span>Assign Subtask</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}



      {/* --- EMPLOYEE STATUS & BAR GRAPH POPUP MODAL --- */}
      {selectedMemberModal && (() => {
        const { project: modalProject, member: modalMember } = selectedMemberModal;
        const isLead = isTeamLead && modalProject.team_lead_id === employeeProfile?.id;
        const isDeptManager = isManager && (modalProject.created_by === employeeProfile?.id || modalProject.department?.toLowerCase().trim() === employeeProfile?.department?.toLowerCase().trim());
        const canManageProjectTasks = isLead || isDeptManager || isAdmin;

        const currentTasks = (projectTasks[modalProject.id] || []).filter(
          (t) => t.assigned_to === modalMember.id || t.assignee_id === modalMember.id
        );
        const total = currentTasks.length;
        const todo = currentTasks.filter((t) => t.status === "TODO").length;
        const inProgress = currentTasks.filter((t) => t.status === "IN_PROGRESS").length;
        const completed = currentTasks.filter((t) => t.status === "COMPLETED").length;
        const overdue = currentTasks.filter(
          (t) => t.due_date && new Date(t.due_date) < new Date() && t.status !== "COMPLETED"
        ).length;
        const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
        const isOnline = modalMember.auth_user_id && onlineUserIds.has(modalMember.auth_user_id);
        const maxVal = Math.max(todo, inProgress, completed, overdue, 1);

        const bars = [
          {
            label: "To Do",
            count: todo,
            color: "from-blue-300 to-blue-400",
            textColor: "text-blue-700",
            icon: (
              <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            ),
          },
          {
            label: "In Progress",
            count: inProgress,
            color: "from-blue-500 to-blue-600",
            textColor: "text-blue-700",
            icon: (
              <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            ),
          },
          {
            label: "Completed",
            count: completed,
            color: "from-blue-700 to-indigo-700",
            textColor: "text-blue-900",
            icon: (
              <svg className="w-3.5 h-3.5 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ),
          },
          {
            label: "Overdue",
            count: overdue,
            color: "from-indigo-800 to-blue-950",
            textColor: "text-indigo-900",
            icon: (
              <svg className="w-3.5 h-3.5 text-indigo-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            ),
          },
        ];

        return (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedMemberModal(null);
            }}
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-6 bg-slate-900/60 backdrop-blur-xs animate-fadeIn overflow-y-auto"
          >
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-2xl max-w-3xl w-full overflow-hidden flex flex-col my-auto max-h-[90vh]">
              {/* Modal Header */}
              <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/70">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-sm flex items-center justify-center shadow-xs">
                      {modalMember.full_name?.charAt(0).toUpperCase() || "E"}
                    </div>
                    {isOnline && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-slate-900 tracking-tight truncate">
                        {modalMember.full_name}
                      </h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                        {modalMember.designation || "Employee"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 truncate">
                      <span>Project: <strong className="text-slate-800">{modalProject.name}</strong></span>
                      <span>•</span>
                      <span>{modalMember.department || modalProject.department || "General"}</span>
                      {isOnline && (
                        <>
                          <span>•</span>
                          <span className="text-emerald-600 font-semibold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Online
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedMemberModal(null)}
                  className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center transition cursor-pointer shrink-0"
                  title="Close Modal"
                >
                  ✕
                </button>
              </div>

              {/* Modal Body with Scroll */}
              <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
                {/* 1. Quick Stats Metric Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                  <div className="p-3 rounded-xl bg-blue-50/40 border border-blue-100 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total Tasks</span>
                    <div className="text-xl font-extrabold text-slate-900 font-mono mt-0.5">{total}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-200/70 shadow-2xs">
                    <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">To Do</span>
                    <div className="text-xl font-extrabold text-blue-800 font-mono mt-0.5">{todo}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-blue-50/80 border border-blue-200 shadow-2xs">
                    <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">In Progress</span>
                    <div className="text-xl font-extrabold text-blue-700 font-mono mt-0.5">{inProgress}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-blue-100/70 border border-blue-200 shadow-2xs">
                    <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider block">Completed</span>
                    <div className="text-xl font-extrabold text-blue-900 font-mono mt-0.5">{completed}</div>
                  </div>
                </div>

                {/* 2. Visual Bar Graph View */}
                <div className="p-4 sm:p-5 rounded-2xl bg-blue-50/30 border border-blue-100/80 space-y-3">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Individual Member Performance
                    </h4>
                  </div>

                  {/* 4 Vertical Bar Charts */}
                  <div className="h-44 flex items-end justify-between gap-3 sm:gap-6 px-4 sm:px-8 pb-3 pt-4 border-b border-blue-100 bg-white rounded-xl shadow-2xs">
                    {bars.map((bar, idx) => {
                      const heightPercent = Math.max(Math.round((bar.count / maxVal) * 100), bar.count > 0 ? 14 : 6);
                      const sharePercent = total > 0 ? Math.round((bar.count / total) * 100) : 0;

                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                          <span className={`text-xs font-mono font-bold ${bar.textColor}`}>
                            {bar.count}
                          </span>
                          <div className="w-full max-w-[48px] bg-blue-50/80 rounded-t-lg overflow-hidden flex flex-col justify-end relative h-28 border border-blue-100/60">
                            <div
                              className={`w-full rounded-t-lg bg-gradient-to-t ${bar.color} transition-all duration-500 ease-out group-hover:brightness-105 shadow-xs`}
                              style={{ height: `${heightPercent}%` }}
                            />
                          </div>
                          <div className="text-center">
                            <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-slate-700">
                              <span>{bar.label}</span>
                            </div>
                            <span className="text-[10px] font-mono text-blue-600">
                              {sharePercent}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Member Assigned Deliverables List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Assigned Deliverables ({total})
                    </h4>
                    {canCreate && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMemberModal(null);
                          openTaskModal(modalProject);
                        }}
                        className="text-xs font-bold text-blue-600 hover:text-blue-700 transition cursor-pointer"
                      >
                        + Add Deliverable
                      </button>
                    )}
                  </div>

                  {currentTasks.length === 0 ? (
                    <div className="p-8 text-center rounded-xl bg-slate-50 border border-dashed border-slate-200 space-y-1">
                      <p className="text-xs font-semibold text-slate-600">No deliverables assigned to this member yet</p>
                      <p className="text-[11px] text-slate-400">Tasks assigned to {modalMember.full_name} will appear here.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200/80 bg-white overflow-hidden shadow-2xs">
                      {currentTasks.map((task) => {
                        const taskPriority = TASK_PRIORITY_CONFIG[task.priority] || TASK_PRIORITY_CONFIG.MEDIUM;
                        const taskStatus = TASK_STATUS_CONFIG[task.status] || TASK_STATUS_CONFIG.TODO;
                        const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== "COMPLETED";

                        return (
                          <div
                            key={task.id}
                            className={`p-3.5 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                              task.status === "COMPLETED" ? "bg-slate-50/50" : "hover:bg-blue-50/20"
                            }`}
                          >
                            <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                              {/* Status Switcher / Pill */}
                              <div className="shrink-0">
                                {(() => {
                                  const isAssignedToCurrent = task.assigned_to === employeeProfile?.id || task.assignee_id === employeeProfile?.id;
                                  // Task status is disabled for Team Lead; only the assigned employee (or manager/admin) can update
                                  const canUpdateThisTask = isAssignedToCurrent || (!isTeamLead && canManageProjectTasks);

                                  if (canUpdateThisTask) {
                                    return (
                                      <div className="relative inline-block">
                                        <select
                                          value={task.status || "TODO"}
                                          disabled={updatingTaskId === task.id}
                                          onChange={(e) => {
                                            const nextStatus = e.target.value;
                                            if (nextStatus !== task.status) {
                                              handleTaskStatusChange(modalProject.id, task.id, nextStatus, `Status updated to ${nextStatus}`);
                                            }
                                          }}
                                          className={`text-[11px] font-bold rounded-lg pl-2 pr-6 py-1 border shadow-2xs cursor-pointer focus:outline-none appearance-none transition-all ${
                                            task.status === "COMPLETED"
                                              ? "bg-blue-100/80 text-blue-900 border-blue-300"
                                              : task.status === "IN_PROGRESS"
                                              ? "bg-blue-50 text-blue-700 border-blue-200"
                                              : "bg-slate-100 text-slate-700 border-slate-200"
                                          }`}
                                          title="Click to update deliverable status"
                                        >
                                          <option value="TODO" className="bg-white text-slate-700">To Do</option>
                                          <option value="IN_PROGRESS" className="bg-white text-blue-700">In Progress</option>
                                          <option value="COMPLETED" className="bg-white text-blue-900">Completed</option>
                                        </select>
                                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 text-current opacity-70">
                                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                          </svg>
                                        </div>
                                      </div>
                                    );
                                  }

                                  return (
                                    <div
                                      className="relative inline-block"
                                      title={isTeamLead ? "Status update disabled for Team Lead — Only the assigned employee can update this task" : "View-only task status"}
                                    >
                                      <span
                                        className={`text-[11px] font-semibold rounded-lg px-2.5 py-1 border inline-flex items-center gap-1.5 shadow-2xs ${
                                          isTeamLead
                                            ? "opacity-90 cursor-not-allowed bg-blue-50/60 border-blue-200 text-blue-900"
                                            : `${taskStatus.bg} ${taskStatus.color}`
                                        }`}
                                      >
                                        <TaskStatusIcon status={task.status} className="w-3 h-3" />
                                        <span>{taskStatus.label}</span>
                                      </span>
                                    </div>
                                  );
                                })()}
                              </div>

                              {/* Task Title & Priority */}
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-xs font-bold ${task.status === "COMPLETED" ? "line-through text-slate-400" : "text-slate-900"}`}>
                                    {task.title}
                                  </span>
                                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold border ${taskPriority.bg} ${taskPriority.color}`}>
                                    <span className={`w-1 h-1 rounded-full ${taskPriority.dot}`} />
                                    <span>{taskPriority.label}</span>
                                  </span>
                                </div>
                                {task.description && (
                                  <p className="text-[11px] text-slate-500 line-clamp-1">{task.description}</p>
                                )}
                              </div>
                            </div>

                            {/* Right: Due Date & History */}
                            <div className="flex items-center gap-2.5 shrink-0 pl-8 sm:pl-0 text-xs">
                              {task.due_date ? (
                                <span className={`inline-flex items-center gap-1 text-[10px] font-mono ${isOverdue ? "text-blue-900 font-bold" : "text-slate-500"}`}>
                                  <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                  <span>{new Date(task.due_date).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                                  {isOverdue && <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-100 border border-blue-200 text-blue-900 font-bold">Late</span>}
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[10px] italic">No due date</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-5 sm:px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedMemberModal(null)}
                  className="px-4 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-semibold transition border border-slate-200 text-xs cursor-pointer shadow-2xs"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Progress Status Update Modal */}
      {progressModalTask && (
        <TaskProgressUpdateModal
          isOpen={Boolean(progressModalTask)}
          onClose={() => setProgressModalTask(null)}
          task={progressModalTask.task}
          targetStatus={progressModalTask.targetStatus}
          project={projects.find((p) => p.id === progressModalTask.projectId)}
          employeeProfile={employeeProfile}
          onConfirm={async ({ taskId, newStatus, progress, comments, review_comments, review_attachments, review_submitted_at }) => {
            setIsUpdatingProgressModal(true);
            try {
              await handleTaskStatusChange(
                progressModalTask.projectId,
                taskId,
                newStatus,
                comments,
                null,
                progress,
                review_comments,
                review_attachments,
                review_submitted_at
              );
              setProgressModalTask(null);
            } finally {
              setIsUpdatingProgressModal(false);
            }
          }}
          isSubmitting={isUpdatingProgressModal}
        />
      )}

      {/* Detailed Description & Task Properties Modal */}
      {selectedTaskForDetail && (
        <TaskDetailModal
          task={
            myAssignedTasks.find((t) => t.id === selectedTaskForDetail.id) ||
            selectedTaskForDetail
          }
          project={projects.find((p) => p.id === (selectedTaskForDetail.project_id || selectedTaskForDetail.project?.id))}
          tasks={myAssignedTasks}
          sprints={selectedTaskForDetail?.sprint ? [selectedTaskForDetail.sprint] : []}
          epics={selectedTaskForDetail?.epic ? [selectedTaskForDetail.epic] : []}
          departmentEmployees={departmentEmployees}
          teamLeads={teamLeads}
          employeeProfile={employeeProfile}
          currentUserId={employeeProfile?.id}
          isOpen={Boolean(selectedTaskForDetail)}
          onClose={() => setSelectedTaskForDetail(null)}
          onTaskUpdated={() => {
            fetchBatchTasks();
            fetchProjects();
          }}
        />
      )}

      {/* Task Suggestion Modal (Rejection & Revision Guidance) */}
      {selectedTaskForSuggestion && (
        <TaskSuggestionModal
          isOpen={Boolean(selectedTaskForSuggestion)}
          onClose={() => setSelectedTaskForSuggestion(null)}
          task={
            myAssignedTasks.find((t) => t.id === selectedTaskForSuggestion.id) ||
            selectedTaskForSuggestion
          }
          project={projects.find((p) => p.id === (selectedTaskForSuggestion.project_id || selectedTaskForSuggestion.project?.id))}
          allEmployees={allEmployeesList}
          teamLeads={teamLeads}
          employeeProfile={employeeProfile}
          currentUserId={employeeProfile?.id}
          onAcknowledge={async (taskId) => {
            const projId = selectedTaskForSuggestion.project_id || selectedTaskForSuggestion.project?.id;
            await handleTaskStatusChange(projId, taskId, "IN_PROGRESS", null, null, 25);
            setSelectedTaskForSuggestion(null);
            showNotificationToast("Task moved to In Progress. Happy coding!", "success");
          }}
          onTaskUpdated={() => {
            fetchBatchTasks();
            fetchProjects();
          }}
          onOpenFullDetail={(t) => {
            setSelectedTaskForSuggestion(null);
            setSelectedTaskForDetail(t);
          }}
        />
      )}

      {/* Task Extension Request Modal */}
      {selectedTaskForExtension && (
        <TaskExtensionModal
          isOpen={Boolean(selectedTaskForExtension)}
          onClose={() => setSelectedTaskForExtension(null)}
          task={
            myAssignedTasks.find((t) => t.id === selectedTaskForExtension.id) ||
            selectedTaskForExtension
          }
          project={projects.find((p) => p.id === (selectedTaskForExtension.project_id || selectedTaskForExtension.project?.id))}
          sprint={selectedTaskForExtension?.sprint}
          sprints={projects.find((p) => p.id === (selectedTaskForExtension.project_id || selectedTaskForExtension.project?.id))?.sprints || []}
          employeeProfile={employeeProfile}
          onRequestSubmitted={() => {
            fetchBatchTasks();
            fetchProjects();
            showNotificationToast("Extension request submitted to Team Lead for review.", "success");
          }}
        />
      )}

      {/* Task Extension Review Modal for Team Leads */}
      {selectedTaskForExtensionReview && (
        <TaskExtensionReviewModal
          isOpen={Boolean(selectedTaskForExtensionReview)}
          onClose={() => setSelectedTaskForExtensionReview(null)}
          task={
            myAssignedTasks.find((t) => t.id === selectedTaskForExtensionReview.id) ||
            selectedTaskForExtensionReview
          }
          project={projects.find((p) => p.id === (selectedTaskForExtensionReview.project_id || selectedTaskForExtensionReview.project?.id))}
          sprint={selectedTaskForExtensionReview?.sprint}
          sprints={projects.find((p) => p.id === (selectedTaskForExtensionReview.project_id || selectedTaskForExtensionReview.project?.id))?.sprints || []}
          onDecisionMade={(decision, updatedTask) => {
            fetchBatchTasks();
            fetchProjects();
            showNotificationToast(
              decision === "APPROVE"
                ? "Deadline extension approved."
                : "Deadline extension request rejected.",
              decision === "APPROVE" ? "success" : "info"
            );
          }}
        />
      )}

      {/* Top Center Badge Notification Card */}
      {toastMsg && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[300] pointer-events-auto animate-scaleIn">
          <div className="relative pt-2.5">
            {/* Top Left Pill Badge */}
            <div className="absolute top-0 left-4 z-10">
              <span
                className={`px-3 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider text-white shadow-xs ${
                  toastMsg.type === "warning"
                    ? "bg-amber-500"
                    : toastMsg.type === "error"
                    ? "bg-rose-500"
                    : toastMsg.type === "info"
                    ? "bg-sky-500"
                    : "bg-emerald-500"
                }`}
              >
                {toastMsg.type === "warning"
                  ? "WARNING"
                  : toastMsg.type === "error"
                  ? "ERROR"
                  : toastMsg.type === "info"
                  ? "INFO"
                  : "SUCCESS"}
              </span>
            </div>

            {/* Main Toast Box */}
            <div
              className={`bg-white rounded-2xl border-2 px-4 py-3 shadow-xl flex items-center gap-3 min-w-[280px] sm:min-w-[320px] max-w-md ${
                toastMsg.type === "warning"
                  ? "border-amber-500 shadow-amber-500/10"
                  : toastMsg.type === "error"
                  ? "border-rose-500 shadow-rose-500/10"
                  : toastMsg.type === "info"
                  ? "border-sky-500 shadow-sky-500/10"
                  : "border-emerald-500 shadow-emerald-500/10"
              }`}
            >
              {/* Circular Icon */}
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-black shrink-0 ${
                  toastMsg.type === "warning"
                    ? "border-amber-500 text-amber-500"
                    : toastMsg.type === "error"
                    ? "border-rose-500 text-rose-500"
                    : toastMsg.type === "info"
                    ? "border-sky-500 text-sky-500"
                    : "border-emerald-500 text-emerald-500"
                }`}
              >
                {toastMsg.type === "warning"
                  ? "!"
                  : toastMsg.type === "error"
                  ? "✕"
                  : toastMsg.type === "info"
                  ? "ℹ"
                  : "✓"}
              </div>

              {/* Message */}
              <span className="flex-1 text-sm font-bold text-slate-900 tracking-tight leading-snug">
                {toastMsg.message}
              </span>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setToastMsg(null)}
                className="text-slate-400 hover:text-slate-700 shrink-0 text-xs font-bold cursor-pointer p-1 rounded-full hover:bg-slate-100 transition"
                title="Close"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Sprint Performance & Member Evaluation Modal */}
      {selectedSprintForPerfEval && (() => {
        const targetProj = projects.find((p) => p.id === (selectedSprintForPerfEval.project_id || selectedSprintForPerfEval.project?.id)) || scopedProjects[0];
        
        // Filter members strictly belonging to this project
        const projectMemberMap = new Map();
        const pool = [...departmentEmployees, ...allEmployeesList];
        
        if (targetProj?.team_lead_id) {
          const lead = pool.find((e) => e.id === targetProj.team_lead_id);
          if (lead) projectMemberMap.set(lead.id, lead);
        }
        if (targetProj?.owner_id || targetProj?.created_by) {
          const owner = pool.find((e) => e.id === (targetProj.owner_id || targetProj.created_by));
          if (owner) projectMemberMap.set(owner.id, owner);
        }
        if (Array.isArray(targetProj?.teamMembers)) {
          targetProj.teamMembers.forEach((m) => { if (m?.id) projectMemberMap.set(m.id, m); });
        }
        if (Array.isArray(targetProj?.team_members)) {
          targetProj.team_members.forEach((m) => {
            const cleanId = typeof m === "object" ? m?.id : m;
            if (cleanId && !projectMemberMap.has(cleanId)) {
              const emp = typeof m === "object" ? m : pool.find((e) => e.id === cleanId);
              if (emp) projectMemberMap.set(cleanId, emp);
            }
          });
        }
        // Also include any assignees from target project tasks
        const projTasks = (tasks || []).filter((t) => t.project_id === targetProj?.id);
        projTasks.forEach((t) => {
          const assignId = t.assigned_to || t.planned_assignee_id;
          if (assignId && !projectMemberMap.has(assignId)) {
            const emp = pool.find((e) => e.id === assignId);
            if (emp) projectMemberMap.set(assignId, emp);
          }
        });

        const filteredTeamMembers = projectMemberMap.size > 0
          ? Array.from(projectMemberMap.values()).sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""))
          : (targetProj?.teamMembers || []);

        return (
          <SprintPerformanceModal
            isOpen={Boolean(selectedSprintForPerfEval)}
            onClose={() => setSelectedSprintForPerfEval(null)}
            sprint={selectedSprintForPerfEval}
            project={targetProj}
            teamMembers={filteredTeamMembers}
            currentUserId={employeeProfile?.id}
            isTeamLeadOrManager={isTeamLead || isManager || isAdmin || isOwner}
            initialEmployeeId={analyticsEmployeeFilter !== "all" ? analyticsEmployeeFilter : null}
            onEvaluationSaved={() => {
              fetchAnalytics();
              if (perfViewMode === "monthly") fetchMonthlyPerformance(selectedMonth);
              showNotificationToast("Sprint performance evaluation saved.", "success");
            }}
          />
        );
      })()}
    </div>
  );
}
