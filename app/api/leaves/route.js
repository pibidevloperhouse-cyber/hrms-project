import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { transporter } from "@/lib/mail/transporter";
import { buildLeaveRequestNoticeHTML } from "@/lib/mail/leaveEmail";

const MONTHLY_ALLOWANCE = 3.0;

/**
 * Helper to determine if a role has HR privileges.
 */
function isHRRole(role) {
  return role === "hr_manager" || role === "hr_executive";
}

/**
 * Calculate business/calendar days between two YYYY-MM-DD date strings inclusive.
 */
function calculateLeaveDays(startDateStr, endDateStr) {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.round(diffTime / (1000 * 3600 * 24)) + 1;
  return diffDays;
}

/**
 * GET /api/leaves?month=8&year=2026
 * 
 * Fetches leave requests and monthly leave balance breakdown.
 * - HR/Admins see all company leave requests.
 * - Regular employees see their own leave requests.
 */
export async function GET(req) {
  try {
    const supabaseServer = await createClient();
    const { data: { user }, error: authErr } = await supabaseServer.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ message: "Unauthorized. Please log in." }, { status: 401 });
    }

    const adminSupabase = createAdminClient();
    const userEmail = user.email ? user.email.toLowerCase() : "";

    // 1. Resolve employee record and company
    const { data: empRecords } = await adminSupabase
      .from("employees")
      .select("*, companies:company_id(*)")
      .or(`auth_user_id.eq.${user.id},email.eq.${userEmail}`)
      .order("created_at", { ascending: false })
      .limit(1);

    let empRecord = empRecords && empRecords.length > 0 ? empRecords[0] : null;
    let companyId = null;
    let userRole = "employee";

    if (empRecord) {
      companyId = empRecord.company_id;
      userRole = empRecord.role || "employee";
    } else {
      // Check if user is Company Owner / Admin
      const { data: adminCompanies } = await adminSupabase
        .from("companies")
        .select("*")
        .or(`admin_id.eq.${user.id},email.eq.${userEmail}`);

      if (adminCompanies && adminCompanies.length > 0) {
        companyId = adminCompanies[0].id;
        userRole = "ADMIN";

        // Auto-create or fetch employee record for Admin so leave management applies to all accounts
        const { data: adminEmp } = await adminSupabase
          .from("employees")
          .upsert(
            {
              company_id: companyId,
              full_name: adminCompanies[0].name || "Company Administrator",
              email: userEmail,
              role: "ADMIN",
              status: "active",
              auth_user_id: user.id,
            },
            { onConflict: "company_id,email" }
          )
          .select()
          .maybeSingle();

        empRecord = adminEmp || empRecord;
      }
    }

    if (!companyId) {
      return NextResponse.json(
        { message: "No registered company found for this user." },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const targetMonth = parseInt(searchParams.get("month") || (now.getMonth() + 1).toString(), 10);
    const targetYear = parseInt(searchParams.get("year") || now.getFullYear().toString(), 10);

    const isAdmin = userRole === "ADMIN";
    const isHR = isHRRole(userRole) || isAdmin;

    // Format start and end date for filtering the month
    const startOfMonth = `${targetYear}-${String(targetMonth).padStart(2, "0")}-01`;
    const lastDayOfMonth = new Date(targetYear, targetMonth, 0).getDate();
    const endOfMonth = `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(lastDayOfMonth).padStart(2, "0")}`;

    // 2. Fetch Leave Requests
    let query = adminSupabase
      .from("leave_requests")
      .select(`
        *,
        employees:employee_id (
          id,
          full_name,
          email,
          department,
          designation,
          role
        )
      `)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (!isHR) {
      if (!empRecord) {
        return NextResponse.json({ leaves: [], balance: { allowance: 3, used: 0, available: 3 } });
      }
      query = query.eq("employee_id", empRecord.id);
    }

    const { data: leaves, error: leavesErr } = await query;

    if (leavesErr) {
      // If table doesn't exist or schema cache is missing total_days column
      if (
        leavesErr.code === "42P01" ||
        leavesErr.code === "PGRST204" ||
        leavesErr.message?.includes("total_days") ||
        leavesErr.message?.includes("schema cache")
      ) {
        return NextResponse.json({
          success: true,
          leaves: [],
          balance: { allowance: MONTHLY_ALLOWANCE, used: 0, available: MONTHLY_ALLOWANCE },
          isHR,
          isAdmin,
          role: userRole,
          warning: "Supabase schema cache update required: Please run migration 20260807_create_leave_requests_table.sql in Supabase SQL Editor.",
        });
      }
      throw leavesErr;
    }

    // 3. Calculate Monthly Balance for current employee
    let usedDaysThisMonth = 0;
    if (empRecord) {
      const userLeaves = leaves ? leaves.filter(l => l.employee_id === empRecord.id) : [];
      
      userLeaves.forEach(l => {
        // Only count APPROVED or PENDING leaves for the target month
        if (l.status === "APPROVED" || l.status === "PENDING") {
          const leaveStart = new Date(l.start_date);
          if (
            leaveStart.getFullYear() === targetYear &&
            leaveStart.getMonth() + 1 === targetMonth
          ) {
            usedDaysThisMonth += Number(l.total_days || 0);
          }
        }
      });
    }

    const availableDaysThisMonth = Math.max(0, MONTHLY_ALLOWANCE - usedDaysThisMonth);

    // Fetch company work schedule for company workspace
    let workDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const { data: schedData } = await adminSupabase
      .from("company_work_schedules")
      .select("work_days")
      .eq("company_id", companyId)
      .maybeSingle();

    if (schedData && Array.isArray(schedData.work_days) && schedData.work_days.length > 0) {
      workDays = schedData.work_days;
    }

    // Fetch company holidays for company workspace
    const { data: companyHolidaysData } = await adminSupabase
      .from("company_holidays")
      .select("*")
      .eq("company_id", companyId);

    return NextResponse.json({
      success: true,
      leaves: leaves || [],
      companyHolidays: companyHolidaysData || [],
      workDays,
      isHR,
      isAdmin,
      role: userRole,
      employeeId: empRecord ? empRecord.id : null,
      balance: {
        allowance: MONTHLY_ALLOWANCE,
        used: usedDaysThisMonth,
        available: availableDaysThisMonth,
        targetMonth,
        targetYear,
      },
    });
  } catch (error) {
    console.error("GET /api/leaves Error:", error);
    return NextResponse.json(
      { message: error.message || "Internal server error." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/leaves
 * 
 * Submits a new leave request with strict date & available balance validation.
 */
export async function POST(req) {
  try {
    const supabaseServer = await createClient();
    const { data: { user }, error: authErr } = await supabaseServer.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ message: "Unauthorized. Please log in." }, { status: 401 });
    }

    const body = await req.json();
    const { leave_type = "Casual", start_date, end_date, reason } = body;

    // 1. Inputs validation
    if (!start_date || !end_date) {
      return NextResponse.json({ message: "Start date and end date are required." }, { status: 400 });
    }

    const todayStr = new Date().toISOString().split("T")[0];
    if (start_date < todayStr) {
      return NextResponse.json(
        { message: "Start date cannot be before today's date. Please select today or a future date." },
        { status: 400 }
      );
    }

    if (!reason || !reason.trim()) {
      return NextResponse.json({ message: "Please provide a reason for the leave request." }, { status: 400 });
    }

    let totalDays = calculateLeaveDays(start_date, end_date);
    if (totalDays <= 0) {
      return NextResponse.json({ message: "End date cannot be earlier than start date." }, { status: 400 });
    }

    const adminSupabase = createAdminClient();
    const userEmail = user.email ? user.email.toLowerCase() : "";

    // 2. Resolve employee and company
    const { data: empRecords } = await adminSupabase
      .from("employees")
      .select("*, companies:company_id(*)")
      .or(`auth_user_id.eq.${user.id},email.eq.${userEmail}`)
      .order("created_at", { ascending: false })
      .limit(1);

    let empRecord = empRecords && empRecords.length > 0 ? empRecords[0] : null;

    if (!empRecord) {
      const { data: adminCompanies } = await adminSupabase
        .from("companies")
        .select("*")
        .or(`admin_id.eq.${user.id},email.eq.${userEmail}`);

      if (adminCompanies && adminCompanies.length > 0) {
        const { data: adminEmp } = await adminSupabase
          .from("employees")
          .upsert(
            {
              company_id: adminCompanies[0].id,
              full_name: adminCompanies[0].name || "Company Administrator",
              email: userEmail,
              role: "ADMIN",
              status: "active",
              auth_user_id: user.id,
            },
            { onConflict: "company_id,email" }
          )
          .select()
          .maybeSingle();

        empRecord = adminEmp;
      }
    }

    if (!empRecord) {
      return NextResponse.json(
        { message: "Employee profile not found. Please contact HR to complete your profile." },
        { status: 404 }
      );
    }

    const companyId = empRecord.company_id;
    const leaveStartDate = new Date(start_date);
    const targetMonth = leaveStartDate.getMonth() + 1;
    const targetYear = leaveStartDate.getFullYear();

    // Check if requested leave date range covers today and employee has already checked in today
    if (start_date <= todayStr && end_date >= todayStr) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const { data: todayAttendance } = await adminSupabase
        .from("attendance")
        .select("*")
        .eq("employee_id", empRecord.id)
        .gte("check_in", startOfDay.toISOString())
        .limit(1);

      if (todayAttendance && todayAttendance.length > 0) {
        return NextResponse.json(
          {
            message: "You have already checked in for today. Leave cannot be applied after checking in.",
            alreadyCheckedIn: true,
          },
          { status: 400 }
        );
      }
    }


    // Fetch company work schedule and holidays for checking working days vs off-days/holidays
    let workDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const { data: schedData } = await adminSupabase
      .from("company_work_schedules")
      .select("work_days")
      .eq("company_id", companyId)
      .maybeSingle();

    if (schedData && Array.isArray(schedData.work_days) && schedData.work_days.length > 0) {
      workDays = schedData.work_days;
    }

    const { data: holidayMatches } = await adminSupabase
      .from("company_holidays")
      .select("*")
      .eq("company_id", companyId)
      .gte("date", start_date)
      .lte("date", end_date);

    const holidayDatesMap = new Map();
    if (holidayMatches) {
      holidayMatches.forEach((h) => holidayDatesMap.set(h.date, h.title));
    }

    // Iterate through requested date range to calculate effective working days
    let effectiveWorkingDays = 0;
    let calendarDaysCount = 0;
    let offDaysCount = 0;
    let holidaysCount = 0;
    let firstHolidayName = null;
    let firstOffDayName = null;
    let firstOffDayDate = null;

    const currDate = new Date(start_date);
    const stopDate = new Date(end_date);

    while (currDate <= stopDate) {
      calendarDaysCount++;
      const dateStr = currDate.toISOString().split("T")[0];
      const dayName = currDate.toLocaleDateString("en-US", { weekday: "long" });

      const isHoliday = holidayDatesMap.has(dateStr);
      const isWorkDay = workDays.includes(dayName);

      if (isHoliday) {
        holidaysCount++;
        if (!firstHolidayName) firstHolidayName = holidayDatesMap.get(dateStr);
      } else if (!isWorkDay) {
        offDaysCount++;
        if (!firstOffDayName) {
          firstOffDayName = dayName;
          firstOffDayDate = dateStr;
        }
      } else {
        effectiveWorkingDays++;
      }

      currDate.setDate(currDate.getDate() + 1);
    }

    // Validation checks for non-working days & holidays
    if (effectiveWorkingDays <= 0) {
      if (holidaysCount > 0 && offDaysCount === 0) {
        return NextResponse.json(
          {
            message: `Leave application disabled: Selected date(s) fall on an official company holiday ("${firstHolidayName}"). Company holidays are paid non-working days!`,
            isCompanyHoliday: true,
          },
          { status: 400 }
        );
      } else if (offDaysCount > 0 && holidaysCount === 0) {
        return NextResponse.json(
          {
            message: `Leave application disabled: ${firstOffDayDate} (${firstOffDayName}) is a company off-day / non-working day. Leave applications are not required or allowed on weekly off-days!`,
            isNonWorkingDay: true,
          },
          { status: 400 }
        );
      } else {
        return NextResponse.json(
          {
            message: `Leave application disabled: All selected dates are company holidays or weekly off-days. Leave requests are only required for company working days!`,
            isNonWorkingDay: true,
          },
          { status: 400 }
        );
      }
    }

    // Check if single day request is on a holiday or off-day
    if (start_date === end_date) {
      if (holidaysCount > 0) {
        return NextResponse.json(
          {
            message: `Leave application disabled: ${start_date} is an official company holiday ("${firstHolidayName}"). Company holidays are paid non-working days!`,
            isCompanyHoliday: true,
          },
          { status: 400 }
        );
      }
      if (offDaysCount > 0) {
        return NextResponse.json(
          {
            message: `Leave application disabled: ${start_date} (${firstOffDayName}) is a company off-day. Leave applications are not allowed on weekly off-days!`,
            isNonWorkingDay: true,
          },
          { status: 400 }
        );
      }
    }

    totalDays = effectiveWorkingDays;

    // 3. Validate available leave balance for the target month
    const { data: existingLeaves } = await adminSupabase
      .from("leave_requests")
      .select("*")
      .eq("employee_id", empRecord.id)
      .in("status", ["APPROVED", "PENDING"]);

    let usedDaysForMonth = 0;
    if (existingLeaves) {
      existingLeaves.forEach(l => {
        const lDate = new Date(l.start_date);
        if (lDate.getFullYear() === targetYear && lDate.getMonth() + 1 === targetMonth) {
          usedDaysForMonth += Number(l.total_days || 0);
        }
      });
    }

    const availableBalance = Math.max(0, MONTHLY_ALLOWANCE - usedDaysForMonth);

    if (totalDays > availableBalance) {
      return NextResponse.json(
        {
          message: `Insufficient leave balance for ${leaveStartDate.toLocaleString("default", { month: "long" })} ${targetYear}. You requested ${totalDays} day(s), but only ${availableBalance} day(s) remain out of your 3-day monthly allowance.`,
          totalDays,
          availableBalance,
          usedDaysForMonth,
        },
        { status: 400 }
      );
    }

    // 4. Create the Leave Request
    const { data: newLeave, error: insertErr } = await adminSupabase
      .from("leave_requests")
      .insert({
        company_id: companyId,
        employee_id: empRecord.id,
        employee_name: empRecord.full_name || "Employee",
        employee_email: empRecord.email || userEmail,
        leave_type,
        leave_date: start_date,
        start_date,
        end_date,
        total_days: totalDays,
        reason: reason.trim(),
        status: "PENDING",
      })
      .select(`
        *,
        employees:employee_id (
          id,
          full_name,
          email,
          department,
          designation,
          role
        )
      `)
      .single();

    if (insertErr) {
      if (
        insertErr.code === "PGRST204" ||
        insertErr.message?.includes("total_days") ||
        insertErr.message?.includes("schema cache")
      ) {
        return NextResponse.json(
          {
            message: "Supabase PostgREST schema cache needs reload. Please open Supabase Dashboard -> SQL Editor, run the updated script in 20260807_create_leave_requests_table.sql (which contains 'NOTIFY pgrst, ''reload schema'';'), and click Run.",
            detail: insertErr.message,
          },
          { status: 400 }
        );
      }
      throw insertErr;
    }

    // 6. Send notification email according to hierarchy
    const isHRApplicant = isHRRole(empRecord.role);
    try {
      if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        let recipientEmails = [];
        const companyName = empRecord.companies?.name || "Company";

        if (isHRApplicant) {
          // HR Member applied -> Route email directly to Company Owner
          const { data: compAdmin } = await adminSupabase
            .from("companies")
            .select("email, admin_id")
            .eq("id", companyId)
            .single();

          if (compAdmin?.email) {
            recipientEmails.push(compAdmin.email);
          }
        } else {
          // Regular Employee applied -> Route email to HR personnel (and Owner)
          const { data: hrMembers } = await adminSupabase
            .from("employees")
            .select("email")
            .eq("company_id", companyId)
            .in("role", ["hr_manager", "hr_executive"]);

          const hrEmails = hrMembers && hrMembers.length > 0
            ? hrMembers.map((h) => h.email).filter(Boolean)
            : [];

          recipientEmails = hrEmails;

          // Also notify owner if no HR is available
          if (recipientEmails.length === 0) {
            const { data: compAdmin } = await adminSupabase
              .from("companies")
              .select("email")
              .eq("id", companyId)
              .single();
            if (compAdmin?.email) recipientEmails.push(compAdmin.email);
          }
        }

        if (recipientEmails.length > 0) {
          const html = buildLeaveRequestNoticeHTML({
            companyName,
            employeeName: empRecord.full_name || "Employee",
            employeeEmail: empRecord.email || userEmail,
            department: empRecord.department || "General",
            role: empRecord.role || "employee",
            leaveType: leave_type,
            leaveDate: `${start_date} to ${end_date} (${totalDays} day${totalDays > 1 ? "s" : ""})`,
            reason,
            isHRApplicant,
          });

          const subject = isHRApplicant
            ? `👔 HR Leave Request: ${empRecord.full_name} (${start_date} to ${end_date}) — Company Owner Approval Required`
            : `✈️ Employee Leave Request: ${empRecord.full_name} (${start_date} to ${end_date})`;

          await transporter.sendMail({
            from: `"${companyName} HRMS" <${process.env.EMAIL_USER}>`,
            to: recipientEmails.join(", "),
            subject,
            html,
          });
        }
      }
    } catch (mailErr) {
      console.warn("Leave Notification Email Warning:", mailErr.message);
    }

    return NextResponse.json({
      success: true,
      message: isHRApplicant
        ? "Leave request submitted successfully. Routed to Company Owner for approval."
        : "Leave request submitted successfully for HR review.",
      leave: newLeave,
      isHRApplicant,
      remainingBalance: Math.max(0, availableBalance - totalDays),
    });
  } catch (error) {
    console.error("POST /api/leaves Error:", error);
    return NextResponse.json(
      { message: error.message || "Failed to submit leave request." },
      { status: 500 }
    );
  }
}
