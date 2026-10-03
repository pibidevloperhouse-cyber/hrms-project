/**
 * Sprint Automated Lifecycle Engine
 * 
 * Automatically manages sprint state transitions based on scheduled dates:
 * 1. AUTO-START: Sprints with status 'PLANNED' and start_date <= today automatically transition to 'ACTIVE'.
 * 2. AUTO-COMPLETE: Sprints with status 'ACTIVE' (or PLANNED) where end_date has elapsed (< today)
 *    or where end_date <= today and all tasks are finished automatically transition to 'COMPLETED'.
 * 3. TASK ROLLOVER: Unfinished tasks (TODO, IN_PROGRESS, REVIEW) in completed sprints are safely
 *    unlinked (sprint_id = null) and returned to Product Backlog with progress and status preserved.
 * 4. AUDIT TRAIL: Automated status history logs are inserted into task_status_history.
 * 5. Non-destructive: Completed deliverable relations and story point metrics remain intact for evaluations.
 */

/**
 * Get current date string formatted as YYYY-MM-DD in local time
 */
export function getTodayDateStr() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Automatically evaluates and syncs sprint lifecycle transitions for a company / project.
 * 
 * @param {object} adminSupabase - Supabase admin client
 * @param {string} companyId - UUID of company workspace
 * @param {string|null} projectId - Optional project ID filter
 * @returns {Promise<{ startedCount: number, completedCount: number }>}
 */
export async function syncSprintLifecycles(adminSupabase, companyId, projectId = null) {
  if (!adminSupabase || !companyId) {
    return { startedCount: 0, completedCount: 0 };
  }

  const todayStr = getTodayDateStr();
  let startedCount = 0;
  let completedCount = 0;

  try {
    // =========================================================================
    // 1. AUTO-START: Sprints with start_date <= today that are currently PLANNED
    // =========================================================================
    let startQuery = adminSupabase
      .from("project_sprints")
      .select("id, name, project_id, company_id, start_date, end_date, status")
      .not("start_date", "is", null)
      .lte("start_date", todayStr);

    if (projectId) {
      startQuery = startQuery.eq("project_id", projectId);
    } else if (companyId) {
      startQuery = startQuery.or(`company_id.eq.${companyId},company_id.is.null`);
    }

    const { data: allStartCandidates, error: startFetchErr } = await startQuery;

    if (!startFetchErr && Array.isArray(allStartCandidates) && allStartCandidates.length > 0) {
      // Only target sprints that are not yet active or completed
      // (Exclude sprints whose end_date has already passed, as those will be handled by auto-complete)
      const sprintsToStart = allStartCandidates.filter((s) => {
        const rawStatus = String(s.status || "").trim().toUpperCase();
        const isPlanned = rawStatus === "PLANNED" || rawStatus === "PLANNING" || !rawStatus;
        if (!isPlanned) return false;
        
        const rawEnd = s.end_date ? (typeof s.end_date === "string" ? s.end_date.split("T")[0] : s.end_date) : null;
        if (rawEnd && rawEnd < todayStr) {
          // End date has already passed; will be processed directly by auto-complete
          return false;
        }
        return true;
      });

      if (sprintsToStart.length > 0) {
        const sprintIdsToStart = sprintsToStart.map((s) => s.id);
        
        let { error: startUpdateErr } = await adminSupabase
          .from("project_sprints")
          .update({
            status: "ACTIVE",
            updated_at: new Date().toISOString(),
          })
          .in("id", sprintIdsToStart);

        if (startUpdateErr && (startUpdateErr.message?.includes("updated_at") || startUpdateErr.code === "42703")) {
          const retry = await adminSupabase
            .from("project_sprints")
            .update({
              status: "ACTIVE",
            })
            .in("id", sprintIdsToStart);
          startUpdateErr = retry.error;
        }

        if (!startUpdateErr) {
          startedCount = sprintIdsToStart.length;

          // Activate planned assignees for tasks in the started sprints
          try {
            const { data: sprintTasksToActivate } = await adminSupabase
              .from("project_tasks")
              .select("id, assigned_to, planned_assignee_id, company_id")
              .in("sprint_id", sprintIdsToStart);

            if (Array.isArray(sprintTasksToActivate)) {
              for (const t of sprintTasksToActivate) {
                const targetAssignee = t.planned_assignee_id || t.assigned_to;
                if (targetAssignee && !t.assigned_to) {
                  await adminSupabase
                    .from("project_tasks")
                    .update({
                      assigned_to: targetAssignee,
                      updated_at: new Date().toISOString(),
                    })
                    .eq("id", t.id);
                }
              }
            }
          } catch (actErr) {
            console.warn("[SprintAutoLifecycle] Task activation warning:", actErr?.message);
          }
        }
      }
    }

    // =========================================================================
    // 2. AUTO-COMPLETE: Sprints with end_date <= today that are ready to close
    //    - Expired sprints: end_date < todayStr (scheduled timeline has elapsed)
    //    - All-done sprints: end_date <= todayStr and 100% of tasks are completed
    //    - Stale planned sprints: end_date < todayStr (directly completed & unlinked)
    // =========================================================================
    let completeQuery = adminSupabase
      .from("project_sprints")
      .select("id, name, project_id, company_id, start_date, end_date, status")
      .not("end_date", "is", null)
      .lte("end_date", todayStr);

    if (projectId) {
      completeQuery = completeQuery.eq("project_id", projectId);
    } else if (companyId) {
      completeQuery = completeQuery.or(`company_id.eq.${companyId},company_id.is.null`);
    }

    const { data: completeCandidates, error: completeFetchErr } = await completeQuery;

    if (!completeFetchErr && Array.isArray(completeCandidates) && completeCandidates.length > 0) {
      // Filter out sprints that are already marked COMPLETED
      const openSprints = completeCandidates.filter((s) => {
        const rawStatus = String(s.status || "").trim().toUpperCase();
        return rawStatus !== "COMPLETED" && rawStatus !== "CLOSED" && rawStatus !== "DONE";
      });

      for (const sprint of openSprints) {
        try {
          const rawEnd = typeof sprint.end_date === "string" ? sprint.end_date.split("T")[0] : sprint.end_date;
          const isPastEndDate = rawEnd < todayStr;
          const isTodayEndDate = rawEnd === todayStr;

          // Fetch all tasks for this sprint to determine completion readiness and rollover
          const { data: sprintTasks, error: taskFetchErr } = await adminSupabase
            .from("project_tasks")
            .select("id, title, status, progress, assigned_to, planned_assignee_id, story_points, company_id, project_id")
            .eq("sprint_id", sprint.id);

          if (taskFetchErr) {
            console.warn(`[SprintAutoLifecycle] Task fetch warning for sprint ${sprint.id}:`, taskFetchErr?.message);
            continue;
          }

          const tasksList = Array.isArray(sprintTasks) ? sprintTasks : [];
          const unfinishedTasks = tasksList.filter((t) => {
            const s = String(t.status || "").toUpperCase();
            return s !== "COMPLETED" && s !== "DONE";
          });

          // Auto-complete if:
          // 1. Scheduled end date has passed (rawEnd < todayStr)
          // 2. OR today is the end date and all assigned tasks are already completed (100% finished)
          const shouldAutoComplete = isPastEndDate || (isTodayEndDate && tasksList.length > 0 && unfinishedTasks.length === 0);

          if (shouldAutoComplete) {
            // Unfinished tasks rollover to Product Backlog (sprint_id = null)
            if (unfinishedTasks.length > 0) {
              const unfinishedIds = unfinishedTasks.map((t) => t.id);

              let { error: moveErr } = await adminSupabase
                .from("project_tasks")
                .update({
                  sprint_id: null,
                  updated_at: new Date().toISOString(),
                })
                .in("id", unfinishedIds);

              if (moveErr && (moveErr.message?.includes("updated_at") || moveErr.code === "42703")) {
                const retryMove = await adminSupabase
                  .from("project_tasks")
                  .update({
                    sprint_id: null,
                  })
                  .in("id", unfinishedIds);
                moveErr = retryMove.error;
              }

              // Audit the automated rollover in task_status_history
              try {
                const historyEntries = unfinishedTasks.map((t) => ({
                  company_id: t.company_id || sprint.company_id || companyId,
                  task_id: t.id,
                  changed_by: null, // Automated system lifecycle
                  old_status: t.status,
                  new_status: t.status,
                  comments: `Sprint "${sprint.name}" reached end date (${rawEnd}) and auto-completed. Task preserved at ${t.progress || 0}% progress and returned to Product Backlog.`,
                }));

                await adminSupabase.from("task_status_history").insert(historyEntries);
              } catch (histErr) {
                console.warn("[SprintAutoLifecycle] Audit history insert warning:", histErr?.message);
              }
            }

            // Update sprint status to COMPLETED
            let { error: completeUpdateErr } = await adminSupabase
              .from("project_sprints")
              .update({
                status: "COMPLETED",
                updated_at: new Date().toISOString(),
              })
              .eq("id", sprint.id);

            if (completeUpdateErr && (completeUpdateErr.message?.includes("updated_at") || completeUpdateErr.code === "42703")) {
              const retry = await adminSupabase
                .from("project_sprints")
                .update({
                  status: "COMPLETED",
                })
                .eq("id", sprint.id);
              completeUpdateErr = retry.error;
            }

            if (!completeUpdateErr) {
              completedCount++;
            }
          }
        } catch (sprintProcErr) {
          console.warn(`[SprintAutoLifecycle] Error processing sprint completion ${sprint?.id}:`, sprintProcErr?.message || sprintProcErr);
        }
      }
    }
  } catch (err) {
    console.warn("[SprintAutoLifecycle] Resilient catch in sprint sync:", err?.message || err);
  }

  return { startedCount, completedCount };
}
