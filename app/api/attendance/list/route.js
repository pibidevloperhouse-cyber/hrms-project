import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authHelper";

function isHRRole(role) {
  return ["ADMIN", "hr_manager", "hr_executive", "manager", "team_lead"].includes(role);
}

/**
 * GET /api/attendance/list?date=YYYY-MM-DD&department=...&search=...
 */
export async function GET(req) {
  try {
    const supabaseServer = await createClient();
    const user = await getAuthUser(req, supabaseServer);

    if (!user) {
      return NextResponse.json({ message: "Unauthorized. Please log in.", unauthorized: true }, { status: 401 });
    }

    const adminSupabase = createAdminClient();
    const userEmail = user.email ? user.email.toLowerCase() : "";

    let empOrFilter = `auth_user_id.eq.${user.id}`;
    if (userEmail) {
      empOrFilter += `,email.eq."${userEmail.replace(/"/g, '""')}"`;
    }

    const { data: empRecords } = await adminSupabase
      .from("employees")
      .select("*, companies:company_id(*)")
      .or(empOrFilter)
      .order("created_at", { ascending: false })
      .limit(1);

    let currentEmp = empRecords && empRecords.length > 0 ? empRecords[0] : null;
    let companyId = currentEmp ? currentEmp.company_id : null;
    let userRole = currentEmp ? currentEmp.role : "employee";

    if (!companyId) {
      let adminOrFilter = `admin_id.eq.${user.id}`;
      if (userEmail) {
        adminOrFilter += `,email.eq."${userEmail.replace(/"/g, '""')}"`;
      }

      const { data: adminCompanies } = await adminSupabase
        .from("companies")
        .select("*")
        .or(adminOrFilter);

      if (adminCompanies && adminCompanies.length > 0) {
        companyId = adminCompanies[0].id;
        userRole = "ADMIN";
      }
    }

    if (!companyId) {
      return NextResponse.json({ message: "No company workspace found." }, { status: 404 });
    }

    if (!isHRRole(userRole)) {
      return NextResponse.json({ message: "Access denied. HR privileges required." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date") || new Date().toISOString().split("T")[0];
    const deptFilter = searchParams.get("department") || "";
    const searchQuery = (searchParams.get("search") || "").toLowerCase().trim();

    const dateObj = new Date(`${dateParam}T00:00:00`);
    const startDate = new Date(dateObj.getTime() - 12 * 3600 * 1000);
    const endDate = new Date(dateObj.getTime() + 36 * 3600 * 1000);

    // Fetch company working schedule for target hours
    let companyDailyWorkingHours = 8.0;
    const { data: schedData } = await adminSupabase
      .from("company_work_schedules")
      .select("daily_working_hours")
      .eq("company_id", companyId)
      .maybeSingle();

    if (schedData && schedData.daily_working_hours) {
      companyDailyWorkingHours = Number(schedData.daily_working_hours) || 8.0;
    }

    let empQuery = adminSupabase
      .from("employees")
      .select("*")
      .eq("company_id", companyId)
      .order("full_name", { ascending: true });

    if (deptFilter && deptFilter !== "all") {
      empQuery = empQuery.eq("department", deptFilter);
    }

    const { data: employees, error: empErr } = await empQuery;
    if (empErr) throw empErr;

    const { data: attendanceRecords, error: attErr } = await adminSupabase
      .from("attendance")
      .select("*")
      .eq("company_id", companyId)
      .gte("check_in", startDate.toISOString())
      .lte("check_in", endDate.toISOString());

    if (attErr && attErr.code !== "42P01") {
      console.warn("Attendance table error:", attErr.message);
    }

    // Check if daily summary report has already been sent for this date
    let isReportSent = false;
    try {
      const { data: sentNotifs } = await adminSupabase
        .from("notifications")
        .select("id")
        .eq("company_id", companyId)
        .or(`title.eq."📊 Daily Attendance Summary Sent - ${dateParam}",message.ilike."%${dateParam}%"`)
        .limit(1);

      if (sentNotifs && sentNotifs.length > 0) {
        isReportSent = true;
      }
    } catch {
      // If notifications table is not queryable, will fallback to client storage
    }

    const nowMs = Date.now();
    const attendanceMap = new Map();
    const todayStr = new Date().toISOString().split("T")[0];
    const isViewingToday = dateParam === todayStr;

    if (attendanceRecords) {
      // Sort descending by check_in so latest check-in session takes precedence
      const sortedRecords = [...attendanceRecords].sort((a, b) => new Date(b.check_in).getTime() - new Date(a.check_in).getTime());

      sortedRecords.forEach((rec) => {
        const recDateStr = rec.check_in ? rec.check_in.split("T")[0] : "";
        const recLocalStr = rec.check_in ? new Date(rec.check_in).toLocaleDateString("en-CA") : "";
        const isActive = rec.status === "CHECKED_IN" || rec.status === "ON_BREAK";
        const isTargetDateMatch = rec.work_date === dateParam || recDateStr === dateParam || recLocalStr === dateParam;

        // If viewing a past date, do NOT include records from other dates (e.g. today's active shift)
        if (!isTargetDateMatch && (!isViewingToday || !isActive)) {
          return;
        }

        if (!attendanceMap.has(rec.employee_id)) {
          attendanceMap.set(rec.employee_id, rec);
        } else {
          const existing = attendanceMap.get(rec.employee_id);
          const existingRecDateStr = existing.check_in ? existing.check_in.split("T")[0] : "";
          const existingRecLocalStr = existing.check_in ? new Date(existing.check_in).toLocaleDateString("en-CA") : "";
          const existingIsTargetMatch = existing.work_date === dateParam || existingRecDateStr === dateParam || existingRecLocalStr === dateParam;

          // Target date match ALWAYS overrides a non-target date record
          if (isTargetDateMatch && !existingIsTargetMatch) {
            attendanceMap.set(rec.employee_id, rec);
          } else if (isTargetDateMatch && existingIsTargetMatch) {
            const existingIsActive = existing.status === "CHECKED_IN" || existing.status === "ON_BREAK";
            if (isActive && !existingIsActive) {
              attendanceMap.set(rec.employee_id, rec);
            }
          }
        }
      });
    }

    // Fetch approved leave requests for company to handle approved leave days
    const { data: approvedLeaves } = await adminSupabase
      .from("leave_requests")
      .select("*")
      .eq("company_id", companyId)
      .eq("status", "APPROVED");

    const leaveMap = new Map();
    if (approvedLeaves) {
      approvedLeaves.forEach((lv) => {
        const sDate = lv.start_date || lv.leave_date;
        const eDate = lv.end_date || sDate;
        if (sDate && eDate && dateParam >= sDate && dateParam <= eDate) {
          leaveMap.set(lv.employee_id, lv);
        }
      });
    }

    // Fetch company holiday for target date if registered
    const { data: dateHoliday } = await adminSupabase
      .from("company_holidays")
      .select("*")
      .eq("company_id", companyId)
      .eq("date", dateParam)
      .maybeSingle();

    const isCompanyHoliday = Boolean(dateHoliday);
    const dateHolidayTitle = dateHoliday?.title || null;

    let checkedInCount = 0;
    let checkedOutCount = 0;
    let notCheckedInCount = 0;
    let onLeaveCount = 0;
    let holidayCount = 0;

    const list = (employees || []).map((emp) => {
      const att = attendanceMap.get(emp.id);
      const approvedLeave = leaveMap.get(emp.id);

      let status = "NOT_CHECKED_IN";
      let checkIn = null;
      let checkOut = null;
      let workingHours = 0;
      let netWorkingSeconds = 0;

      if (att) {
        checkIn = att.check_in;
        checkOut = att.check_out;

        const checkInMs = att.check_in ? new Date(att.check_in).getTime() : 0;
        const startOfTodayMs = new Date().setHours(0, 0, 0, 0);
        const isPastDate = checkInMs > 0 && checkInMs < startOfTodayMs;

        if (isPastDate && (att.status === "CHECKED_IN" || att.status === "ON_BREAK" || !att.check_out || Number(att.working_hours || 0) === 0)) {
          const autoEndMs = Math.min(nowMs, checkInMs + 8 * 3600 * 1000);
          checkOut = att.check_out || new Date(autoEndMs).toISOString();
          const grossSec = Math.max(1, Math.floor((autoEndMs - checkInMs) / 1000));
          const breakSec = Number(att.total_break_seconds) || 0;
          const netSec = Math.max(1, grossSec - breakSec);
          netWorkingSeconds = netSec;
          workingHours = Number((netSec / 3600).toFixed(2));
          status = "COMPLETED";
          checkedOutCount++;

          adminSupabase
            .from("attendance")
            .update({
              check_out: checkOut,
              working_hours: workingHours,
              status: "COMPLETED",
              approval_status: "APPROVED",
              updated_at: new Date().toISOString(),
            })
            .eq("id", att.id)
            .then();
        } else if (att.status === "CHECKED_IN") {
          status = "CHECKED_IN";
          checkedInCount++;
          const grossSec = Math.max(0, Math.floor((nowMs - checkInMs) / 1000));
          const breakSec = Number(att.total_break_seconds) || 0;
          const netSec = Math.max(0, grossSec - breakSec);
          netWorkingSeconds = netSec;
          workingHours = Number((netSec / 3600).toFixed(2));
        } else if (att.status === "ON_BREAK") {
          status = "ON_BREAK";
          checkedInCount++;
          const grossSec = Math.max(0, Math.floor((nowMs - checkInMs) / 1000));
          let breakSec = Number(att.total_break_seconds) || 0;
          const breakStartIso = att.break_start || att.updated_at || att.check_in;
          if (breakStartIso) {
            breakSec += Math.max(0, Math.floor((nowMs - new Date(breakStartIso).getTime()) / 1000));
          }
          const netSec = Math.max(0, grossSec - breakSec);
          netWorkingSeconds = netSec;
          workingHours = Number((netSec / 3600).toFixed(2));
        } else if (att.status === "PENDING_APPROVAL") {
          status = "PENDING_APPROVAL";
          checkedOutCount++;
          workingHours = Number(att.working_hours || 0);
          netWorkingSeconds = Math.round(workingHours * 3600);
        } else if (att.status === "REJECTED_LOP") {
          status = "REJECTED_LOP";
          checkedOutCount++;
          workingHours = Number(att.working_hours || 0);
          netWorkingSeconds = Math.round(workingHours * 3600);
        } else if (att.status === "COMPLETED" || att.status === "CHECKED_OUT") {
          status = "COMPLETED";
          checkedOutCount++;
          workingHours = Number(att.working_hours || 0);
          netWorkingSeconds = Math.round(workingHours * 3600);
        }
      } else if (approvedLeave) {
        status = "ON_LEAVE";
        onLeaveCount++;
        workingHours = 8.0;
        netWorkingSeconds = 8 * 3600;
      } else if (isCompanyHoliday) {
        status = "COMPANY_HOLIDAY";
        holidayCount++;
        workingHours = 8.0;
        netWorkingSeconds = 8 * 3600;
      } else {
        notCheckedInCount++;
        netWorkingSeconds = 0;
      }

      const resolvedEarlyReason = att?.early_reason || null;

      return {
        employeeId: emp.id,
        fullName: emp.full_name || "Employee",
        email: emp.email || "",
        department: emp.department || "General",
        designation: emp.designation || "Staff",
        role: emp.role || "employee",
        username: emp.username || null,
        status,
        isOnBreak: att?.status === "ON_BREAK",
        breakStart: att?.break_start || null,
        totalBreakSeconds: Number(att?.total_break_seconds) || 0,
        workDate: att?.work_date || (checkIn ? checkIn.split("T")[0] : null),
        checkIn,
        checkOut,
        workingHours,
        netWorkingSeconds,
        earlyCheckout: Boolean(att?.early_checkout) || (workingHours < (companyDailyWorkingHours - 0.005) && att?.status !== "CHECKED_IN" && att?.status !== "ON_BREAK" && att?.status !== "ON_LEAVE" && att?.status !== "COMPANY_HOLIDAY" && att?.status !== undefined) || Boolean(resolvedEarlyReason),
        earlyReason: resolvedEarlyReason,
        approvalStatus: att?.approval_status || (att?.status === "PENDING_APPROVAL" ? "PENDING" : att?.status === "REJECTED_LOP" ? "REJECTED" : "APPROVED"),
        isLop: att?.is_lop || att?.status === "REJECTED_LOP",
        hrFeedback: att?.hr_feedback || null,
        leaveType: approvedLeave?.leave_type || null,
        leaveReason: approvedLeave?.reason || null,
        holidayTitle: dateHolidayTitle || null,
        attendanceRecordId: att?.id || null,
      };
    });

    const filteredList = list.filter((emp) => {
      if (!searchQuery) return true;
      return (
        emp.fullName.toLowerCase().includes(searchQuery) ||
        emp.email.toLowerCase().includes(searchQuery) ||
        emp.department.toLowerCase().includes(searchQuery) ||
        emp.designation.toLowerCase().includes(searchQuery)
      );
    });

    const totalStaff = (employees || []).length;
    const presentTotal = checkedInCount + checkedOutCount + onLeaveCount + holidayCount;
    const attendanceRate = totalStaff > 0 ? Math.round((presentTotal / totalStaff) * 100) : 0;

    return NextResponse.json({
      success: true,
      date: dateParam,
      isReportSent: Boolean(isReportSent),
      isCompanyHoliday,
      holidayTitle: dateHolidayTitle,
      summary: {
        totalStaff,
        checkedInCount,
        checkedOutCount,
        notCheckedInCount,
        onLeaveCount,
        holidayCount,
        presentTotal,
        attendanceRate,
      },
      records: filteredList,
    });
  } catch (error) {
    console.error("GET /api/attendance/list error:", error);
    return NextResponse.json({ message: error.message || "Internal server error." }, { status: 500 });
  }
}
