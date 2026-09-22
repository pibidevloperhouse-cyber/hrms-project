"use client";

import React, { useState, useMemo } from "react";
import TaskDetailModal from "./TaskDetailModal";

export default function ProjectTeamTab({
  project,
  tasks = [],
  sprints = [],
  epics = [],
  projectRoster = [],
  departmentEmployees = [],
  teamLeads = [],
  employeeProfile = null,
  currentUserId,
  canManageTeam = false,
  onRemoveMember,
  onOpenTeamModal,
  onTasksUpdated,
  onProjectUpdated,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [workloadFilter, setWorkloadFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [viewMode, setViewMode] = useState("grid"); // "grid" | "table"
  const [selectedMemberForTasks, setSelectedMemberForTasks] = useState(null);
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState(null);

  // Compute detailed task workload per member
  const memberWorkloadMap = useMemo(() => {
    const map = new Map();

    // Initialize all roster members
    projectRoster.forEach((member) => {
      map.set(member.id, {
        todo: 0,
        inProgress: 0,
        review: 0,
        completed: 0,
        total: 0,
        storyPoints: 0,
        tasks: [],
      });
    });

    // Map tasks to assignees
    tasks.forEach((task) => {
      const assigneeId = task.assigned_to || task.assignee_id || task.planned_assignee_id;
      if (assigneeId) {
        let stats = map.get(assigneeId);
        if (!stats) {
          stats = {
            todo: 0,
            inProgress: 0,
            review: 0,
            completed: 0,
            total: 0,
            storyPoints: 0,
            tasks: [],
          };
          map.set(assigneeId, stats);
        }

        stats.total += 1;
        stats.storyPoints += Number(task.story_points) || 1;
        stats.tasks.push(task);

        const status = (task.status || "TODO").toUpperCase();
        if (status === "COMPLETED" || status === "DONE") {
          stats.completed += 1;
        } else if (status === "IN_PROGRESS") {
          stats.inProgress += 1;
        } else if (status === "REVIEW") {
          stats.review += 1;
        } else {
          stats.todo += 1;
        }
      }
    });

    return map;
  }, [projectRoster, tasks]);

  // Extract unique departments for filter dropdown
  const departments = useMemo(() => {
    const depts = new Set();
    projectRoster.forEach((m) => {
      if (m.department) depts.add(m.department);
    });
    return Array.from(depts).sort();
  }, [projectRoster]);

  // Filtered and sorted members list
  const filteredMembers = useMemo(() => {
    return projectRoster
      .filter((member) => {
        // Search filter
        const q = searchQuery.toLowerCase().trim();
        if (q) {
          const nameMatch = member.full_name?.toLowerCase().includes(q);
          const emailMatch = member.email?.toLowerCase().includes(q);
          const deptMatch = member.department?.toLowerCase().includes(q);
          const desigMatch = member.designation?.toLowerCase().includes(q);
          const roleMatch = member.projectRole?.toLowerCase().includes(q);
          if (!nameMatch && !emailMatch && !deptMatch && !desigMatch && !roleMatch) {
            return false;
          }
        }

        // Role filter
        if (roleFilter !== "all") {
          if (roleFilter === "owner" && member.projectRole !== "Owner") return false;
          if (roleFilter === "lead" && member.projectRole !== "Team Lead") return false;
          if (roleFilter === "squad" && member.projectRole === "Owner") return false;
          if (roleFilter === "squad" && member.projectRole === "Team Lead") return false;
          if (roleFilter === "contributor" && member.projectRole !== "Contributor") return false;
        }

        // Department filter
        if (departmentFilter !== "all" && member.department !== departmentFilter) {
          return false;
        }

        // Workload filter
        const stats = memberWorkloadMap.get(member.id) || { total: 0, inProgress: 0, completed: 0 };
        if (workloadFilter === "active" && stats.inProgress === 0 && stats.review === 0) return false;
        if (workloadFilter === "completed" && (stats.total === 0 || stats.completed !== stats.total)) return false;
        if (workloadFilter === "idle" && stats.total > 0) return false;

        return true;
      })
      .sort((a, b) => {
        const statsA = memberWorkloadMap.get(a.id) || { total: 0, completed: 0 };
        const statsB = memberWorkloadMap.get(b.id) || { total: 0, completed: 0 };

        if (sortBy === "tasks_desc") {
          return statsB.total - statsA.total;
        }
        if (sortBy === "progress_desc") {
          const rateA = statsA.total > 0 ? statsA.completed / statsA.total : 0;
          const rateB = statsB.total > 0 ? statsB.completed / statsB.total : 0;
          return rateB - rateA;
        }
        if (sortBy === "role") {
          const roleWeight = { Owner: 1, "Team Lead": 2, "Squad Member": 3, Contributor: 4 };
          const wA = roleWeight[a.projectRole] || 5;
          const wB = roleWeight[b.projectRole] || 5;
          return wA - wB;
        }
        // Default: name A-Z
        return (a.full_name || "").localeCompare(b.full_name || "");
      });
  }, [projectRoster, searchQuery, roleFilter, departmentFilter, workloadFilter, sortBy, memberWorkloadMap]);

  // Overall Team KPI metrics
  const totalTeamSize = projectRoster.length;
  const activeContributorsCount = useMemo(() => {
    let count = 0;
    memberWorkloadMap.forEach((stats) => {
      if (stats.inProgress > 0 || stats.review > 0) count++;
    });
    return count;
  }, [memberWorkloadMap]);

  const totalAssignedTasks = useMemo(() => {
    let sum = 0;
    memberWorkloadMap.forEach((stats) => {
      sum += stats.total;
    });
    return sum;
  }, [memberWorkloadMap]);

  const overallTeamCompletionRate = useMemo(() => {
    let completed = 0;
    let total = 0;
    memberWorkloadMap.forEach((stats) => {
      completed += stats.completed;
      total += stats.total;
    });
    return total > 0 ? Math.round((completed / total) * 100) : 0;
  }, [memberWorkloadMap]);

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* 1. Executive Summary & Team Stats KPI Header */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        {/* Total Members */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs space-y-1 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Squad Roster</span>
            <span className="text-base">👥</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900">{totalTeamSize}</span>
            <span className="text-xs text-slate-500">Members</span>
          </div>
          <p className="text-[11px] text-slate-500 truncate">
            {project?.project_group ? project.project_group : "Active Project Squad"}
          </p>
          <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50/50 rounded-full blur-xl pointer-events-none -mr-4 -mt-4" />
        </div>

        {/* Active Contributors */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs space-y-1 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Active Contributors</span>
            <span className="text-base">⚡</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-sky-600">{activeContributorsCount}</span>
            <span className="text-xs text-slate-500">working now</span>
          </div>
          <p className="text-[11px] text-slate-500 truncate">With tasks In Progress &amp; Review</p>
          <div className="absolute top-0 right-0 w-16 h-16 bg-sky-50/50 rounded-full blur-xl pointer-events-none -mr-4 -mt-4" />
        </div>

        {/* Assigned Deliverables */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs space-y-1 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Assigned Tasks</span>
            <span className="text-base">📋</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-indigo-600">{totalAssignedTasks}</span>
            <span className="text-xs text-slate-500">Deliverables</span>
          </div>
          <p className="text-[11px] text-slate-500 truncate">
            Avg {totalTeamSize > 0 ? (totalAssignedTasks / totalTeamSize).toFixed(1) : 0} tasks/member
          </p>
          <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-50/50 rounded-full blur-xl pointer-events-none -mr-4 -mt-4" />
        </div>

        {/* Squad Completion Rate */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs space-y-1 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Squad Completion</span>
            <span className="text-base">🎯</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-emerald-600">{overallTeamCompletionRate}%</span>
            <span className="text-xs text-slate-500">efficiency</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden mt-1">
            <div
              className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${overallTeamCompletionRate}%` }}
            />
          </div>
        </div>
      </div>

      {/* 2. Controls Bar: Search, Filters, Sort, View Mode & Add Member */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[220px]">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs">
              🔍
            </div>
            <input
              type="text"
              placeholder="Search member by name, email, department, or role…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-8 py-1.5 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-xs text-slate-900 placeholder:text-slate-400 bg-slate-50/50 focus:bg-white transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Action CTAs: Add Employee & View Toggle */}
          <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
            {/* View Switcher Toggle */}
            <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  viewMode === "grid"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="Card Grid View"
              >
                <span>▦</span>
                <span className="hidden sm:inline">Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  viewMode === "table"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="Detailed Table View"
              >
                <span>☰</span>
                <span className="hidden sm:inline">Table</span>
              </button>
            </div>

            {/* Add Employee Button (Manager / Lead / Admin) */}
            {canManageTeam && onOpenTeamModal && (
              <button
                type="button"
                onClick={onOpenTeamModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition cursor-pointer shadow-xs"
              >
                <span>+</span>
                <span>Add Member</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Pills & Sorter */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Role Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500 font-medium">Role:</span>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 font-medium focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="all">All Roles</option>
                <option value="owner">Project Owner</option>
                <option value="lead">Team Lead</option>
                <option value="squad">Squad Members</option>
                <option value="contributor">Contributors</option>
              </select>
            </div>

            {/* Workload Status Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500 font-medium">Workload:</span>
              <select
                value={workloadFilter}
                onChange={(e) => setWorkloadFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 font-medium focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="all">All Members</option>
                <option value="active">Active Tasks In Progress</option>
                <option value="completed">All Tasks Completed</option>
                <option value="idle">No Tasks Assigned</option>
              </select>
            </div>

            {/* Department Filter */}
            {departments.length > 1 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-500 font-medium">Dept:</span>
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 font-medium focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="all">All Depts</option>
                  {departments.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[11px] text-slate-500 font-medium">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 font-medium focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="name">Name (A → Z)</option>
              <option value="role">Project Role</option>
              <option value="tasks_desc">Most Tasks Assigned</option>
              <option value="progress_desc">Highest Completion %</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Main Employee List Render (Grid Cards View vs Table View) */}
      {filteredMembers.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-xl mx-auto">
            👥
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-800">No project members found</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {searchQuery || roleFilter !== "all" || workloadFilter !== "all" || departmentFilter !== "all"
                ? "No team members matched your filter criteria. Try adjusting or clearing your search filters."
                : "No employees have been added to this project squad yet. Click '+ Add Member' to assign engineers and specialists."}
            </p>
          </div>
          {(searchQuery || roleFilter !== "all" || workloadFilter !== "all" || departmentFilter !== "all") ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setRoleFilter("all");
                setWorkloadFilter("all");
                setDepartmentFilter("all");
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
            >
              Reset Filters
            </button>
          ) : (
            canManageTeam &&
            onOpenTeamModal && (
              <button
                type="button"
                onClick={onOpenTeamModal}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition cursor-pointer shadow-xs"
              >
                + Add Member to Project
              </button>
            )
          )}
        </div>
      ) : viewMode === "grid" ? (
        /* GRID CARDS VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMembers.map((member) => {
            const stats = memberWorkloadMap.get(member.id) || {
              todo: 0,
              inProgress: 0,
              review: 0,
              completed: 0,
              total: 0,
              storyPoints: 0,
              tasks: [],
            };
            const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
            const isOwner = member.projectRole === "Owner";
            const isLead = member.projectRole === "Team Lead";
            const canRemove = canManageTeam && onRemoveMember && !isOwner && !isLead;

            return (
              <div
                key={member.id}
                className="bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-md hover:border-slate-300 transition-all p-4 flex flex-col justify-between space-y-4 group relative"
              >
                {/* Top Member Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Member Avatar */}
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-sm uppercase shadow-xs">
                        {member.full_name?.charAt(0) || "U"}
                      </div>
                      {stats.inProgress > 0 && (
                        <span
                          className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white"
                          title="Active on tasks"
                        />
                      )}
                    </div>

                    {/* Name, Designation & Department */}
                    <div className="min-w-0 space-y-0.5">
                      <h4 className="font-bold text-slate-900 text-sm truncate group-hover:text-blue-600 transition-colors">
                        {member.full_name}
                      </h4>
                      <p className="text-[11px] text-slate-500 truncate">
                        {member.designation || member.role || "Squad Member"}
                      </p>
                      {member.department && (
                        <span className="inline-block text-[10px] text-slate-400 font-medium truncate">
                          🏢 {member.department}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Project Role Badge */}
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${
                      member.badgeBg || "bg-slate-100 text-slate-700 border-slate-200"
                    }`}
                  >
                    {member.projectRole}
                  </span>
                </div>

                {/* Workload Snapshot Metrics */}
                <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-100 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-slate-600">Workload ({stats.total} tasks)</span>
                    <span className="font-mono font-bold text-slate-800">{completionRate}% Done</span>
                  </div>

                  {/* 4-Stage Workload Pills */}
                  <div className="grid grid-cols-4 gap-1.5 text-center text-[10px]">
                    <div className="bg-white py-1 px-1 rounded border border-slate-200 text-slate-600">
                      <span className="block text-[9px] text-slate-400 font-medium">To Do</span>
                      <span className="font-bold font-mono">{stats.todo}</span>
                    </div>
                    <div className="bg-white py-1 px-1 rounded border border-sky-200 text-sky-700">
                      <span className="block text-[9px] text-sky-400 font-medium">In Prog</span>
                      <span className="font-bold font-mono">{stats.inProgress}</span>
                    </div>
                    <div className="bg-white py-1 px-1 rounded border border-purple-200 text-purple-700">
                      <span className="block text-[9px] text-purple-400 font-medium">Review</span>
                      <span className="font-bold font-mono">{stats.review}</span>
                    </div>
                    <div className="bg-white py-1 px-1 rounded border border-emerald-200 text-emerald-700">
                      <span className="block text-[9px] text-emerald-400 font-medium">Done</span>
                      <span className="font-bold font-mono">{stats.completed}</span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-slate-200/80 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${completionRate}%` }}
                    />
                  </div>
                </div>

                {/* Bottom Action Footer */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 text-xs">
                  {/* View Tasks Trigger */}
                  <button
                    type="button"
                    onClick={() => setSelectedMemberForTasks(member)}
                    className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800 font-semibold hover:underline cursor-pointer"
                  >
                    <span>📋 View Tasks</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-blue-50 border border-blue-200 text-blue-700">
                      {stats.total}
                    </span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    {/* Mail Link */}
                    {member.email && (
                      <a
                        href={`mailto:${member.email}`}
                        className="w-7 h-7 rounded-lg border border-slate-200 hover:border-slate-300 text-slate-500 hover:text-blue-600 flex items-center justify-center text-xs transition cursor-pointer"
                        title={`Send email to ${member.email}`}
                      >
                        ✉️
                      </a>
                    )}

                    {/* Manager Remove Member Button */}
                    {canRemove && (
                      <button
                        type="button"
                        onClick={() => onRemoveMember(member)}
                        className="px-2 py-1 rounded-lg text-rose-600 hover:bg-rose-50 border border-rose-200/60 text-xs font-semibold transition cursor-pointer flex items-center gap-1"
                        title={`Remove ${member.full_name} from project`}
                      >
                        <span>✕</span>
                        <span className="hidden sm:inline">Remove</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* DETAILED ENTERPRISE TABLE VIEW */
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 font-semibold text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-3">Project Role</th>
                  <th className="py-3 px-3">Department &amp; Title</th>
                  <th className="py-3 px-3 text-center">To Do</th>
                  <th className="py-3 px-3 text-center">In Progress</th>
                  <th className="py-3 px-3 text-center">Review</th>
                  <th className="py-3 px-3 text-center">Done</th>
                  <th className="py-3 px-3 text-center">Total Tasks</th>
                  <th className="py-3 px-4 text-right">Progress</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMembers.map((member) => {
                  const stats = memberWorkloadMap.get(member.id) || {
                    todo: 0,
                    inProgress: 0,
                    review: 0,
                    completed: 0,
                    total: 0,
                    storyPoints: 0,
                    tasks: [],
                  };
                  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
                  const isOwner = member.projectRole === "Owner";
                  const isLead = member.projectRole === "Team Lead";
                  const canRemove = canManageTeam && onRemoveMember && !isOwner && !isLead;

                  return (
                    <tr key={member.id} className="hover:bg-slate-50/80 transition group">
                      {/* Employee Avatar & Info */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5 min-w-[180px]">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs uppercase shrink-0 shadow-2xs">
                            {member.full_name?.charAt(0) || "U"}
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold text-slate-900 block truncate group-hover:text-blue-600">
                              {member.full_name}
                            </span>
                            <span className="text-[10px] text-slate-400 block truncate font-mono">
                              {member.email || "No email"}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Project Role Badge */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border inline-block ${
                            member.badgeBg || "bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          {member.projectRole}
                        </span>
                      </td>

                      {/* Department & Designation */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="font-semibold text-slate-800 block text-xs">
                          {member.designation || member.role || "Member"}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          {member.department || "General"}
                        </span>
                      </td>

                      {/* Workload Breakdown Counters */}
                      <td className="py-3 px-3 text-center font-mono font-medium text-slate-600">
                        {stats.todo}
                      </td>
                      <td className="py-3 px-3 text-center font-mono font-semibold text-sky-700">
                        {stats.inProgress}
                      </td>
                      <td className="py-3 px-3 text-center font-mono font-semibold text-purple-700">
                        {stats.review}
                      </td>
                      <td className="py-3 px-3 text-center font-mono font-semibold text-emerald-700">
                        {stats.completed}
                      </td>
                      <td className="py-3 px-3 text-center font-mono font-bold text-slate-900">
                        {stats.total}
                      </td>

                      {/* Progress Bar & Percentage */}
                      <td className="py-3 px-4 text-right whitespace-nowrap min-w-[120px]">
                        <div className="space-y-1">
                          <span className="font-mono font-bold text-slate-800 text-xs">{completionRate}%</span>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden ml-auto">
                            <div
                              className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                              style={{ width: `${completionRate}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedMemberForTasks(member)}
                            className="px-2.5 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition cursor-pointer"
                            title="View member deliverables"
                          >
                            Tasks
                          </button>
                          {canRemove && (
                            <button
                              type="button"
                              onClick={() => onRemoveMember(member)}
                              className="w-7 h-7 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center text-xs transition cursor-pointer"
                              title={`Remove ${member.full_name} from project`}
                            >
                              ✕
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
      )}

      {/* 4. Member Deliverables Slide-over / Modal */}
      {selectedMemberForTasks && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedMemberForTasks(null);
          }}
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn"
        >
          <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] animate-scaleIn">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-sm uppercase shrink-0 shadow-2xs">
                  {selectedMemberForTasks.full_name?.charAt(0) || "U"}
                </div>
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 truncate">
                      {selectedMemberForTasks.full_name}
                    </h3>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.2 rounded border ${
                        selectedMemberForTasks.badgeBg || "bg-slate-100 text-slate-700 border-slate-200"
                      }`}
                    >
                      {selectedMemberForTasks.projectRole}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">
                    {selectedMemberForTasks.designation || "Member"} • {selectedMemberForTasks.department || "General"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedMemberForTasks(null)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center text-xs transition cursor-pointer"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Task List Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs flex-1">
              {(() => {
                const stats = memberWorkloadMap.get(selectedMemberForTasks.id) || { tasks: [] };
                const memberTasks = stats.tasks || [];

                if (memberTasks.length === 0) {
                  return (
                    <div className="py-12 text-center text-slate-400 space-y-2">
                      <span className="text-3xl block">📋</span>
                      <p className="text-xs font-semibold text-slate-700">No tasks currently assigned</p>
                      <p className="text-[11px] text-slate-500">
                        Tasks can be assigned to {selectedMemberForTasks.full_name} from the Backlog or Board tabs.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-slate-500 text-xs pb-1 border-b border-slate-100">
                      <span className="font-semibold text-slate-700">
                        Assigned Project Deliverables ({memberTasks.length})
                      </span>
                      <span className="text-[11px] font-mono">
                        {memberTasks.filter((t) => t.status === "COMPLETED").length} of {memberTasks.length} Completed
                      </span>
                    </div>

                    <div className="space-y-2">
                      {memberTasks.map((t) => {
                        const statusColors = {
                          TODO: "bg-slate-100 text-slate-700 border-slate-200",
                          IN_PROGRESS: "bg-sky-50 text-sky-700 border-sky-200",
                          REVIEW: "bg-purple-50 text-purple-700 border-purple-200",
                          COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
                        };

                        const priorityColors = {
                          LOW: "text-slate-500",
                          MEDIUM: "text-blue-600",
                          HIGH: "text-amber-600",
                          URGENT: "text-rose-600 font-bold",
                        };

                        return (
                          <div
                            key={t.id}
                            onClick={() => {
                              setSelectedTaskForDetail(t);
                            }}
                            className="p-3 rounded-lg bg-white border border-slate-200 hover:border-blue-400 hover:shadow-xs transition flex items-center justify-between gap-3 cursor-pointer group"
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 group-hover:text-blue-600 truncate">
                                  {t.title}
                                </span>
                                {t.task_type && (
                                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                                    {t.task_type}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-[11px] text-slate-500">
                                <span className={priorityColors[t.priority] || "text-slate-500"}>
                                  ● {t.priority || "MEDIUM"}
                                </span>
                                {t.due_date && (
                                  <span>📅 {new Date(t.due_date).toLocaleDateString()}</span>
                                )}
                                {t.story_points && (
                                  <span className="font-mono">⚡ {t.story_points} pts</span>
                                )}
                              </div>
                            </div>

                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded border shrink-0 ${
                                statusColors[t.status] || statusColors.TODO
                              }`}
                            >
                              {t.status}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSelectedMemberForTasks(null)}
                className="px-4 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-xs transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Detail Modal if task is clicked inside member drawer */}
      {selectedTaskForDetail && (
        <TaskDetailModal
          task={selectedTaskForDetail}
          project={project}
          tasks={tasks}
          sprints={sprints}
          epics={epics}
          departmentEmployees={departmentEmployees}
          teamLeads={teamLeads}
          employeeProfile={employeeProfile}
          currentUserId={currentUserId}
          isOpen={Boolean(selectedTaskForDetail)}
          onClose={() => setSelectedTaskForDetail(null)}
          onTaskUpdated={() => {
            if (onTasksUpdated) onTasksUpdated();
          }}
        />
      )}
    </div>
  );
}
