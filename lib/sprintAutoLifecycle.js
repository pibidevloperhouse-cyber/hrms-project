/**
 * Sprint Automated Lifecycle Engine
 * 
 * Automatically manages sprint state transitions based on scheduled dates:
 * 1. AUTO-START: Sprints with status 'PLANNED' and start_date <= today automatically transition to 'ACTIVE'.
 * 2. Non-destructive Lifecycle: Sprints remain fully intact with task relations preserved.
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
    // 1. Auto-Start: Sprints with start_date <= today that are currently PLANNED
    let startQuery = adminSupabase
      .from("project_sprints")
      .select("id, name, project_id, start_date, end_date, status")
      .not("start_date", "is", null)
      .lte("start_date", todayStr);

    if (projectId) {
      startQuery = startQuery.eq("project_id", projectId);
    } else if (companyId) {
      startQuery = startQuery.or(`company_id.eq.${companyId},company_id.is.null`);
    }

    const { data: allCandidates, error: startFetchErr } = await startQuery;

    if (!startFetchErr && Array.isArray(allCandidates) && allCandidates.length > 0) {
      const sprintsToStart = allCandidates.filter((s) => {
        const rawStatus = String(s.status || "").trim().toUpperCase();
        return rawStatus === "PLANNED" || rawStatus === "PLANNING" || !rawStatus;
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
        }
      }
    }
  } catch (err) {
    console.warn("[SprintAutoLifecycle] Resilient catch in sprint sync:", err?.message || err);
  }

  return { startedCount, completedCount };
}
