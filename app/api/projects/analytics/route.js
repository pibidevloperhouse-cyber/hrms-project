import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/projects/analytics
 * Returns aggregated task performance, status distribution, on-time rates, rework rates,
 * and completion trends over time for Managers & Team Leads.
 */
export async function GET(req) {
  try {
    const supabase = await createClient();
    const user = await getAuthUser(req, supabase);

    if (!user) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    const adminSupabase = createAdminClient();
    const { company, role, employeeProfile } = await getCompanyAndRoleForUser(adminSupabase, user);

    if (!company) {
      return NextResponse.json({ message: "No company workspace found." }, { status: 404 });
    }

    const cleanRole = (role || "").toLowerCase().replace(/[\s_-]+/g, "");
    const isOwnerOrAdmin = cleanRole.includes("admin") || cleanRole.includes("owner") || cleanRole.includes("hr");
    const isManager = cleanRole.includes("manager") || cleanRole.includes("supervisor");
    const isTeamLead = cleanRole.includes("lead");

    if (!isOwnerOrAdmin && !isManager && !isTeamLead) {
      return NextResponse.json({ message: "Access denied. Managers and Team Leads only." }, { status: 403 });
    }

    // Extract query filters
    const { searchParams } = new URL(req.url);
    const filterEmployeeId = searchParams.get("employeeId") || "all";
    const filterDepartment = searchParams.get("department") || "all";
    const filterProjectId = searchParams.get("projectId") || "all";
    const filterDateRange = searchParams.get("dateRange") || "all";

    // 1. Fetch projects scoped to role
    let projectsQuery = adminSupabase
      .from("projects")
      .select("id, name, department, team_lead_id, created_by, status, start_date, end_date")
      .eq("company_id", company.id);

    if (isTeamLead) {
      projectsQuery = projectsQuery.eq("team_lead_id", employeeProfile.id);
    } else if (isManager && employeeProfile?.department) {
      projectsQuery = projectsQuery.or(
        `department.ilike.${employeeProfile.department.trim()},created_by.eq.${employeeProfile.id}`
      );
    }

    if (filterProjectId !== "all") {
      projectsQuery = projectsQuery.eq("id", filterProjectId);
    }

    if (filterDepartment !== "all") {
      projectsQuery = projectsQuery.ilike("department", filterDepartment.trim());
    }

    const { data: projects, error: projErr } = await projectsQuery;
    if (projErr) {
      console.error("Fetch projects for analytics error:", projErr);
      return NextResponse.json({ message: "Failed to load project analytics." }, { status: 500 });
    }

    const projectIds = (projects || []).map((p) => p.id);
    if (projectIds.length === 0) {
      return NextResponse.json({
        success: true,
        analytics: {
          totalTasks: 0,
          completedTasks: 0,
          inProgressTasks: 0,
          reviewTasks: 0,
          todoTasks: 0,
          overdueTasks: 0,
          completionRate: 0,
          onTimeCompletionRate: 0,
          avgCompletionTimeDays: 0,
          reworkRate: 0,
          statusDistribution: { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, COMPLETED: 0 },
          completedByTimeline: [],
          employeePerformance: [],
        },
      });
    }

    // 2. Fetch tasks for scoped projects
    let tasksQuery = adminSupabase
      .from("project_tasks")
      .select(`
        id,
        project_id,
        title,
        status,
        priority,
        due_date,
        created_at,
        updated_at,
        assigned_to,
        assignee:employees!project_tasks_assigned_to_fkey (
          id,
          full_name,
          email,
          role,
          department,
          designation,
          avatar_url
        ),
        project:projects!project_tasks_project_id_fkey (
          id,
          name,
          department
        )
      `)
      .in("project_id", projectIds)
      .eq("company_id", company.id);

    if (filterEmployeeId !== "all") {
      tasksQuery = tasksQuery.eq("assigned_to", filterEmployeeId);
    }

    // Apply date range filter on created_at or due_date
    if (filterDateRange !== "all") {
      const now = new Date();
      let fromDate = new Date();
      if (filterDateRange === "7d") {
        fromDate.setDate(now.getDate() - 7);
      } else if (filterDateRange === "30d") {
        fromDate.setDate(now.getDate() - 30);
      } else if (filterDateRange === "this_month") {
        fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (filterDateRange === "this_quarter") {
        const currentQuarter = Math.floor(now.getMonth() / 3);
        fromDate = new Date(now.getFullYear(), currentQuarter * 3, 1);
      }
      tasksQuery = tasksQuery.gte("created_at", fromDate.toISOString());
    }

    const { data: tasks, error: tasksErr } = await tasksQuery;
    if (tasksErr) {
      console.error("Fetch tasks for analytics error:", tasksErr);
      return NextResponse.json({ message: "Failed to load task analytics." }, { status: 500 });
    }

    // 3. Fetch task_status_history to compute rework and completion duration
    const allTaskIds = (tasks || []).map((t) => t.id);
    let historyRecords = [];
    if (allTaskIds.length > 0) {
      const { data: hist } = await adminSupabase
        .from("task_status_history")
        .select("task_id, old_status, new_status, created_at")
        .in("task_id", allTaskIds)
        .order("created_at", { ascending: true });
      historyRecords = hist || [];
    }

    // Group history by task_id
    const historyByTask = new Map();
    historyRecords.forEach((h) => {
      if (!historyByTask.has(h.task_id)) historyByTask.set(h.task_id, []);
      historyByTask.get(h.task_id).push(h);
    });

    // 4. Calculate Key Analytics
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let totalTasks = 0;
    let completedTasks = 0;
    let inProgressTasks = 0;
    let reviewTasks = 0;
    let todoTasks = 0;
    let overdueTasks = 0;
    let onTimeCompletedCount = 0;
    let totalCompletionDurationHours = 0;
    let completedTasksWithDuration = 0;
    let totalReworkEvents = 0;

    const empMap = new Map();

    (tasks || []).forEach((t) => {
      totalTasks += 1;
      const st = t.status || "TODO";
      const isOverdue = t.due_date && new Date(t.due_date) < today && st !== "COMPLETED";

      if (st === "COMPLETED") completedTasks += 1;
      else if (st === "IN_PROGRESS") inProgressTasks += 1;
      else if (st === "REVIEW") reviewTasks += 1;
      else todoTasks += 1;

      if (isOverdue) overdueTasks += 1;

      // Check on-time completion & duration from history
      const taskHist = historyByTask.get(t.id) || [];
      const completedHist = [...taskHist].reverse().find((h) => h.new_status === "COMPLETED");

      if (st === "COMPLETED") {
        const completionTime = completedHist ? new Date(completedHist.created_at) : new Date(t.updated_at);
        if (t.due_date) {
          const dueDateObj = new Date(t.due_date);
          dueDateObj.setHours(23, 59, 59, 999);
          if (completionTime <= dueDateObj) {
            onTimeCompletedCount += 1;
          }
        } else {
          // If no due date set, considered on time
          onTimeCompletedCount += 1;
        }

        // Duration calculation
        const startTime = new Date(t.created_at);
        const diffMs = completionTime - startTime;
        if (diffMs > 0) {
          totalCompletionDurationHours += diffMs / (1000 * 60 * 60);
          completedTasksWithDuration += 1;
        }
      }

      // Check rework / changes-requested events (transitions from REVIEW -> IN_PROGRESS)
      const reworkCount = taskHist.filter(
        (h) => (h.old_status === "REVIEW" || h.old_status === "SUBMITTED FOR REVIEW") && h.new_status === "IN_PROGRESS"
      ).length;
      if (reworkCount > 0) {
        totalReworkEvents += reworkCount;
      }

      // Aggregate employee stats
      const empId = t.assigned_to;
      if (empId) {
        if (!empMap.has(empId)) {
          empMap.set(empId, {
            employee: t.assignee || { id: empId, full_name: "Team Member" },
            total: 0,
            completed: 0,
            inProgress: 0,
            review: 0,
            todo: 0,
            overdue: 0,
            onTimeCompleted: 0,
            reworkEvents: 0,
            durationHours: 0,
            durationCount: 0,
          });
        }
        const emp = empMap.get(empId);
        emp.total += 1;
        if (st === "COMPLETED") {
          emp.completed += 1;
          if (t.due_date) {
            const dueDateObj = new Date(t.due_date);
            dueDateObj.setHours(23, 59, 59, 999);
            const compTime = completedHist ? new Date(completedHist.created_at) : new Date(t.updated_at);
            if (compTime <= dueDateObj) emp.onTimeCompleted += 1;
          } else {
            emp.onTimeCompleted += 1;
          }
          const startTime = new Date(t.created_at);
          const cTime = completedHist ? new Date(completedHist.created_at) : new Date(t.updated_at);
          const ms = cTime - startTime;
          if (ms > 0) {
            emp.durationHours += ms / (1000 * 60 * 60);
            emp.durationCount += 1;
          }
        } else if (st === "IN_PROGRESS") emp.inProgress += 1;
        else if (st === "REVIEW") emp.review += 1;
        else emp.todo += 1;

        if (isOverdue) emp.overdue += 1;
        emp.reworkEvents += reworkCount;
      }
    });

    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const onTimeCompletionRate = completedTasks > 0 ? Math.round((onTimeCompletedCount / completedTasks) * 100) : 100;
    const avgCompletionTimeDays =
      completedTasksWithDuration > 0
        ? Number((totalCompletionDurationHours / completedTasksWithDuration / 24).toFixed(1))
        : 0;
    const reworkRate =
      completedTasks + reviewTasks > 0
        ? Math.round((totalReworkEvents / (completedTasks + reviewTasks)) * 100)
        : 0;

    // Timeline cohorts (last 6 weeks)
    const timelineMap = new Map();
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i * 7);
      const label = `W${getWeekNumber(d)}`;
      timelineMap.set(label, 0);
    }

    (tasks || []).forEach((t) => {
      if (t.status === "COMPLETED") {
        const d = new Date(t.updated_at || t.created_at);
        const label = `W${getWeekNumber(d)}`;
        if (timelineMap.has(label)) {
          timelineMap.set(label, timelineMap.get(label) + 1);
        }
      }
    });

    const completedByTimeline = Array.from(timelineMap.entries()).map(([period, count]) => ({
      period,
      count,
    }));

    // Format project status distribution and per-project deliverable performance
    const projectStatusDistribution = {
      PLANNING: 0,
      IN_PROGRESS: 0,
      REVIEW: 0,
      COMPLETED: 0,
      ON_HOLD: 0,
    };

    const projectMap = new Map();
    (projects || []).forEach((p) => {
      const pSt = (p.status || "PLANNING").toUpperCase();
      if (projectStatusDistribution[pSt] !== undefined) {
        projectStatusDistribution[pSt] += 1;
      } else {
        projectStatusDistribution.PLANNING += 1;
      }

      projectMap.set(p.id, {
        id: p.id,
        name: p.name,
        department: p.department || "General",
        status: p.status || "PLANNING",
        totalTasks: 0,
        completedTasks: 0,
        inProgressTasks: 0,
        reviewTasks: 0,
        todoTasks: 0,
        overdueTasks: 0,
        completionRate: 0,
      });
    });

    (tasks || []).forEach((t) => {
      const projId = t.project_id || t.project?.id;
      if (projId && projectMap.has(projId)) {
        const pm = projectMap.get(projId);
        pm.totalTasks += 1;
        const st = t.status || "TODO";
        const isOverdue = t.due_date && new Date(t.due_date) < today && st !== "COMPLETED";

        if (st === "COMPLETED") pm.completedTasks += 1;
        else if (st === "IN_PROGRESS") pm.inProgressTasks += 1;
        else if (st === "REVIEW") pm.reviewTasks += 1;
        else pm.todoTasks += 1;

        if (isOverdue) pm.overdueTasks += 1;
      }
    });

    const projectPerformance = Array.from(projectMap.values()).map((p) => ({
      ...p,
      completionRate: p.totalTasks > 0 ? Math.round((p.completedTasks / p.totalTasks) * 100) : 0,
    }));
    projectPerformance.sort((a, b) => b.totalTasks - a.totalTasks || b.completionRate - a.completionRate);

    // Format employee performance list
    const employeePerformance = Array.from(empMap.values()).map((e) => {
      const cRate = e.total > 0 ? Math.round((e.completed / e.total) * 100) : 0;
      const onTimeRate = e.completed > 0 ? Math.round((e.onTimeCompleted / e.completed) * 100) : 100;
      const rRate = e.completed + e.review > 0 ? Math.round((e.reworkEvents / (e.completed + e.review)) * 100) : 0;
      const avgDays = e.durationCount > 0 ? Number((e.durationHours / e.durationCount / 24).toFixed(1)) : 0;

      return {
        id: e.employee.id,
        name: e.employee.full_name || "Team Member",
        department: e.employee.department || "General",
        designation: e.employee.designation || "Department Member",
        avatar_url: e.employee.avatar_url,
        totalTasks: e.total,
        completedTasks: e.completed,
        inProgressTasks: e.inProgress,
        reviewTasks: e.review,
        todoTasks: e.todo,
        overdueTasks: e.overdue,
        completionRate: cRate,
        onTimeCompletionRate: onTimeRate,
        reworkRate: rRate,
        avgCompletionTimeDays: avgDays,
      };
    });

    employeePerformance.sort((a, b) => b.totalTasks - a.totalTasks || b.completionRate - a.completionRate);

    return NextResponse.json({
      success: true,
      analytics: {
        totalTasks,
        completedTasks,
        inProgressTasks,
        reviewTasks,
        todoTasks,
        overdueTasks,
        completionRate,
        onTimeCompletionRate,
        avgCompletionTimeDays,
        reworkRate,
        statusDistribution: {
          TODO: todoTasks,
          IN_PROGRESS: inProgressTasks,
          REVIEW: reviewTasks,
          COMPLETED: completedTasks,
          OVERDUE: overdueTasks,
        },
        projectStatusDistribution,
        projectPerformance,
        completedByTimeline,
        employeePerformance,
      },
    });
  } catch (err) {
    console.error("GET /api/projects/analytics error:", err);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}

function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return weekNo;
}
