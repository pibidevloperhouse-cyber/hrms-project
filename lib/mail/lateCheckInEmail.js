/**
 * Executive, professional corporate email template for Late Check-In notification.
 * Customised to match the exact clean design pattern of the early check-out template.
 */

export function buildLateCheckInEmailHTML({
  employeeName,
  employeeId,
  companyName,
  scheduledTime,
  checkInTime,
  delayDuration,
  dateStr,
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Late Check-In Notice</title>
</head>
<body style="margin: 0; padding: 32px 16px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; padding: 32px 28px; border-radius: 8px; border: 1px solid #e2e8f0;">
    
    <!-- Top Brand & Header -->
    <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #0f172a;">
      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin-bottom: 4px;">
        ${companyName || "Company"} &bull; Human Resources
      </div>
      <h1 style="margin: 0; font-size: 19px; font-weight: 700; color: #0f172a; letter-spacing: -0.3px;">
        Late Check-In Notification
      </h1>
    </div>

    <!-- Salutation -->
    <p style="margin: 0 0 14px 0; font-size: 14px; color: #0f172a;">
      Dear <strong>${employeeName || "Employee"}</strong>,
    </p>

    <p style="margin: 0 0 20px 0; font-size: 13px; color: #475569; line-height: 1.6;">
      This email is to confirm that a late check-in was recorded for your shift${dateStr ? ` on <strong>${dateStr}</strong>` : ""}
    </p>

    <!-- Structured Key-Value Detail List -->
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 24px 0; font-size: 13px; border-collapse: collapse;">
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 9px 0; width: 44%; color: #64748b; font-weight: 600;">Employee Name:</td>
        <td style="padding: 9px 0; color: #0f172a; font-weight: 600;">${employeeName || "—"}</td>
      </tr>
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Employee ID:</td>
        <td style="padding: 9px 0; color: #0f172a; font-mono font-size: 12px;">${employeeId || "—"}</td>
      </tr>
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Scheduled Start Time:</td>
        <td style="padding: 9px 0; color: #0f172a;">${scheduledTime || "—"}</td>
      </tr>
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Actual Check-In Time:</td>
        <td style="padding: 9px 0; color: #0f172a; font-weight: 600;">${checkInTime || "—"}</td>
      </tr>
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Late Arrival Duration:</td>
        <td style="padding: 9px 0; color: #0f172a; font-weight: 600;">${delayDuration || "—"}</td>
      </tr>
      <tr>
        <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Date:</td>
        <td style="padding: 9px 0; color: #0f172a;">${dateStr || "—"}</td>
      </tr>
    </table>

    <p style="margin: 0 0 24px 0; font-size: 13px; color: #475569; line-height: 1.5;">
      Your check-in record has been logged in the system.
    </p>

    <!-- Sign-off -->
    <div style="padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #475569;">
      Regards,<br>
      <strong style="color: #0f172a;">${companyName || "Company"} HR Operations</strong><br>
    </div>

  </div>
</body>
</html>`;
}
