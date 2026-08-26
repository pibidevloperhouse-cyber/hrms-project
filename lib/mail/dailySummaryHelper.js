import { transporter } from "./transporter";
import { buildDailySummaryEmailHTML } from "./dailySummaryEmail";

/**
 * Parses "09:00", "09:00:00", "09:30 AM", or "2:15 PM" into total minutes from midnight.
 */
function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const str = String(timeStr).trim();

  const ampmMatch = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = parseInt(ampmMatch[2], 10);
    const period = ampmMatch[3] ? ampmMatch[3].toUpperCase() : null;

    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;

    return hours * 60 + minutes;
  }

  const [hStr, mStr] = str.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Converts timestamp or time string into clean 12-hour format ("09:00 AM")
 */
function formatTime12h(dateInput, timeZone) {
  if (!dateInput) return "—";
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    ...(timeZone ? { timeZone } : {}),
  });
}

/**
 * Calculates delayed minutes and formatted duration string if check-in is after scheduled start time.
 */
function getDelayDuration(checkInDateStr, scheduledStartTimeStr, timeZone) {
  if (!checkInDateStr || !scheduledStartTimeStr) return null;
  const d = new Date(checkInDateStr);
  if (isNaN(d.getTime())) return null;

  const scheduledMinutes = parseTimeToMinutes(scheduledStartTimeStr);
  if (scheduledMinutes === null) return null;

  let checkInMinutes;
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "numeric",
        minute: "numeric",
        hour12: false,
      }).formatToParts(d);
      const h = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
      const m = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
      checkInMinutes = h * 60 + m;
    } catch {
      checkInMinutes = d.getHours() * 60 + d.getMinutes();
    }
  } else {
    checkInMinutes = d.getHours() * 60 + d.getMinutes();
  }

  const diffMinutes = checkInMinutes - scheduledMinutes;
  if (diffMinutes <= 0) return null;

  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;

  if (hours > 0 && mins > 0) {
    return `${hours}h ${mins}m`;
  }
  if (hours > 0) {
    return `${hours} hr${hours > 1 ? "s" : ""}`;
  }
  return `${mins} min${mins > 1 ? "s" : ""}`;
}

const hrRoles = ["admin", "hr_manager", "hr_executive", "hr", "manager", "owner", "super_admin", "superadmin"];

function isHrAccount(emp) {
  if (!emp) return false;
  const r = (emp.role || "").toLowerCase().trim();
  const d = (emp.designation || "").toLowerCase().trim();
  return (
    hrRoles.includes(r) ||
    r.includes("hr") ||
    r.includes("admin") ||
    r.includes("owner") ||
    r.includes("manager") ||
    d.includes("hr") ||
    d.includes("human resources") ||
    d.includes("admin") ||
    d.includes("owner") ||
    d.includes("manager")
  );
}

/**
 * Evaluates whether all working employees have checked out for the day in the given company.
 * Note: HR/Admin check-ins are explicitly IGNORED so HR presence never blocks or delays summary reports.
 * When all active employee shifts are concluded, generates and delivers the Daily Summary Report
 * to 'thepibitech@gmail.com' and the company's HR/Admin team in real time.
 *
 * @param {string} companyId - UUID of the company
 * @param {object} adminSupabase - Supabase Admin Client instance
 * @param {object} [options={}] - Options (e.g. { force: true } to bypass deduplication on manual trigger)
 * @returns {Promise<{ success?: boolean, sent: boolean, reason?: string, recipients?: string[], metrics?: object }>}
 */
export async function checkAndSendDailySummary(companyId, adminSupabase, options = {}) {
  try {
    const { force = false } = options;

    if (!companyId || !adminSupabase) {
      return { sent: false, reason: "invalid_params" };
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const todayStr = `${year}-${month}-${day}`;

    const startOfDay = new Date(year, now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const startOfDayIso = startOfDay.toISOString();

    // 1. Fetch Company Record
    const { data: company, error: compErr } = await adminSupabase
      .from("companies")
      .select("id, name, email, admin_id")
      .eq("id", companyId)
      .maybeSingle();

    if (compErr || !company) {
      return { sent: false, reason: "company_not_found" };
    }

    const companyName = company.name || "Company Workspace";

    // 2. Fetch All Active Employees for this company
    const { data: employees, error: empErr } = await adminSupabase
      .from("employees")
      .select("id, full_name, email, department, designation, role, status")
      .eq("company_id", companyId)
      .eq("status", "active")
      .order("full_name", { ascending: true });

    if (empErr || !employees || employees.length === 0) {
      return { sent: false, reason: "no_employees" };
    }

    // 3. Separate standard working employees from HR/Admin accounts
    // Standard working employees are tracked; HR check-ins are explicitly ignored
    const nonHrEmployees = employees.filter((emp) => !isHrAccount(emp));
    const trackedEmployees = nonHrEmployees.length > 0 ? nonHrEmployees : employees;
    const trackedEmpIds = new Set(trackedEmployees.map((e) => e.id));

    // 4. Fetch Today's Attendance Records
    const { data: todayAttendance, error: attErr } = await adminSupabase
      .from("attendance")
      .select("*")
      .eq("company_id", companyId)
      .gte("check_in", startOfDayIso)
      .order("check_in", { ascending: false });

    if (attErr) {
      console.warn("Notice fetching today attendance for summary:", attErr.message);
    }

    const attendanceList = todayAttendance || [];

    // Map each employee's latest attendance session today
    const attendanceMap = new Map();
    attendanceList.forEach((att) => {
      if (!attendanceMap.has(att.employee_id)) {
        attendanceMap.set(att.employee_id, att);
      }
    });

    // 5. CHECK CONDITION: Are any standard working employees still active (CHECKED_IN or ON_BREAK)?
    // HR/Admin check-ins are completely ignored and will NEVER block the daily summary email
    if (!force) {
      const activeStaff = [];
      attendanceMap.forEach((att, empId) => {
        if (trackedEmpIds.has(empId) && (att.status === "CHECKED_IN" || att.status === "ON_BREAK")) {
          activeStaff.push(empId);
        }
      });

      if (activeStaff.length > 0) {
        console.log(`⏳ Daily Summary: ${activeStaff.length} working employee(s) still clocked in. Waiting for all to check out.`);
        return {
          sent: false,
          reason: "active_shifts_remain",
          activeCount: activeStaff.length,
        };
      }

      // 6. CHECK CONDITION: Has at least one working shift concluded today among tracked employees?
      const completedStaff = [];
      attendanceMap.forEach((att, empId) => {
        if (
          trackedEmpIds.has(empId) &&
          (
            att.status === "COMPLETED" ||
            att.status === "CHECKED_OUT" ||
            att.status === "PENDING_APPROVAL" ||
            att.status === "APPROVED" ||
            att.status === "REJECTED_LOP"
          )
        ) {
          completedStaff.push(empId);
        }
      });

      if (completedStaff.length === 0) {
        console.log("⏳ Daily Summary: No standard employee shifts completed today yet.");
        return { sent: false, reason: "no_shifts_completed_today" };
      }

      // 7. DEDUPLICATION: Check if daily summary was already sent today for this company
      const { data: alreadySentNotif } = await adminSupabase
        .from("notifications")
        .select("id")
        .eq("company_id", companyId)
        .eq("title", "📊 Daily Attendance Summary Sent")
        .gte("created_at", startOfDayIso)
        .limit(1);

      if (alreadySentNotif && alreadySentNotif.length > 0) {
        return { sent: false, reason: "already_sent_today" };
      }
    }

    // 8. Fetch Company Work Schedule
    let targetHours = 8.0;
    let scheduledStartTime = "09:00";
    const { data: schedData } = await adminSupabase
      .from("company_work_schedules")
      .select("daily_working_hours, start_time")
      .eq("company_id", companyId)
      .maybeSingle();

    if (schedData) {
      if (schedData.daily_working_hours) {
        targetHours = Number(schedData.daily_working_hours) || 8.0;
      }
      if (schedData.start_time) {
        scheduledStartTime = schedData.start_time;
      }
    }

    // 9. Fetch Approved Leaves for Today
    const { data: approvedLeaves } = await adminSupabase
      .from("leave_requests")
      .select("*")
      .eq("company_id", companyId)
      .eq("status", "APPROVED")
      .lte("start_date", todayStr)
      .gte("end_date", todayStr);

    const leaveMap = new Map();
    if (approvedLeaves) {
      approvedLeaves.forEach((lv) => {
        leaveMap.set(lv.employee_id, lv);
      });
    }

    // 10. Aggregate Detailed Metrics for all employees
    let totalHoursSum = 0;
    let totalOvertimeHours = 0;
    let lateArrivalsCount = 0;
    let earlyDeparturesCount = 0;
    let onLeaveCount = 0;
    let absentCount = 0;
    let presentCount = 0;

    const employeeRecords = employees.map((emp) => {
      const att = attendanceMap.get(emp.id);
      const leave = leaveMap.get(emp.id);

      if (att) {
        presentCount++;
        const hoursNum = Number(att.working_hours) || 0;
        totalHoursSum += hoursNum;

        // Delayed time calculation
        const delayedDuration = getDelayDuration(att.check_in, scheduledStartTime);
        const isLate = Boolean(delayedDuration);
        if (isLate) lateArrivalsCount++;

        // Overtime calculation
        let overtimeHours = null;
        if (hoursNum > targetHours) {
          overtimeHours = Number((hoursNum - targetHours).toFixed(2));
          totalOvertimeHours += overtimeHours;
        }

        // Early checkout calculation
        const isEarly =
          Boolean(att.early_checkout) ||
          (hoursNum < targetHours - 0.005 && att.status !== "ON_BREAK") ||
          Boolean(att.early_reason);
        if (isEarly) earlyDeparturesCount++;

        // Status badge
        let statusBadge = `<span class="badge badge-present">Present</span>`;
        if (isEarly && isLate) {
          statusBadge = `<span class="badge badge-early">Late &amp; Early</span>`;
        } else if (isEarly) {
          statusBadge = `<span class="badge badge-early">Early Out</span>`;
        } else if (isLate) {
          statusBadge = `<span class="badge badge-late">Late In</span>`;
        }

        return {
          fullName: emp.full_name || "Employee",
          department: emp.department || "General",
          designation: emp.designation || "Staff",
          checkIn: formatTime12h(att.check_in),
          checkOut: formatTime12h(att.check_out),
          delayedDuration,
          overtimeHours,
          workingHours: hoursNum.toFixed(2),
          isLate,
          isEarly,
          earlyReason: att.early_reason || null,
          statusBadge,
        };
      }

      if (leave) {
        onLeaveCount++;
        return {
          fullName: emp.full_name || "Employee",
          department: emp.department || "General",
          designation: emp.designation || "Staff",
          checkIn: "—",
          checkOut: "—",
          delayedDuration: null,
          overtimeHours: null,
          workingHours: null,
          isLate: false,
          isEarly: false,
          earlyReason: `Approved Leave (${leave.leave_type || "Casual"})`,
          statusBadge: `<span class="badge badge-leave">On Leave</span>`,
        };
      }

      absentCount++;
      return {
        fullName: emp.full_name || "Employee",
        department: emp.department || "General",
        designation: emp.designation || "Staff",
        checkIn: "—",
        checkOut: "—",
        delayedDuration: null,
        overtimeHours: null,
        workingHours: null,
        isLate: false,
        isEarly: false,
        earlyReason: null,
        statusBadge: `<span class="badge badge-absent">Absent</span>`,
      };
    });

    const totalHoursWorked = Number(totalHoursSum.toFixed(2));
    const totalOTFormatted = Number(totalOvertimeHours.toFixed(2));
    const avgHoursPerStaff =
      presentCount > 0 ? Number((totalHoursSum / presentCount).toFixed(2)) : 0;

    const dateStr = startOfDay.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // 11. Collect Target Recipients: 'thepibitech@gmail.com' + Company HR & Owner
    const recipientEmails = new Set();

    // 1. Primary designated report inbox
    recipientEmails.add("thepibitech@gmail.com");

    // 2. Configured environment email addresses
    if (process.env.EMAIL_USER) {
      recipientEmails.add(process.env.EMAIL_USER.trim().toLowerCase());
    }
    if (process.env.HR_SUMMARY_EMAIL) {
      recipientEmails.add(process.env.HR_SUMMARY_EMAIL.trim().toLowerCase());
    }

    // 3. Company registered email address
    if (company.email) {
      recipientEmails.add(company.email.trim().toLowerCase());
    }

    // 4. Company Owner / Super Admin Account Email
    if (company.admin_id) {
      try {
        const { data: adminUser } = await adminSupabase.auth.admin.getUserById(company.admin_id);
        if (adminUser?.user?.email) {
          recipientEmails.add(adminUser.user.email.trim().toLowerCase());
        }
      } catch (authErr) {
        console.warn("Notice fetching company owner email:", authErr.message);
      }
    }

    // 5. Active HR & Management Staff Emails
    employees.forEach((emp) => {
      if (isHrAccount(emp) && emp.email) {
        recipientEmails.add(emp.email.trim().toLowerCase());
      }
    });

    const emailList = Array.from(recipientEmails).filter(Boolean);

    if (emailList.length === 0) {
      console.warn("No recipient email address found for company:", companyName);
      return { sent: false, reason: "no_recipients" };
    }

    console.log(`📋 Dispatching Daily Attendance Summary for ${companyName} to:`, emailList.join(", "));

    // 12. Build HTML Email
    const emailHTML = buildDailySummaryEmailHTML({
      companyName,
      dateStr,
      totalStaff: employees.length,
      presentCount,
      totalHoursWorked,
      avgHoursPerStaff,
      lateArrivalsCount,
      earlyDeparturesCount,
      totalOvertimeHours: totalOTFormatted,
      onLeaveCount,
      absentCount,
      employeeRecords,
    });

    // 13. Send Email to all recipients concurrently in real time
    const sendResults = await Promise.allSettled(
      emailList.map((targetEmail) =>
        transporter.sendMail({
          from: `"${companyName} HRMS" <${process.env.EMAIL_USER}>`,
          to: targetEmail,
          subject: `📊 Daily Attendance Summary Report (${dateStr}) - ${companyName}`,
          html: emailHTML,
        })
      )
    );

    sendResults.forEach((res, idx) => {
      const email = emailList[idx];
      if (res.status === "fulfilled") {
        console.log(`⚡ Daily Attendance Summary email successfully sent to: ${email}`);
      } else {
        console.error(`❌ Failed to send daily summary to ${email}:`, res.reason?.message || res.reason);
      }
    });

    // 14. Save Notification Record for HR Audit Log to prevent duplicate automated dispatches
    try {
      await adminSupabase.from("notifications").insert([
        {
          company_id: companyId,
          title: "📊 Daily Attendance Summary Sent",
          message: `Daily attendance summary report for ${dateStr} has been delivered to HR & Owner (${emailList.join(", ")}).`,
          is_read: false,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (notifErr) {
      console.warn("Notice saving summary notification:", notifErr);
    }

    return {
      success: true,
      sent: true,
      recipients: emailList,
      metrics: {
        totalStaff: employees.length,
        presentCount,
        totalHoursWorked,
        totalOvertimeHours: totalOTFormatted,
        avgHoursPerStaff,
        lateArrivalsCount,
        earlyDeparturesCount,
        onLeaveCount,
        absentCount,
      },
    };
  } catch (error) {
    console.error("checkAndSendDailySummary Error:", error);
    return { sent: false, reason: error.message };
  }
}


