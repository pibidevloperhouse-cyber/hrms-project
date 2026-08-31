import { transporter } from "./transporter.js";
import { buildDailySummaryEmailHTML } from "./dailySummaryEmail.js";

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
  const tz = timeZone || "Asia/Kolkata";
  if (!dateInput) return "—";
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  try {
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: tz,
    });
  } catch {
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }
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

  const tz = timeZone || "Asia/Kolkata";
  let checkInMinutes;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
      hourCycle: "h23",
    }).formatToParts(d);
    const h = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
    const m = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
    checkInMinutes = h * 60 + m;
  } catch {
    checkInMinutes = d.getHours() * 60 + d.getMinutes();
  }

  const diffMinutes = checkInMinutes - scheduledMinutes;
  if (diffMinutes <= 0) return null;

  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;

  return `${hours}h ${mins}m`;
}

const hrRoles = ["admin", "hr_manager", "hr_executive", "hr", "owner", "super_admin", "superadmin"];

function isHrAccount(emp) {
  if (!emp) return false;
  const role = (emp.role || "").toLowerCase().trim();
  const designation = (emp.designation || "").toLowerCase().trim();
  const department = (emp.department || "").toLowerCase().trim();

  // Role check
  if (hrRoles.includes(role) || role === "admin" || role === "owner" || role.startsWith("hr")) {
    return true;
  }

  // Department check
  if (department === "hr" || department === "human resources") {
    return true;
  }

  // Specific HR / Admin designation check
  if (
    designation === "hr" ||
    designation.includes("human resources") ||
    designation.includes("hr manager") ||
    designation.includes("hr executive") ||
    designation.includes("hr specialist") ||
    designation.includes("hr director") ||
    designation.includes("hr generalist") ||
    designation.includes("hr officer") ||
    designation === "admin" ||
    designation === "administrator" ||
    designation === "owner"
  ) {
    return true;
  }

  return false;
}

/**
 * Checks if the current local time is past the scheduled end of the workday.
 */
function checkIsPastWorkdayEnd(scheduledEndTimeStr, scheduledStartTimeStr, targetHours, timeZone) {
  try {
    const tz = timeZone || "Asia/Kolkata";
    const now = new Date();
    let currentMins = 0;
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric",
        minute: "numeric",
        hour12: false,
        hourCycle: "h23",
      }).formatToParts(now);
      const h = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
      const m = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
      currentMins = h * 60 + m;
    } catch {
      currentMins = now.getHours() * 60 + now.getMinutes();
    }

    let endMins = parseTimeToMinutes(scheduledEndTimeStr);
    if (endMins === null && scheduledStartTimeStr) {
      const startMins = parseTimeToMinutes(scheduledStartTimeStr);
      if (startMins !== null) {
        endMins = startMins + Math.round((Number(targetHours) || 8.0) * 60);
      }
    }

    if (endMins === null) {
      endMins = 17 * 60 + 30; // Default: 5:30 PM (17:30)
    }

    return currentMins >= endMins;
  } catch {
    return false;
  }
}

/**
 * Evaluates whether all working employees (specifically role: 'employee') have checked out for the day.
 * HR/Admin presence is explicitly excluded so HR accounts never delay or distort employee shift tracking.
 * When all active employee role shifts are concluded, generates and delivers the Daily Summary Report
 * to company HR Managers and Owners in real time with 100% accurate timesheet metrics.
 *
 * @param {string} companyId - UUID of the company
 * @param {object} adminSupabase - Supabase Admin Client instance
 * @param {object} [options={}] - Options (e.g. { force: true } to bypass deduplication on manual trigger)
 * @returns {Promise<{ success?: boolean, sent: boolean, reason?: string, recipients?: string[], metrics?: object }>}
 */
export async function checkAndSendDailySummary(companyId, adminSupabase, options = {}) {
  try {
    const { force = false, targetDate = null, callerEmail = null, targetEmail = null } = options;

    if (!companyId || !adminSupabase) {
      return { sent: false, reason: "invalid_params" };
    }

    const now = new Date();
    // Resolve local date formatted as YYYY-MM-DD in Asia/Kolkata
    const todayStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);

    const reportDateStr = (typeof targetDate === "string" && targetDate.trim())
      ? targetDate.trim()
      : todayStr;
    const isViewingToday = reportDateStr === todayStr;

    const [yr, mo, dy] = reportDateStr.split("-").map(Number);
    const dateObj = new Date(Date.UTC(yr, mo - 1, dy, 0, 0, 0));
    const startDateIso = new Date(dateObj.getTime() - 14 * 3600 * 1000).toISOString();
    const endDateIso = new Date(dateObj.getTime() + 38 * 3600 * 1000).toISOString();

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

    // 3. Strictly track employees with role 'employee'
    // HR, Admin, Manager, and Lead roles are 100% excluded from shift checkout tracking & timesheet metrics
    const isEmployeeRole = (emp) => {
      const r = String(emp?.role || "").toLowerCase().trim();
      return r === "employee" || r === "employees";
    };

    const trackedEmployees = employees.filter(isEmployeeRole);
    if (trackedEmployees.length === 0) {
      return { sent: false, reason: "no_employees", reportDate: reportDateStr };
    }
    const trackedEmpIds = new Set(trackedEmployees.map((e) => e.id));

    // 4. Fetch Company Work Schedule
    let targetHours = 8.0;
    let scheduledStartTime = "09:00";
    let scheduledEndTime = "17:30";
    const { data: schedData } = await adminSupabase
      .from("company_work_schedules")
      .select("daily_working_hours, start_time, end_time")
      .eq("company_id", companyId)
      .maybeSingle();

    if (schedData) {
      if (schedData.daily_working_hours) {
        targetHours = Number(schedData.daily_working_hours) || 8.0;
      }
      if (schedData.start_time) {
        scheduledStartTime = schedData.start_time;
      }
      if (schedData.end_time) {
        scheduledEndTime = schedData.end_time;
      }
    }

    // 5. Fetch Approved Leaves for Target Date
    const { data: approvedLeaves } = await adminSupabase
      .from("leave_requests")
      .select("*")
      .eq("company_id", companyId)
      .eq("status", "APPROVED")
      .lte("start_date", reportDateStr)
      .gte("end_date", reportDateStr);

    const leaveMap = new Map();
    if (approvedLeaves) {
      approvedLeaves.forEach((lv) => {
        leaveMap.set(lv.employee_id, lv);
      });
    }

    // 6. Fetch Target Date Attendance Records
    const { data: targetAttendance, error: attErr } = await adminSupabase
      .from("attendance")
      .select("*")
      .eq("company_id", companyId)
      .gte("check_in", startDateIso)
      .lte("check_in", endDateIso)
      .order("check_in", { ascending: false });

    if (attErr) {
      console.warn("Notice fetching attendance for summary:", attErr.message);
    }

    // Filter attendance records to those belonging to the target date
    const attendanceList = (targetAttendance || []).filter((rec) => {
      if (rec.work_date === reportDateStr) return true;
      if (!rec.check_in) return false;
      const recDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(rec.check_in));
      return recDate === reportDateStr;
    });

    // Map each employee's latest attendance session on target date
    const attendanceMap = new Map();
    attendanceList.forEach((att) => {
      if (!attendanceMap.has(att.employee_id)) {
        attendanceMap.set(att.employee_id, att);
      }
    });

    // Normalize past date unclosed records so historical reports display complete timesheets
    if (!isViewingToday) {
      attendanceMap.forEach((att) => {
        if (att.status === "CHECKED_IN" || att.status === "ON_BREAK" || !att.check_out) {
          const checkInMs = new Date(att.check_in).getTime();
          const autoEndMs = checkInMs + (Number(targetHours) || 8.0) * 3600 * 1000;
          att.check_out = att.check_out || new Date(autoEndMs).toISOString();
          if (!att.working_hours || Number(att.working_hours) <= 0) {
            att.working_hours = Number(targetHours) || 8.0;
          }
          att.status = "COMPLETED";
        }
      });
    }

    // 7. CHECK CONDITIONS FOR SHIFT COMPLETION
    // A. Check if ANY working employees are still actively clocked in (CHECKED_IN or ON_BREAK)
    const activeStaff = [];
    attendanceMap.forEach((att, empId) => {
      if (trackedEmpIds.has(empId) && (att.status === "CHECKED_IN" || att.status === "ON_BREAK")) {
        if (isViewingToday) {
          activeStaff.push(empId);
        }
      }
    });

    if (activeStaff.length > 0) {
      console.log(`⏳ Daily Summary: ${activeStaff.length} working employee(s) still clocked in for company ${companyName}. Waiting for all to check out.`);
      return {
        sent: false,
        reason: "active_shifts_remain",
        activeCount: activeStaff.length,
        reportDate: reportDateStr,
      };
    }

    // B. Collect completed working shifts
    const completedStaff = [];
    let latestCheckOutMs = 0;
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
        if (att.check_out) {
          const ms = new Date(att.check_out).getTime();
          if (ms > latestCheckOutMs) latestCheckOutMs = ms;
        }
      }
    });

    if (completedStaff.length === 0 && !force) {
      console.log(`⏳ Daily Summary: No working employee shifts completed for ${reportDateStr} yet for company ${companyName}.`);
      return { sent: false, reason: "no_shifts_completed_today", reportDate: reportDateStr };
    }

    // C. Check if ALL tracked employee role staff are concluded (either checked out or on approved leave)
    const completedSet = new Set(completedStaff);
    const allTrackedDone = trackedEmployees.length > 0 && trackedEmployees.every(
      (emp) => completedSet.has(emp.id) || leaveMap.has(emp.id)
    );

    // D. Check if past scheduled workday end time (fallback for unexcused absentees)
    const isPastWorkdayEnd = checkIsPastWorkdayEnd(scheduledEndTime, scheduledStartTime, targetHours);
    const shouldSendAuto = allTrackedDone || isPastWorkdayEnd;

    if (!shouldSendAuto && !force) {
      console.log(`⏳ Daily Summary: ${completedStaff.length} of ${trackedEmployees.length} employee role staff checked out for ${companyName}. Waiting for all employee role staff to check out.`);
      return {
        sent: false,
        reason: "waiting_for_all_employees_to_checkout",
        completedCount: completedStaff.length,
        totalCount: trackedEmployees.length,
        reportDate: reportDateStr,
      };
    }

    // 8. DEDUPLICATION & ONE-TIME ENFORCEMENT:
    const { data: alreadySentNotifs } = await adminSupabase
      .from("notifications")
      .select("id, message, created_at")
      .eq("company_id", companyId)
      .or(`title.eq."📊 Daily Attendance Summary Sent - ${reportDateStr}",message.ilike."%${reportDateStr}%"`)
      .order("created_at", { ascending: false })
      .limit(1);

    const alreadySentNotif = alreadySentNotifs && alreadySentNotifs.length > 0 ? alreadySentNotifs[0] : null;

    if (alreadySentNotif) {
      console.log(`ℹ️ Daily Summary for ${companyName} was already sent for ${reportDateStr}. Skipping duplicate.`);
      return { sent: false, reason: "already_sent_today", reportDate: reportDateStr };
    }

    // 9. Aggregate Detailed Metrics & Build Accurate Timesheet
    let totalHoursSum = 0;
    let totalOvertimeHours = 0;
    let totalShortageHours = 0;
    let lateArrivalsCount = 0;
    let earlyDeparturesCount = 0;
    let onLeaveCount = 0;
    let absentCount = 0;
    let presentCount = 0;

    const formatDurationHrsMins = (hoursDecimal) => {
      if (!hoursDecimal || hoursDecimal <= 0) return "0h 0m";
      const totalMins = Math.round(hoursDecimal * 60);
      const h = Math.floor(totalMins / 60);
      const m = totalMins % 60;
      return `${h}h ${m}m`;
    };

    // Strictly report on employee role staff. HR working hours, check-in, or check-out are 100% ignored.
    const reportStaff = trackedEmployees;

    const employeeRecords = reportStaff.map((emp) => {
      const att = attendanceMap.get(emp.id);
      const leave = leaveMap.get(emp.id);

      if (att) {
        presentCount++;
        let hoursNum = Number(att.working_hours) || 0;
        if (hoursNum <= 0 && att.check_in && att.check_out) {
          const diffMs = new Date(att.check_out).getTime() - new Date(att.check_in).getTime();
          const brkSec = Number(att.total_break_seconds) || 0;
          hoursNum = Number((Math.max(0, (diffMs / 1000) - brkSec) / 3600).toFixed(2));
        }
        totalHoursSum += hoursNum;

        // Delayed time calculation (e.g. 0h 45m or 1h 15m)
        const delayedDuration = getDelayDuration(att.check_in, scheduledStartTime);
        const isLate = Boolean(delayedDuration);
        if (isLate) lateArrivalsCount++;

        // Overtime & Shortfall calculations in hours and minutes
        let overtimeHours = null;
        let overtimeFormatted = null;
        let shortageHours = null;
        let shortageFormatted = null;

        if (hoursNum > targetHours + 0.005) {
          overtimeHours = Number((hoursNum - targetHours).toFixed(2));
          overtimeFormatted = formatDurationHrsMins(overtimeHours);
          totalOvertimeHours += overtimeHours;
        } else if (hoursNum < targetHours - 0.005 && att.status !== "ON_BREAK") {
          shortageHours = Number((targetHours - hoursNum).toFixed(2));
          shortageFormatted = formatDurationHrsMins(shortageHours);
          totalShortageHours += shortageHours;
        }

        // Early checkout calculation & reason
        const isEarly =
          Boolean(att.early_checkout) ||
          (shortageHours !== null && shortageHours > 0) ||
          Boolean(att.early_reason);
        if (isEarly) earlyDeparturesCount++;

        // Status badge & category
        let statusBadge = `<span class="badge badge-present">Present</span>`;
        let statusType = "PRESENT";

        if (isEarly && isLate) {
          statusBadge = `<span class="badge badge-warning">Late In &amp; Early Out</span>`;
          statusType = "LATE_AND_EARLY";
        } else if (isEarly) {
          statusBadge = `<span class="badge badge-early">Early Check-Out</span>`;
          statusType = "EARLY_CHECKOUT";
        } else if (isLate) {
          statusBadge = `<span class="badge badge-late">Late Check-In</span>`;
          statusType = "LATE_CHECKIN";
        }

        return {
          fullName: emp.full_name || "Employee",
          department: emp.department || "General",
          designation: emp.designation || "Staff",
          employeeCode: emp.employee_id || emp.id?.slice(0, 8) || "",
          checkIn: formatTime12h(att.check_in),
          checkOut: formatTime12h(att.check_out),
          delayedDuration,
          isLate,
          isEarly,
          earlyReason: att.early_reason || (isEarly && att.check_out ? "Early departure before scheduled target hours" : null),
          workingHours: hoursNum.toFixed(2),
          workingHoursFormatted: formatDurationHrsMins(hoursNum),
          targetHours: targetHours.toFixed(1),
          overtimeHours,
          overtimeFormatted,
          shortageHours,
          shortageFormatted,
          statusBadge,
          statusType,
        };
      }

      if (leave) {
        onLeaveCount++;
        return {
          fullName: emp.full_name || "Employee",
          department: emp.department || "General",
          designation: emp.designation || "Staff",
          employeeCode: emp.employee_id || emp.id?.slice(0, 8) || "",
          checkIn: "—",
          checkOut: "—",
          delayedDuration: null,
          isLate: false,
          isEarly: false,
          earlyReason: null,
          workingHours: "0.00",
          workingHoursFormatted: "0h 0m",
          targetHours: targetHours.toFixed(1),
          overtimeHours: null,
          overtimeFormatted: null,
          shortageHours: Number(targetHours.toFixed(2)),
          shortageFormatted: formatDurationHrsMins(targetHours),
          statusBadge: `<span class="badge badge-leave">On Leave</span>`,
          statusType: "ON_LEAVE",
        };
      }

      absentCount++;
      return {
        fullName: emp.full_name || "Employee",
        department: emp.department || "General",
        designation: emp.designation || "Staff",
        employeeCode: emp.employee_id || emp.id?.slice(0, 8) || "",
        checkIn: "—",
        checkOut: "—",
        delayedDuration: null,
        isLate: false,
        isEarly: false,
        earlyReason: null,
        workingHours: "0.00",
        workingHoursFormatted: "0h 0m",
        targetHours: targetHours.toFixed(1),
        overtimeHours: null,
        overtimeFormatted: null,
        shortageHours: Number(targetHours.toFixed(2)),
        shortageFormatted: formatDurationHrsMins(targetHours),
        statusBadge: `<span class="badge badge-absent">Absent</span>`,
        statusType: "ABSENT",
      };
    });

    const totalHoursWorked = Number(totalHoursSum.toFixed(2));
    const totalOTFormatted = Number(totalOvertimeHours.toFixed(2));
    const totalShortageFormatted = Number(totalShortageHours.toFixed(2));
    const avgHoursPerStaff =
      presentCount > 0 ? Number((totalHoursSum / presentCount).toFixed(2)) : 0;

    const dateStr = dateObj.toLocaleDateString("en-US", {
      timeZone: "UTC",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // 10. Collect Target Recipients: Strictly Company HR Managers, Administrators & Owner ONLY
    const recipientEmails = new Set();

    // Primary summary recipient
    recipientEmails.add("thepibitech@gmail.com");

    // 1. Target email explicitly specified in options
    if (options.targetEmail && typeof options.targetEmail === "string") {
      recipientEmails.add(options.targetEmail.trim().toLowerCase());
    }

    // 2. Configured HR environment email addresses
    if (process.env.EMAIL_USER) {
      recipientEmails.add(process.env.EMAIL_USER.trim().toLowerCase());
    }
    if (process.env.HR_SUMMARY_EMAIL) {
      recipientEmails.add(process.env.HR_SUMMARY_EMAIL.trim().toLowerCase());
    }

    // 3. Company registered HR / Admin email address
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

    // 5. Company HR Managers & Executives ONLY (Regular non-HR staff are strictly EXCLUDED)
    employees.forEach((emp) => {
      if (isHrAccount(emp) && emp.email) {
        recipientEmails.add(emp.email.trim().toLowerCase());
      }
    });

    // 6. Caller HR email if provided (when HR dispatches from dashboard)
    if (options.callerEmail) {
      recipientEmails.add(options.callerEmail.trim().toLowerCase());
    }

    const emailList = Array.from(recipientEmails).filter(Boolean);

    if (emailList.length === 0) {
      console.warn("No recipient email address found for company:", companyName);
      return { sent: false, reason: "no_recipients" };
    }

    console.log(`📋 Dispatching Daily Attendance Summary for ${companyName} (${reportDateStr}) to:`, emailList.join(", "));

    // 11. Build HTML Email
    const emailHTML = buildDailySummaryEmailHTML({
      companyName,
      dateStr,
      totalStaff: reportStaff.length,
      presentCount,
      totalHoursWorked,
      avgHoursPerStaff,
      lateArrivalsCount,
      earlyDeparturesCount,
      totalOvertimeHours: totalOTFormatted,
      totalShortageHours: totalShortageFormatted,
      targetHours,
      scheduledStartTime,
      onLeaveCount,
      absentCount,
      employeeRecords,
    });

    // 12. Send Email to all recipients concurrently in real time
    const senderFrom = process.env.EMAIL_USER
      ? `"${companyName} HRMS" <${process.env.EMAIL_USER}>`
      : `"${companyName} HRMS"`;

    const sendResults = await Promise.allSettled(
      emailList.map((targetEmail) =>
        transporter.sendMail({
          from: senderFrom,
          to: targetEmail,
          subject: `📊 Daily Attendance Summary Report (${dateStr}) - ${companyName}`,
          html: emailHTML,
        })
      )
    );

    const successfulEmails = [];
    const failedEmails = [];

    sendResults.forEach((res, idx) => {
      const email = emailList[idx];
      if (res.status === "fulfilled") {
        successfulEmails.push(email);
        console.log(`⚡ Daily Attendance Summary email successfully sent to: ${email}`);
      } else {
        failedEmails.push({ email, error: res.reason?.message || String(res.reason) });
        console.error(`❌ Failed to send daily summary to ${email}:`, res.reason?.message || res.reason);
      }
    });

    if (successfulEmails.length === 0) {
      const firstError = failedEmails[0]?.error || "SMTP send failed";
      return {
        success: false,
        sent: false,
        reason: "mail_send_failed",
        error: firstError,
        recipients: emailList,
      };
    }

    // 13. Save Notification Record for HR Audit Log with completion count metadata
    try {
      await adminSupabase.from("notifications").insert([
        {
          company_id: companyId,
          title: `📊 Daily Attendance Summary Sent - ${reportDateStr}`,
          message: `Daily attendance summary report for ${dateStr} [${completedStaff.length}/${trackedEmployees.length} completed] has been delivered to HR & Owner (${successfulEmails.join(", ")}).`,
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
      recipients: successfulEmails,
      metrics: {
        totalStaff: reportStaff.length,
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


