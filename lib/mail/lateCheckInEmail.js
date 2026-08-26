/**
 * Email Template: Late Check-In Notice sent to the employee's Gmail
 * when check-in occurs after the scheduled company start time.
 */

export function buildLateCheckInEmailHTML({
  employeeName,
  companyName,
  scheduledTime,
  checkInTime,
  delayDuration,
  dateStr,
}) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Late Check-In Notice</title>
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
          background: linear-gradient(135deg, #f59e0b, #d97706);
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
          background: #fef3c7;
          border: 1px solid #fde68a;
          color: #b45309;
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
        .detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px dashed #e2e8f0;
          font-size: 13px;
        }
        .detail-row:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }
        .detail-row:first-child {
          padding-top: 0;
        }
        .label {
          color: #64748b;
          font-weight: 600;
        }
        .value {
          color: #0f172a;
          font-weight: 700;
        }
        .value-danger {
          color: #dc2626;
          font-weight: 800;
        }
        .value-highlight {
          color: #d97706;
          font-weight: 800;
        }
        .notice-box {
          background: #fffbeb;
          border-left: 4px solid #f59e0b;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 12px;
          color: #92400e;
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
          <div style="font-size: 40px;">⏰</div>
          <h1>Late Attendance Check-In Notice</h1>
        </div>

        <!-- Content -->
        <div class="content">
          <div class="badge">Late Arrival Recorded</div>
          <div class="greeting">Hello ${employeeName},</div>
          <p class="message">
            This is an automated notification from <strong>${companyName} HRMS</strong> to inform you that your attendance check-in for today was recorded after the company's scheduled start time.
          </p>

          <!-- Attendance Details Table -->
          <div class="details-card">
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px;">
              <tr style="border-bottom: 1px dashed #e2e8f0;">
                <td style="padding: 8px 0; color: #64748b; font-weight: 600;">📅 Date:</td>
                <td style="padding: 8px 0; text-align: right; color: #0f172a; font-weight: 700;">${dateStr}</td>
              </tr>
              <tr style="border-bottom: 1px dashed #e2e8f0;">
                <td style="padding: 8px 0; color: #64748b; font-weight: 600;">🕒 Scheduled Start Time:</td>
                <td style="padding: 8px 0; text-align: right; color: #2563eb; font-weight: 700;">${scheduledTime}</td>
              </tr>
              <tr style="border-bottom: 1px dashed #e2e8f0;">
                <td style="padding: 8px 0; color: #64748b; font-weight: 600;">⏱️ Actual Check-In Time:</td>
                <td style="padding: 8px 0; text-align: right; color: #dc2626; font-weight: 800;">${checkInTime}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #64748b; font-weight: 600;">⏳ Delayed Duration:</td>
                <td style="padding: 8px 0; text-align: right; color: #d97706; font-weight: 800; font-size: 14px;">${delayDuration}</td>
              </tr>
            </table>
          </div>

          <!-- Policy Notice -->
          <div class="notice-box">
            <strong>📌 Note:</strong> Please ensure timely check-ins to meet daily required working hours and maintain accurate attendance records. If this was due to prior approval or technical difficulty, please inform your HR manager.
          </div>

          <p style="font-size: 12px; color: #64748b; margin: 0;">
            You can view your full attendance log and working hours on your <strong>Employee Dashboard</strong>.
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
