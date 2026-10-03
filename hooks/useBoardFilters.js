"use client";

import { useState, useMemo } from "react";
import { normalizeTaskStatus } from "@/lib/projectUtils";

/**
 * Custom Hook: useBoardFilters
 * Manages sprint, assignee, priority, and search filtering for Kanban / Scrum boards.
 * Computes consolidated employee roster and column-partitioned task buckets.
 */
export function useBoardFilters({
  project,
  tasks = [],
  sprints = [],
  epics = [],
  departmentEmployees = [],
  teamLeads = [],
  employeeProfile,
}) {
  const isKanban = (project?.project_type || "").toLowerCase() === "kanban";

  // Consolidated employee roster with designated role tags
  const allEmployees = useMemo(() => {
    const map = new Map();
    const allPool = [...(departmentEmployees || []), ...(teamLeads || [])];

    // 1. Team Lead
    if (project?.teamLead?.id) {
      map.set(project.teamLead.id, { ...project.teamLead, roleTag: "Team Lead" });
    } else if (project?.team_lead_id) {
      const lead = allPool.find((e) => e.id === project.team_lead_id);
      if (lead) map.set(lead.id, { ...lead, roleTag: "Team Lead" });
    }

    // 2. Creator / Owner
    if (project?.creator?.id) {
      map.set(project.creator.id, { ...project.creator, roleTag: "Owner" });
    } else if (project?.created_by || project?.owner_id) {
      const ownerId = project.owner_id || project.created_by;
      const owner = allPool.find((e) => e.id === ownerId);
      if (owner) map.set(owner.id, { ...owner, roleTag: "Owner" });
    }

    // 3. Team Members (from project.teamMembers objects or project.team_members IDs)
    if (Array.isArray(project?.teamMembers) && project.teamMembers.length > 0) {
      project.teamMembers.forEach((m) => {
        if (m?.id && !map.has(m.id)) {
          map.set(m.id, { ...m, roleTag: m.designation || m.role || "Member" });
        }
      });
    }

    if (Array.isArray(project?.team_members) && project.team_members.length > 0) {
      project.team_members.forEach((memberId) => {
        const cleanId = typeof memberId === "object" ? memberId?.id : memberId;
        if (cleanId && !map.has(cleanId)) {
          const emp = typeof memberId === "object" ? memberId : allPool.find((e) => e.id === cleanId);
          if (emp) {
            map.set(cleanId, { ...emp, roleTag: emp.designation || emp.role || "Member" });
          }
        }
      });
    }

    return Array.from(map.values()).sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
  }, [project, departmentEmployees, teamLeads]);

  // Active Sprints resolution
  const activeSprints = useMemo(() => {
    if (isKanban) return [];
    return (sprints || []).filter((s) => {
      const raw = String(s.status || "").trim().toUpperCase();
      return ["ACTIVE", "IN_PROGRESS", "RUNNING", "STARTED", "CURRENT"].includes(raw);
    });
  }, [sprints, isKanban]);

  const activeSprintIds = useMemo(() => {
    return new Set(activeSprints.map((s) => s.id));
  }, [activeSprints]);

  const activeSprint = activeSprints.length > 0 ? activeSprints[0] : null;

  // Filter States
  const [sprintFilter, setSprintFilter] = useState("active");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Filtered Tasks computation
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // 1. Sprint Filter
      if (!isKanban) {
        if (sprintFilter === "active") {
          if (activeSprintIds.size > 0) {
            if (!activeSprintIds.has(task.sprint_id)) return false;
          } else {
            return false;
          }
        } else if (sprintFilter === "backlog") {
          const isInBacklog = !task.sprint_id || !sprints.some((s) => s.id === task.sprint_id);
          if (!isInBacklog) return false;
        } else if (sprintFilter !== "all") {
          if (task.sprint_id !== sprintFilter) return false;
        }
      }

      // 2. Assignee Filter
      if (assigneeFilter !== "all") {
        const matchesAssignee =
          task.assigned_to === assigneeFilter ||
          task.planned_assignee_id === assigneeFilter ||
          task.assignee_id === assigneeFilter ||
          task.assignee?.id === assigneeFilter ||
          task.assignee?.auth_user_id === assigneeFilter ||
          task.planned_assignee?.id === assigneeFilter ||
          task.planned_assignee?.auth_user_id === assigneeFilter;
        if (!matchesAssignee) return false;
      }

      // 3. Priority Filter
      if (priorityFilter !== "all") {
        const taskPriority = (task.priority || "MEDIUM").toUpperCase();
        if (taskPriority !== priorityFilter) return false;
      }

      // 4. Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const titleMatch = (task.title || "").toLowerCase().includes(q);
        const descMatch = (task.description || "").toLowerCase().includes(q);
        const assigneeMatch = (task.assignee?.full_name || "").toLowerCase().includes(q);
        if (!titleMatch && !descMatch && !assigneeMatch) return false;
      }

      return true;
    });
  }, [tasks, sprints, activeSprintIds, sprintFilter, assigneeFilter, priorityFilter, searchQuery, isKanban]);

  // Tasks grouped by Kanban Column ID
  const tasksByColumn = useMemo(() => {
    const buckets = {
      TODO: [],
      IN_PROGRESS: [],
      REVIEW: [],
      COMPLETED: [],
    };

    filteredTasks.forEach((task) => {
      const colId = normalizeTaskStatus(task.status);
      if (buckets[colId]) {
        buckets[colId].push(task);
      } else {
        buckets.TODO.push(task);
      }
    });

    return buckets;
  }, [filteredTasks]);

  return {
    isKanban,
    allEmployees,
    activeSprints,
    activeSprintIds,
    activeSprint,
    sprintFilter,
    setSprintFilter,
    assigneeFilter,
    setAssigneeFilter,
    priorityFilter,
    setPriorityFilter,
    searchQuery,
    setSearchQuery,
    filteredTasks,
    tasksByColumn,
  };
}
