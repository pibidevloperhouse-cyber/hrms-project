/**
 * Email Template: Single-day Leave Request Notice sent to HR / Admin when an employee submits a request.
 */
export function buildLeaveRequestNoticeHTML({
  companyName,
  employeeName,
  employeeEmail,
  department,
  leaveType,
  leaveDate,
  reason,
}) {
  const formattedType = leaveType ? leaveType.toUpperCase() : "CASUAL";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
        .card { max-width: 580px; margin: 0 auto; background: #1e293b; border: 1px solid #334155; border-radius: 20px; padding: 32px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
        .badge { display: inline-block; background: #3b82f61a; border: 1px solid #3b82f640; color: #60a5fa; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase; margin-bottom: 16px; }
        h2 { margin: 0 0 12px; color: #ffffff; font-size: 22px; font-weight: 800; }
        p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 20px; }
        .details-box { background: #0f172a; border: 1px solid #334155; border-radius: 14px; padding: 20px; margin-bottom: 24px; font-size: 13px; }
        .label { color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; }
        .value { color: #f1f5f9; font-weight: 600; text-align: right; }
        .reason-box { background: #182234; border-left: 4px solid #38bdf8; padding: 12px 16px; border-radius: 8px; color: #cbd5e1; font-style: italic; margin-top: 12px; }
        .footer { text-align: center; color: #64748b; font-size: 11px; margin-top: 32px; border-t: 1px solid #334155; padding-top: 16px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="badge">📅 1-Day Leave Request</div>
        <h2>Leave Request from ${employeeName}</h2>
        <p>An employee in <strong>${companyName}</strong> has submitted a single-day leave request awaiting your review in the HRMS Portal.</p>

        <div class="details-box">
          <div style="margin-bottom: 12px;">
            <span class="label">Employee Name:</span>
            <div class="value" style="text-align: left; font-size: 15px; color: #38bdf8;">${employeeName} (${employeeEmail})</div>
          </div>
          <div style="margin-bottom: 12px;">
            <span class="label">Department:</span>
            <div class="value" style="text-align: left;">${department || "General"}</div>
          </div>
          <div style="margin-bottom: 12px;">
            <span class="label">Leave Category:</span>
            <div class="value" style="text-align: left; color: #fbbf24;">${formattedType} LEAVE</div>
          </div>
          <div style="margin-bottom: 12px;">
            <span class="label">Requested Leave Date:</span>
            <div class="value" style="text-align: left; color: #34d399; font-size: 15px;">${leaveDate}</div>
          </div>
          <div>
            <span class="label">Reason provided:</span>
            <div class="reason-box">"${reason}"</div>
          </div>
        </div>

        <p>Log in to your <strong>HRMS Dashboard</strong> to Approve or Reject this request.</p>

        <div class="footer">
          Sent by ${companyName} HRMS • Realtime Notification System
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Email Template: Single-day Leave Decision Notice sent to Employee when HR approves or rejects request.
 */
export function buildLeaveDecisionNoticeHTML({
  companyName,
  employeeName,
  leaveType,
  leaveDate,
  status,
  reviewerComment,
}) {
  const isApproved = status === "approved";
  const statusColor = isApproved ? "#34d399" : "#f87171";
  const statusBadgeBg = isApproved ? "#0596691a" : "#dc26261a";
  const statusTitle = isApproved ? "✅ LEAVE REQUEST APPROVED" : "❌ LEAVE REQUEST REJECTED";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
        .card { max-width: 580px; margin: 0 auto; background: #1e293b; border: 1px solid #334155; border-radius: 20px; padding: 32px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
        .badge { display: inline-block; background: ${statusBadgeBg}; border: 1px solid ${statusColor}40; color: ${statusColor}; font-size: 12px; font-weight: 800; padding: 6px 14px; border-radius: 9999px; text-transform: uppercase; margin-bottom: 16px; }
        h2 { margin: 0 0 12px; color: #ffffff; font-size: 22px; font-weight: 800; }
        p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 20px; }
        .details-box { background: #0f172a; border: 1px solid #334155; border-radius: 14px; padding: 20px; margin-bottom: 24px; font-size: 13px; }
        .label { color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; }
        .value { color: #f1f5f9; font-weight: 600; text-align: left; margin-top: 4px; }
        .comment-box { background: #182234; border-left: 4px solid ${statusColor}; padding: 12px 16px; border-radius: 8px; color: #cbd5e1; font-style: italic; margin-top: 12px; }
        .footer { text-align: center; color: #64748b; font-size: 11px; margin-top: 32px; border-t: 1px solid #334155; padding-top: 16px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="badge">${statusTitle}</div>
        <h2>Hello, ${employeeName}</h2>
        <p>Your single-day leave request submitted for <strong>${companyName}</strong> has been reviewed by HR.</p>

        <div class="details-box">
          <div style="margin-bottom: 12px;">
            <span class="label">Leave Status:</span>
            <div class="value" style="color: ${statusColor}; font-size: 16px; font-weight: 800; text-transform: uppercase;">
              ${status}
            </div>
          </div>
          <div style="margin-bottom: 12px;">
            <span class="label">Leave Type:</span>
            <div class="value">${leaveType ? leaveType.toUpperCase() : "CASUAL"} LEAVE</div>
          </div>
          <div style="margin-bottom: 12px;">
            <span class="label">Leave Date:</span>
            <div class="value" style="color: #38bdf8; font-size: 15px;">${leaveDate}</div>
          </div>
          ${
            reviewerComment
              ? `
          <div>
            <span class="label">HR Manager Remark:</span>
            <div class="comment-box">"${reviewerComment}"</div>
          </div>
          `
              : ""
          }
        </div>

        <p>You can check real-time details anytime on your <strong>Employee Workspace Dashboard</strong>.</p>

        <div class="footer">
          Sent by ${companyName} HRMS • Automated System
        </div>
      </div>
    </body>
    </html>
  `;
}
