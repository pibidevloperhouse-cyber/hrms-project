/**
 * Email Template: Early Check-Out Notice sent to the employee's Gmail
 * when checking out before completing the company's daily required working hours.
 */

export function buildEarlyCheckOutEmailHTML({
  employeeName,
  companyName,
  checkInTime,
  checkOutTime,
  workingHours,
  targetHours,
  timeGapDuration,
  breakDuration,
  reason,
  dateStr,
}) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Early Check-Out Notice</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          background-color: #f8fafc;
          color: #1e293b;
          margin: 0;
          padding: 24px;
        }
        .container {
          max-width: 580px;
          margin: 0 auto;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
        }
        .header {
          background: linear-gradient(135deg, #e11d48, #be123c);
          padding: 32px 28px;
          text-align: center;
          color: #ffffff;
        }
        .header h1 {
          margin: 10px 0 0;
          font-size: 22px;
          font-weight: 800;
          letter-spacing: -0.5px;
        }
        .content {
          padding: 28px;
        }
        .badge {
          display: inline-block;
          background: #ffe4e6;
          border: 1px solid #fecdd3;
          color: #be123c;
          font-size: 11px;
          font-weight: 800;
          padding: 4px 12px;
          border-radius: 9999px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 16px;
        }
        .greeting {
          font-size: 16px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 10px;
        }
        .message {
          font-size: 14px;
          line-height: 1.6;
          color: #475569;
          margin: 0 0 20px;
        }
        .details-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 20px;
          margin-bottom: 24px;
        }
        .reason-card {
          background: #fdf2f8;
          border-left: 4px solid #f43f5e;
          border-radius: 8px;
          padding: 12px 16px;
          margin-bottom: 20px;
          font-size: 13px;
          color: #881337;
        }
        .notice-box {
          background: #fff1f2;
          border-left: 4px solid #e11d48;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 12px;
          color: #9f1239;
          line-height: 1.5;
          margin-bottom: 20px;
        }
        .footer {
          text-align: center;
          padding: 20px;
          background: #f8fafc;
          border-top: 1px solid #e2e8f0;
          color: #94a3b8;
          font-size: 11px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <!-- Header -->
        <div class="header">
          <div style="font-size: 40px;">🚪</div>
          <h1>Early Check-Out Notice</h1>
        </div>

        <!-- Content -->
        <div class="content">
          <div class="badge">Early Departure Recorded</div>
          <div class="greeting">Hello ${employeeName},</div>
          <p class="message">
            This is an automated notification from <strong>${companyName} HRMS</strong> to confirm that your attendance check-out was recorded before completing the daily required working hours.
          </p>

          <!-- Attendance Details Table -->
          <div class="details-card">
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px;">
              <tr style="border-bottom: 1px dashed #e2e8f0;">
                <td style="padding: 8px 0; color: #64748b; font-weight: 600;">📅 Date:</td>
                <td style="padding: 8px 0; text-align: right; color: #0f172a; font-weight: 700;">${dateStr}</td>
              </tr>
              <tr style="border-bottom: 1px dashed #e2e8f0;">
                <td style="padding: 8px 0; color: #64748b; font-weight: 600;">🕒 Check-In Time:</td>
                <td style="padding: 8px 0; text-align: right; color: #0284c7; font-weight: 700;">${checkInTime}</td>
              </tr>
              <tr style="border-bottom: 1px dashed #e2e8f0;">
                <td style="padding: 8px 0; color: #64748b; font-weight: 600;">⏱️ Check-Out Time:</td>
                <td style="padding: 8px 0; text-align: right; color: #e11d48; font-weight: 800;">${checkOutTime}</td>
              </tr>
              <tr style="border-bottom: 1px dashed #e2e8f0;">
                <td style="padding: 8px 0; color: #64748b; font-weight: 600;">⏱️ Net Working Time:</td>
                <td style="padding: 8px 0; text-align: right; color: #0f172a; font-weight: 700;">${workingHours} hrs</td>
              </tr>
              <tr style="border-bottom: 1px dashed #e2e8f0;">
                <td style="padding: 8px 0; color: #64748b; font-weight: 600;">🎯 Daily Required Hours:</td>
                <td style="padding: 8px 0; text-align: right; color: #2563eb; font-weight: 700;">${targetHours} hrs</td>
              </tr>
              ${breakDuration ? `
              <tr style="border-bottom: 1px dashed #e2e8f0;">
                <td style="padding: 8px 0; color: #64748b; font-weight: 600;">☕ Total Break Time:</td>
                <td style="padding: 8px 0; text-align: right; color: #64748b; font-weight: 600;">${breakDuration}</td>
              </tr>` : ""}
              <tr>
                <td style="padding: 8px 0; color: #64748b; font-weight: 600;">⏳ Time Gap / Shortfall:</td>
                <td style="padding: 8px 0; text-align: right; color: #e11d48; font-weight: 800; font-size: 14px;">${timeGapDuration}</td>
              </tr>
            </table>
          </div>

          ${reason ? `
          <!-- Reason Box -->
          <div class="reason-card">
            <strong>📝 Reason Provided:</strong>
            <div style="margin-top: 4px; font-style: italic;">&ldquo;${reason}&rdquo;</div>
          </div>` : ""}

          <!-- Policy Notice -->
          <div class="notice-box">
            <strong>📌 Status:</strong> Your early check-out record and reason have been submitted for HR review. If you have questions regarding your working hours or approvals, please reach out to your HR department.
          </div>

          <p style="font-size: 12px; color: #64748b; margin: 0;">
            You can view your full attendance log on your <strong>Employee Dashboard</strong>.
          </p>
        </div>

        <!-- Footer -->
        <div class="footer">
          Sent automatically by ${companyName} HRMS Attendance System
        </div>
      </div>
    </body>
    </html>
  `;
}
