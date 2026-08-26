import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyAndRoleForUser } from "@/lib/supabase/companyHelper";

function calculateHoursFromTimes(startStr, endStr) {
  if (!startStr || !endStr) return 8.0;
  const [sh, sm] = startStr.split(":").map(Number);
  const [eh, em] = endStr.split(":").map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return 8.0;

  let startMinutes = sh * 60 + sm;
  let endMinutes = eh * 60 + em;

  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }

  const diffMinutes = endMinutes - startMinutes;
  const diffHours = Number((diffMinutes / 60).toFixed(1));
  return diffHours > 0 ? diffHours : 8.0;
}

/**
 * POST /api/company/calendar/schedule
 * Saves or updates company working hours schedule.
 * Restricted to HR (ADMIN, hr_manager, hr_executive).
 */
export async function POST(req) {
  try {
    const supabaseServer = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabaseServer.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json(
        { message: "Unauthorized. Please log in." },
        { status: 401 }
      );
    }

    const adminSupabase = createAdminClient();
    const { company, role } = await getCompanyAndRoleForUser(adminSupabase, user);

    if (!company) {
      return NextResponse.json(
        { message: "No company workspace found." },
        { status: 404 }
      );
    }

    const isHR = ["ADMIN", "hr_manager", "hr_executive"].includes(role);
    if (!isHR) {
      return NextResponse.json(
        { message: "Access denied. Only HR Managers and Company Admins can configure working hours." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { dailyWorkingHours, startTime, endTime, workDays } = body;

    const cleanStartTime = startTime?.trim() || "09:00";
    const cleanEndTime = endTime?.trim() || "17:00";

    const autoCalcHours = calculateHoursFromTimes(cleanStartTime, cleanEndTime);
    const hoursNum = (dailyWorkingHours !== undefined && dailyWorkingHours !== null && dailyWorkingHours !== "")
      ? Number(dailyWorkingHours)
      : autoCalcHours;

    if (isNaN(hoursNum) || hoursNum < 1 || hoursNum > 24) {
      return NextResponse.json(
        { message: "Daily working hours must be between 1 and 24 hours." },
        { status: 400 }
      );
    }
    const cleanWorkDays = Array.isArray(workDays) && workDays.length > 0
      ? workDays
      : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

    const payload = {
      company_id: company.id,
      daily_working_hours: hoursNum,
      start_time: cleanStartTime,
      end_time: cleanEndTime,
      work_days: cleanWorkDays,
      updated_at: new Date().toISOString(),
    };

    const { data: updatedData, error: upsertErr } = await adminSupabase
      .from("company_work_schedules")
      .upsert(payload, { onConflict: "company_id" })
      .select()
      .single();

    if (upsertErr) {
      if (upsertErr.code === "42P01") {
        return NextResponse.json(
          { message: "Table 'company_work_schedules' does not exist yet. Please run migration 20260811_create_company_calendar_tables.sql in Supabase SQL Editor." },
          { status: 400 }
        );
      }
      throw upsertErr;
    }

    return NextResponse.json({
      success: true,
      message: "Company working hours schedule updated successfully!",
      schedule: {
        id: updatedData.id,
        dailyWorkingHours: Number(updatedData.daily_working_hours),
        startTime: updatedData.start_time,
        endTime: updatedData.end_time,
        workDays: updatedData.work_days,
      },
    });
  } catch (error) {
    console.error("POST /api/company/calendar/schedule error:", error);
    return NextResponse.json(
      { message: error.message || "Failed to update company working schedule." },
      { status: 500 }
    );
  }
}
