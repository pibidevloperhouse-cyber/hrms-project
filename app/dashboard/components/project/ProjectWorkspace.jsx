/* eslint-disable react-hooks/set-state-in-effect, react-hooks/preserve-manual-memoization */
"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import ProjectOverviewTab from "./ProjectOverviewTab";
import ProjectBacklogTab from "./ProjectBacklogTab";
import ProjectEpicsTab from "./ProjectEpicsTab";
import ProjectSprintsTab from "./ProjectSprintsTab";
import ProjectBoardTab from "./ProjectBoardTab";
import ProjectReviewsTab from "./ProjectReviewsTab";
import ProjectTeamTab from "./ProjectTeamTab";
import ProjectTeamModal from "./ProjectTeamModal";

const TABS = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "backlog", label: "Backlog", icon: "📋" },
  { id: "epics", label: "Epics", icon: "⚡" },
  { id: "sprints", label: "Sprints", icon: "🏃" },
  { id: "board", label: "Board", icon: "📌" },
  { id: "reviews", label: "Reviews", icon: "🔍" },
  { id: "team", label: "Team", icon: "👥" },
];

export default function ProjectWorkspace({
  project,
  onBack,
  onProjectUpdated,
  departmentEmployees = [],
  teamLeads = [],
  allEmployees = [],
  userRole,
  employeeProfile,
}) {
  const [currentProject, setCurrentProject] = useState(project);
  const [companyEmployees, setCompanyEmployees] = useState(() => {
    const map = new Map();
    [...(allEmployees || []), ...(departmentEmployees || []), ...(teamLeads || [])].forEach((e) => {
      if (e?.id && !map.has(e.id)) {
        map.set(e.id, e);
      }
    });
    return Array.from(map.values());
  });
  const [activeTab, setActiveTab] = useState("overview");
  const [tasks, setTasks] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [epics, setEpics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [workspaceToast, setWorkspaceToast] = useState(null);
  const inFlightWorkspaceLocksRef = useRef(new Map());

  const cleanUserRole = (userRole || employeeProfile?.role || "").toLowerCase().replace(/[\s_-]+/g, "");
  const isManagerOrAdmin = cleanUserRole.includes("admin") || cleanUserRole.includes("owner") || cleanUserRole.includes("manager") || cleanUserRole.includes("hr");
  const isProjectOwnerOrCreator = (currentProject || project)?.created_by === employeeProfile?.id || (currentProject || project)?.owner_id === employeeProfile?.id;
  const isAssignedLead = (currentProject || project)?.team_lead_id === employeeProfile?.id;
  const canManageTeam = isManagerOrAdmin || isProjectOwnerOrCreator || isAssignedLead;

  const isKanban = (currentProject?.project_type || "").toLowerCase() === "kanban";

  const availableTabs = useMemo(() => {
    if (isKanban) {
      return TABS.filter((tab) => tab.id !== "sprints");
    }
    return TABS;
  }, [isKanban]);

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

  // Fetch full list of company employees for roster and assignment
  const fetchWorkspaceEmployees = useCallback(async () => {
    try {
      const supabase = createClient();
      const headers = await getAuthHeaders(supabase);
      const res = await fetch("/api/employees/list", { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.employees)) {
          setCompanyEmployees(data.employees);
        }
      }
    } catch (err) {
      console.error("fetchWorkspaceEmployees error:", err);
    }
  }, [getAuthHeaders]);

  // Fetch fresh project details with populated creator, team lead, and team members
  const fetchProjectDetails = useCallback(async () => {
    if (!project?.id) return;
    try {
      const supabase = createClient();
      const headers = await getAuthHeaders(supabase);
      const res = await fetch(`/api/projects/${project.id}?t=${Date.now()}`, {
        headers,
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.project) {
          setCurrentProject((prev) => ({
            ...prev,
            ...data.project,
            team_members: (data.project.team_members && data.project.team_members.length > 0)
              ? data.project.team_members
              : prev?.team_members || [],
            teamMembers: (data.project.teamMembers && data.project.teamMembers.length > 0)
              ? data.project.teamMembers
              : prev?.teamMembers || [],
          }));
          if (Array.isArray(data.project.teamMembers) && data.project.teamMembers.length > 0) {
            setCompanyEmployees((prev) => {
              const map = new Map(prev.map((e) => [e.id, e]));
              data.project.teamMembers.forEach((m) => {
                if (m?.id) map.set(m.id, m);
              });
              return Array.from(map.values());
            });
          }
        }
      }
    } catch (err) {
      console.error("fetchProjectDetails error:", err);
    }
  }, [project?.id, getAuthHeaders]);

  // Compute full list of project team members with their specific roles and badges
  const projectRoster = useMemo(() => {
    const map = new Map();
    const target = currentProject || project;

    const allPoolMap = new Map();
    (companyEmployees || []).forEach((e) => {
      if (e?.id) allPoolMap.set(e.id, e);
    });
    (departmentEmployees || []).forEach((e) => {
      if (e?.id && !allPoolMap.has(e.id)) allPoolMap.set(e.id, e);
    });
    (teamLeads || []).forEach((l) => {
      if (l?.id && !allPoolMap.has(l.id)) allPoolMap.set(l.id, l);
    });
    (target?.teamMembers || []).forEach((m) => {
      if (m?.id && !allPoolMap.has(m.id)) allPoolMap.set(m.id, m);
    });
    (project?.teamMembers || []).forEach((m) => {
      if (m?.id && !allPoolMap.has(m.id)) allPoolMap.set(m.id, m);
    });

    // 1. Owner / Creator
    const ownerId = target?.created_by || target?.owner_id || target?.creator?.id;
    const ownerObj = target?.creator || (ownerId ? allPoolMap.get(ownerId) : null);
    if (ownerObj?.id) {
      map.set(ownerObj.id, {
        ...ownerObj,
        projectRole: "Owner",
        badgeBg: "bg-amber-50 text-amber-700 border-amber-200",
      });
    }

    // 2. Team Lead
    const leadId = target?.team_lead_id || target?.teamLead?.id;
    const leadObj = target?.teamLead || (leadId ? allPoolMap.get(leadId) : null);
    if (leadObj?.id) {
      map.set(leadObj.id, {
        ...leadObj,
        projectRole: "Team Lead",
        badgeBg: "bg-indigo-50 text-indigo-700 border-indigo-200",
      });
    }

    // 3. Explicit Team Members (from target.teamMembers objects or target.team_members IDs)
    if (Array.isArray(target?.teamMembers)) {
      target.teamMembers.forEach((m) => {
        if (m?.id && !map.has(m.id)) {
          map.set(m.id, {
            ...m,
            projectRole: m.designation || m.role || "Squad Member",
            badgeBg: "bg-emerald-50 text-emerald-700 border-emerald-200",
          });
        }
      });
    }

    if (Array.isArray(target?.team_members)) {
      target.team_members.forEach((item) => {
        const id = typeof item === "object" ? item?.id : item;
        if (id && !map.has(id)) {
          const emp = typeof item === "object" ? item : allPoolMap.get(id);
          if (emp) {
            map.set(id, {
              ...emp,
              projectRole: emp.designation || emp.role || "Squad Member",
              badgeBg: "bg-emerald-50 text-emerald-700 border-emerald-200",
            });
          }
        }
      });
    }

    // 4. Task assignees in this project (if someone has tasks assigned here, they are active project participants)
    (tasks || []).forEach((t) => {
      const assigneeId = t.assigned_to || t.assignee_id || t.planned_assignee_id;
      const assigneeObj = t.assignee || t.planned_assignee || (assigneeId ? allPoolMap.get(assigneeId) : null);
      if (assigneeObj?.id && !map.has(assigneeObj.id)) {
        map.set(assigneeObj.id, {
          ...assigneeObj,
          projectRole: assigneeObj.designation || assigneeObj.role || "Contributor",
          badgeBg: "bg-sky-50 text-sky-700 border-sky-200",
        });
      }
    });

    return Array.from(map.values());
  }, [currentProject, project, companyEmployees, departmentEmployees, teamLeads, tasks]);

  // Sync currentProject when parent project prop updates without erasing locally updated team members
  useEffect(() => {
    if (project?.id) {
      setCurrentProject((prev) => {
        if (!prev || prev.id !== project.id) return project;
        const mergedMembers = Array.from(
          new Set([
            ...(Array.isArray(project.team_members) ? project.team_members : []),
            ...(Array.isArray(prev.team_members) ? prev.team_members : []),
          ])
        );
        const mergedTeamMap = new Map();
        (project.teamMembers || []).forEach((m) => m?.id && mergedTeamMap.set(m.id, m));
        (prev.teamMembers || []).forEach((m) => m?.id && mergedTeamMap.set(m.id, m));

        return {
          ...project,
          ...prev,
          project_group: prev.project_group || project.project_group,
          team_members: mergedMembers.length > 0 ? mergedMembers : (project.team_members || []),
          teamMembers: mergedTeamMap.size > 0 ? Array.from(mergedTeamMap.values()) : (project.teamMembers || []),
        };
      });
    }
  }, [project]);

  // If project is Kanban and active tab is sprints, switch to board
  useEffect(() => {
    if (isKanban && activeTab === "sprints") {
      setActiveTab("board");
    }
  }, [isKanban, activeTab]);

  const handleProjectUpdated = useCallback((updatedProj) => {
    if (updatedProj) {
      setCurrentProject((prev) => ({
        ...prev,
        ...updatedProj,
        team_members: updatedProj.team_members ?? prev?.team_members ?? [],
        teamMembers: updatedProj.teamMembers ?? prev?.teamMembers ?? [],
      }));
      if (Array.isArray(updatedProj.teamMembers) && updatedProj.teamMembers.length > 0) {
        setCompanyEmployees((prev) => {
          const map = new Map(prev.map((e) => [e.id, e]));
          updatedProj.teamMembers.forEach((m) => {
            if (m?.id) map.set(m.id, m);
          });
          return Array.from(map.values());
        });
      }
      onProjectUpdated?.(updatedProj);
    }
  }, [onProjectUpdated]);

  const handleConfirmRemoveMember = useCallback(async () => {
    if (!memberToRemove || isRemoving) return;
    const targetProj = currentProject || project;
    if (!targetProj?.id) return;

    setIsRemoving(true);
    try {
      const memberId = memberToRemove.id;
      const memberName = memberToRemove.full_name || "Employee";

      // Collect current IDs
      const rawIds = Array.isArray(targetProj.team_members)
        ? targetProj.team_members
        : Array.isArray(targetProj.teamMembers)
        ? targetProj.teamMembers.map((m) => (typeof m === "object" ? m.id : m)).filter(Boolean)
        : [];

      const updatedIds = rawIds
        .map((m) => (typeof m === "object" ? m.id : m))
        .filter((id) => id && typeof id === "string" && id !== memberId);

      const updatedTeamMembers = Array.isArray(targetProj.teamMembers)
        ? targetProj.teamMembers.filter((m) => (typeof m === "object" ? m?.id !== memberId : m !== memberId))
        : [];

      const supabase = createClient();
      const headers = await getAuthHeaders(supabase);

      const res = await fetch(`/api/projects/${targetProj.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          team_members: updatedIds,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setWorkspaceToast({ type: "error", message: data.message || "Failed to remove employee from project." });
      } else {
        const finalProject = {
          ...targetProj,
          ...(data.project || {}),
          team_members: updatedIds,
          teamMembers: updatedTeamMembers,
        };
        handleProjectUpdated(finalProject);
        window.dispatchEvent(new CustomEvent("project-updated", { detail: finalProject }));
        setWorkspaceToast({ type: "success", message: `✓ ${memberName} has been removed from the project.` });
        setTimeout(() => setWorkspaceToast(null), 4000);
      }
    } catch (err) {
      console.error("Remove member error:", err);
      setWorkspaceToast({ type: "error", message: "Network error. Failed to remove employee." });
    } finally {
      setIsRemoving(false);
      setMemberToRemove(null);
    }
  }, [memberToRemove, isRemoving, currentProject, project, getAuthHeaders, handleProjectUpdated]);

  // Set an optimistic mutation lock on a task to prevent stale DB queries or WebSocket echoes from reverting state
  const setTaskLock = useCallback((taskId, { status, progress }) => {
    if (!taskId) return;
    inFlightWorkspaceLocksRef.current.set(taskId, {
      status: (status || "TODO").toUpperCase().replace(/[\s-]+/g, "_"),
      progress,
      timestamp: Date.now(),
    });
  }, []);

  const clearTaskLock = useCallback((taskId) => {
    if (!taskId) return;
    inFlightWorkspaceLocksRef.current.delete(taskId);
  }, []);

  // Fetch all tasks for this project
  const fetchTasks = useCallback(async () => {
    if (!project?.id) return;
    try {
      const supabase = createClient();
      const headers = await getAuthHeaders(supabase);

      const res = await fetch(`/api/projects/${project.id}/tasks?t=${Date.now()}`, {
        headers,
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.tasks)) {
          const merged = data.tasks.map((task) => {
            const lock = inFlightWorkspaceLocksRef.current.get(task.id);
            if (lock && (Date.now() - lock.timestamp < 6000)) {
              return {
                ...task,
                status: lock.status,
                progress: lock.progress !== undefined ? lock.progress : task.progress,
              };
            }
            return task;
          });
          setTasks(merged);
        }
      }
    } catch (err) {
      console.error("fetchTasks error:", err);
    }
  }, [project?.id, getAuthHeaders]);

  // Fetch sprints (skipped for Kanban projects)
  const fetchSprints = useCallback(async () => {
    if (!project?.id || isKanban) {
      setSprints([]);
      return;
    }
    try {
      const supabase = createClient();
      const headers = await getAuthHeaders(supabase);

      const res = await fetch(`/api/projects/${project.id}/sprints?t=${Date.now()}`, {
        headers,
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.sprints)) setSprints(data.sprints);
      }
    } catch (err) {
      console.error("fetchSprints error:", err);
    }
  }, [project?.id, isKanban, getAuthHeaders]);

  // Fetch epics
  const fetchEpics = useCallback(async () => {
    if (!project?.id) return;
    try {
      const supabase = createClient();
      const headers = await getAuthHeaders(supabase);

      const res = await fetch(`/api/projects/${project.id}/epics?t=${Date.now()}`, {
        headers,
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.epics)) setEpics(data.epics);
      }
    } catch (err) {
      console.error("fetchEpics error:", err);
    }
  }, [project?.id, getAuthHeaders]);

  // Unified refresh for tasks, sprints, epics, project details, and employees
  const refreshWorkspace = useCallback(async () => {
    try {
      await Promise.all([
        fetchTasks(),
        fetchSprints(),
        fetchEpics(),
        fetchProjectDetails(),
        fetchWorkspaceEmployees(),
      ]);
    } catch (err) {
      console.error("refreshWorkspace error:", err);
    }
  }, [fetchTasks, fetchSprints, fetchEpics, fetchProjectDetails, fetchWorkspaceEmployees]);

  // Initial load
  useEffect(() => {
    let isMounted = true;
    refreshWorkspace().finally(() => {
      if (isMounted) setLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, [refreshWorkspace]);

  // Auth State Listener to immediately refresh whenever session hydrates or changes
  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.access_token) {
        refreshWorkspace();
      }
    });

    return () => {
      authSub?.unsubscribe();
    };
  }, [refreshWorkspace]);

  // Real-time Supabase subscription & window event listener for tasks, sprints, epics, and project updates
  useEffect(() => {
    if (!project?.id) return;
    const supabase = createClient();

    const workspaceChannel = supabase
      .channel(`workspace-live-${project.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_tasks" },
        (payload) => {
          const targetProjId = payload.new?.project_id || payload.old?.project_id;
          if (targetProjId && targetProjId !== project.id) return;

          if (payload.eventType === "DELETE" && payload.old?.id) {
            setTasks((prev) => prev.filter((t) => t.id !== payload.old.id));
            return;
          }

          if (payload.new?.id) {
            const updatedRow = payload.new;
            const lock = inFlightWorkspaceLocksRef.current.get(updatedRow.id);
            const isFreshLock = lock && (Date.now() - lock.timestamp < 4000);
            const effectiveStatus = isFreshLock
              ? lock.status
              : (updatedRow.status || "TODO").toUpperCase().replace(/[\s-]+/g, "_");
            const effectiveProgress =
              isFreshLock && lock.progress !== undefined
                ? lock.progress
                : updatedRow.progress;

            setTasks((prev) => {
              const exists = prev.some((t) => t.id === updatedRow.id);
              if (exists) {
                return prev.map((t) =>
                  t.id === updatedRow.id
                    ? {
                        ...t,
                        ...updatedRow,
                        status: effectiveStatus,
                        progress: effectiveProgress !== undefined ? effectiveProgress : t.progress,
                      }
                    : t
                );
              } else {
                return [...prev, { ...updatedRow, status: effectiveStatus }];
              }
            });

            if (lock && updatedRow.status === lock.status) {
              inFlightWorkspaceLocksRef.current.delete(updatedRow.id);
            }
          } else {
            fetchTasks();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_sprints" },
        (payload) => {
          const targetProjId = payload.new?.project_id || payload.old?.project_id;
          if (!targetProjId || targetProjId === project.id) {
            fetchSprints();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_epics" },
        (payload) => {
          const targetProjId = payload.new?.project_id || payload.old?.project_id;
          if (!targetProjId || targetProjId === project.id) {
            fetchEpics();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects" },
        (payload) => {
          const targetProjId = payload.new?.id || payload.old?.id;
          if (!targetProjId || targetProjId === project.id) {
            fetchProjectDetails();
          }
        }
      )
      .subscribe();

    const handleTaskUpdated = (e) => {
      const payload = e.detail;
      const targetProjId = payload?.new?.project_id || payload?.old?.project_id || payload?.project_id;
      if (!targetProjId || targetProjId === project.id) {
        if (payload?.new?.id) {
          const updatedRow = payload.new;
          setTasks((prev) => {
            const exists = prev.some((t) => t.id === updatedRow.id);
            if (exists) {
              return prev.map((t) => (t.id === updatedRow.id ? { ...t, ...updatedRow } : t));
            } else {
              return [...prev, updatedRow];
            }
          });
        } else {
          fetchTasks();
        }
      }
    };

    const handleProjectEvent = (e) => {
      const updatedProj = e.detail;
      if (updatedProj && (!updatedProj.id || updatedProj.id === project?.id)) {
        handleProjectUpdated(updatedProj);
        fetchProjectDetails();
        fetchWorkspaceEmployees();
      }
    };

    window.addEventListener("project-task-updated", handleTaskUpdated);
    window.addEventListener("project-updated", handleProjectEvent);

    // Auto-refresh interval (every 60s) as fallback
    const interval = setInterval(() => {
      refreshWorkspace();
    }, 60000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshWorkspace();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      supabase.removeChannel(workspaceChannel);
      window.removeEventListener("project-task-updated", handleTaskUpdated);
      window.removeEventListener("project-updated", handleProjectEvent);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [project?.id, fetchTasks, fetchSprints, fetchEpics, fetchProjectDetails, fetchWorkspaceEmployees, handleProjectUpdated, refreshWorkspace]);

  const effectiveProject = currentProject || project;
  const effectiveEmployees = useMemo(() => {
    const map = new Map();
    (companyEmployees || []).forEach((e) => e?.id && map.set(e.id, e));
    (departmentEmployees || []).forEach((e) => e?.id && !map.has(e.id) && map.set(e.id, e));
    (teamLeads || []).forEach((l) => l?.id && !map.has(l.id) && map.set(l.id, l));
    (projectRoster || []).forEach((m) => m?.id && !map.has(m.id) && map.set(m.id, m));
    return Array.from(map.values());
  }, [companyEmployees, departmentEmployees, teamLeads, projectRoster]);

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Top Workspace Header */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 sm:p-5 space-y-4">
        {/* Navigation & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition cursor-pointer"
          >
            <span>←</span>
            <span>Back to All Projects</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
              {effectiveProject?.status || "PLANNING"}
            </span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              {effectiveProject?.priority || "MEDIUM"}
            </span>
          </div>
        </div>

        {/* Project Title & Metadata */}
        <div className="flex flex-wrap items-start justify-between gap-3 pt-1">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                {effectiveProject?.name || "Project Workspace"}
              </h1>
              {effectiveProject?.project_type && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
                  {effectiveProject.project_type}
                </span>
              )}
              {effectiveProject?.project_group && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                  {effectiveProject.project_group}
                </span>
              )}
            </div>

            {effectiveProject?.description && (
              <p className="text-xs text-slate-600 leading-relaxed max-w-3xl">
                {effectiveProject.description}
              </p>
            )}
          </div>

          {/* Quick Lead & Owner attribution */}
          <div className="flex items-center gap-4 text-xs text-slate-600">
            {effectiveProject?.creator && (
              <div>
                <span className="text-[10px] text-slate-400 block font-medium">Owner</span>
                <span className="font-semibold text-slate-800">{effectiveProject.creator.full_name}</span>
              </div>
            )}
            {effectiveProject?.teamLead && (
              <div>
                <span className="text-[10px] text-slate-400 block font-medium">Team Lead</span>
                <span className="font-semibold text-slate-800">{effectiveProject.teamLead.full_name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Project Team & Employee List Strip with Add Employee Button */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
          <div className="flex items-center gap-2.5 flex-wrap min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 shrink-0">
              <span className="text-sm">👥</span>
              <span>Project Team</span>
              <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded-full bg-white text-slate-700 border border-slate-200 shadow-2xs">
                {projectRoster.length}
              </span>
            </div>

            {/* List of current project employees with name and role badges */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {projectRoster.length === 0 ? (
                <span className="text-xs text-slate-400 italic">No team members assigned yet</span>
              ) : (
                projectRoster.map((member) => {
                  const isOwner = member.projectRole === "Owner";
                  const isLead = member.projectRole === "Team Lead";
                  const canRemoveThisMember = canManageTeam && !isOwner && !isLead;

                  return (
                    <div
                      key={member.id}
                      className="group inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-white border border-slate-200 text-xs shadow-2xs hover:border-slate-300 hover:shadow-xs transition"
                      title={`${member.full_name} (${member.designation || member.role || "Member"}${member.email ? ` • ${member.email}` : ""})`}
                    >
                      <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-[9px] shrink-0 uppercase shadow-2xs">
                        {member.full_name?.charAt(0) || "U"}
                      </div>
                      <span className="font-semibold text-slate-800 text-xs truncate max-w-[130px]">
                        {member.full_name}
                      </span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                          member.badgeBg || "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {member.projectRole}
                      </span>
                      {canRemoveThisMember && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMemberToRemove(member);
                          }}
                          className="opacity-60 group-hover:opacity-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold transition cursor-pointer ml-0.5"
                          title={`Remove ${member.full_name} from this project`}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Add / Assign Employee Button */}
          {canManageTeam && (
            <button
              type="button"
              onClick={() => setIsTeamModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition cursor-pointer shadow-xs shrink-0"
              title="Add or remove employees assigned to this project"
            >
              <span>+</span>
              <span>Add Employee</span>
            </button>
          )}
        </div>

        {/* Feature Tabs (Overview, Backlog, Epics, Sprints, Board) */}
        <div className="flex items-center gap-1 border-t border-slate-100 pt-3 overflow-x-auto">
          {availableTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shrink-0 ${isActive
                    ? "bg-blue-600 text-white shadow-2xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.id === "backlog" && (
                  <span
                    className={`ml-1 text-[10px] font-mono px-1 rounded-full ${isActive ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                      }`}
                  >
                    {tasks.filter((t) => !t.sprint_id).length}
                  </span>
                )}
                {tab.id === "sprints" && (
                  <span
                    className={`ml-1 text-[10px] font-mono px-1 rounded-full ${isActive ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                      }`}
                  >
                    {sprints.length}
                  </span>
                )}
                {tab.id === "epics" && (
                  <span
                    className={`ml-1 text-[10px] font-mono px-1 rounded-full ${isActive ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                      }`}
                  >
                    {epics.length}
                  </span>
                )}
                {tab.id === "board" && (
                  <span
                    className={`ml-1 text-[10px] font-mono px-1 rounded-full ${isActive ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                      }`}
                  >
                    {tasks.length}
                  </span>
                )}
                {tab.id === "reviews" && (
                  <span
                    className={`ml-1 text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold transition ${
                      tasks.filter((t) => t.status === "REVIEW").length > 0
                        ? "bg-purple-600 text-white animate-pulse shadow-xs"
                        : isActive
                        ? "bg-white/20 text-white"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {tasks.filter((t) => t.status === "REVIEW").length}
                  </span>
                )}
                {tab.id === "team" && (
                  <span
                    className={`ml-1 text-[10px] font-mono px-1 rounded-full ${isActive ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                      }`}
                  >
                    {projectRoster.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Feature Content */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
          <div className="inline-block w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2" />
          <p className="text-xs">Loading project workspace…</p>
        </div>
      ) : (
        <>
          {activeTab === "overview" && (
            <ProjectOverviewTab
              project={effectiveProject}
              tasks={tasks}
              sprints={sprints}
              epics={epics}
              departmentEmployees={effectiveEmployees}
              teamLeads={teamLeads}
              employeeProfile={employeeProfile}
              currentUserId={employeeProfile?.id}
              canManageTeam={canManageTeam}
              onSelectTab={(tabId) => setActiveTab(tabId)}
              onRemoveMember={(member) => setMemberToRemove(member)}
              onTasksUpdated={refreshWorkspace}
              onSprintsUpdated={refreshWorkspace}
              onProjectUpdated={handleProjectUpdated}
            />
          )}

          {activeTab === "backlog" && (
            <ProjectBacklogTab
              project={effectiveProject}
              tasks={tasks}
              sprints={sprints}
              epics={epics}
              departmentEmployees={effectiveEmployees}
              teamLeads={teamLeads}
              employeeProfile={employeeProfile}
              currentUserId={employeeProfile?.id}
              onTasksUpdated={refreshWorkspace}
            />
          )}

          {activeTab === "epics" && (
            <ProjectEpicsTab
              project={effectiveProject}
              epics={epics}
              tasks={tasks}
              sprints={sprints}
              departmentEmployees={effectiveEmployees}
              teamLeads={teamLeads}
              employeeProfile={employeeProfile}
              currentUserId={employeeProfile?.id}
              onEpicsUpdated={refreshWorkspace}
              onTasksUpdated={refreshWorkspace}
            />
          )}

          {activeTab === "sprints" && (
            <ProjectSprintsTab
              project={effectiveProject}
              sprints={sprints}
              tasks={tasks}
              epics={epics}
              departmentEmployees={effectiveEmployees}
              teamLeads={teamLeads}
              employeeProfile={employeeProfile}
              currentUserId={employeeProfile?.id}
              onSprintsUpdated={refreshWorkspace}
              onTasksUpdated={refreshWorkspace}
            />
          )}

          {activeTab === "board" && (
            <ProjectBoardTab
              project={effectiveProject}
              tasks={tasks}
              setTasks={setTasks}
              sprints={sprints}
              epics={epics}
              departmentEmployees={effectiveEmployees}
              teamLeads={teamLeads}
              employeeProfile={employeeProfile}
              currentUserId={employeeProfile?.id}
              setTaskLock={setTaskLock}
              clearTaskLock={clearTaskLock}
              onTasksUpdated={refreshWorkspace}
            />
          )}

          {activeTab === "reviews" && (
            <ProjectReviewsTab
              project={effectiveProject}
              tasks={tasks}
              sprints={sprints}
              epics={epics}
              departmentEmployees={effectiveEmployees}
              teamLeads={teamLeads}
              employeeProfile={employeeProfile}
              currentUserId={employeeProfile?.id}
              onTasksUpdated={refreshWorkspace}
            />
          )}

          {activeTab === "team" && (
            <ProjectTeamTab
              project={effectiveProject}
              tasks={tasks}
              sprints={sprints}
              epics={epics}
              projectRoster={projectRoster}
              departmentEmployees={effectiveEmployees}
              teamLeads={teamLeads}
              employeeProfile={employeeProfile}
              currentUserId={employeeProfile?.id}
              canManageTeam={canManageTeam}
              onRemoveMember={(member) => setMemberToRemove(member)}
              onOpenTeamModal={() => setIsTeamModalOpen(true)}
              onTasksUpdated={refreshWorkspace}
              onProjectUpdated={handleProjectUpdated}
            />
          )}
        </>
      )}

      {/* Project Team & Member Assignment Modal */}
      {isTeamModalOpen && (
        <ProjectTeamModal
          isOpen={isTeamModalOpen}
          onClose={() => setIsTeamModalOpen(false)}
          project={effectiveProject}
          tasks={tasks}
          departmentEmployees={effectiveEmployees}
          teamLeads={teamLeads}
          onProjectUpdated={handleProjectUpdated}
        />
      )}

      {/* Remove Employee Confirmation Modal */}
      {memberToRemove && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !isRemoving) setMemberToRemove(null);
          }}
          className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn"
        >
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden p-5 space-y-4 animate-scaleIn">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200 text-lg">
                ⚠️
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">Remove Employee from Project?</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Are you sure you want to remove <strong className="text-slate-800">{memberToRemove.full_name}</strong> from{" "}
                  <strong className="text-slate-800">{effectiveProject?.name}</strong>?
                </p>
                <p className="text-[11px] text-slate-500 pt-0.5">
                  They will no longer be assigned to this project squad. Existing completed task records and logs will remain preserved.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isRemoving}
                onClick={() => setMemberToRemove(null)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isRemoving}
                onClick={handleConfirmRemoveMember}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition cursor-pointer disabled:opacity-50 shadow-xs flex items-center gap-1.5"
              >
                {isRemoving ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Removing…</span>
                  </>
                ) : (
                  <span>Remove Employee</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Center Badge Notification Card */}
      {workspaceToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[300] pointer-events-auto animate-scaleIn">
          <div className="relative pt-2.5">
            {/* Top Left Pill Badge */}
            <div className="absolute top-0 left-4 z-10">
              <span
                className={`px-3 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider text-white shadow-xs ${
                  workspaceToast.type === "error" ? "bg-rose-500" : "bg-emerald-500"
                }`}
              >
                {workspaceToast.type === "error" ? "ERROR" : "SUCCESS"}
              </span>
            </div>

            {/* Main Toast Box */}
            <div
              className={`bg-white rounded-2xl border-2 px-4 py-3 shadow-xl flex items-center gap-3 min-w-[280px] sm:min-w-[320px] max-w-md ${
                workspaceToast.type === "error"
                  ? "border-rose-500 shadow-rose-500/10"
                  : "border-emerald-500 shadow-emerald-500/10"
              }`}
            >
              {/* Circular Icon */}
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-black shrink-0 ${
                  workspaceToast.type === "error"
                    ? "border-rose-500 text-rose-500"
                    : "border-emerald-500 text-emerald-500"
                }`}
              >
                {workspaceToast.type === "error" ? "✕" : "✓"}
              </div>

              {/* Message */}
              <span className="flex-1 text-sm font-bold text-slate-900 tracking-tight leading-snug">
                {workspaceToast.message}
              </span>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setWorkspaceToast(null)}
                className="text-slate-400 hover:text-slate-700 shrink-0 text-xs font-bold cursor-pointer p-1 rounded-full hover:bg-slate-100 transition"
                title="Close"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
