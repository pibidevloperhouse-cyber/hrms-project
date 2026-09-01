/**
 * Executive, professional corporate email template for Early Check-Out notification.
 * Clean, modern typography with aligned key-value pairs.
 */

export function buildEarlyCheckOutEmailHTML({
  employeeName,
  employeeId,
  companyName,
  checkInTime,
  requestCheckOutTime,
  regularCheckOutTime,
  earlyCheckOutDuration,
  reason,
  dateStr,
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Early Check-Out Notice</title>
</head>
<body style="margin: 0; padding: 32px 16px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; padding: 32px 28px; border-radius: 8px; border: 1px solid #e2e8f0;">
    
    <!-- Top Brand & Header -->
    <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #0f172a;">
      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin-bottom: 4px;">
        ${companyName || "Company"} &bull; Human Resources
      </div>
      <h1 style="margin: 0; font-size: 19px; font-weight: 700; color: #0f172a; letter-spacing: -0.3px;">
        Early Check-Out Notification
      </h1>
    </div>

    <!-- Salutation -->
    <p style="margin: 0 0 14px 0; font-size: 14px; color: #0f172a;">
      Dear <strong>${employeeName || "Employee"}</strong>,
    </p>

    <p style="margin: 0 0 20px 0; font-size: 13px; color: #475569; line-height: 1.6;">
      This email is to confirm that an early check-out was recorded for your shift${dateStr ? ` on <strong>${dateStr}</strong>` : ""}
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
        <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Check-In Time:</td>
        <td style="padding: 9px 0; color: #0f172a;">${checkInTime || "—"}</td>
      </tr>
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Request Check-Out Time:</td>
        <td style="padding: 9px 0; color: #0f172a; font-weight: 600;">${requestCheckOutTime || "—"}</td>
      </tr>
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Regular Check-Out Time:</td>
        <td style="padding: 9px 0; color: #0f172a;">${regularCheckOutTime || "—"}</td>
      </tr>
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Early Check-Out Duration:</td>
        <td style="padding: 9px 0; color: #0f172a; font-weight: 600;">${earlyCheckOutDuration || "—"}</td>
      </tr>
      <tr>
        <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Reason:</td>
        <td style="padding: 9px 0; color: #0f172a;">${reason || "Not specified"}</td>
      </tr>
    </table>

    <p style="margin: 0 0 24px 0; font-size: 13px; color: #475569; line-height: 1.5;">
      Your departure record and reason have been logged and submitted for HR review.
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
