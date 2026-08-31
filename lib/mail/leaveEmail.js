/**
 * Email Template: Leave Request Notice sent to HR / Company Owner when a request is submitted.
 */
export function buildLeaveRequestNoticeHTML({
  companyName,
  employeeName,
  employeeEmail,
  department,
  role,
  leaveType,
  leaveDate,
  reason,
  isHRApplicant = false,
}) {
  const formattedType = leaveType ? leaveType.toUpperCase() : "CASUAL";
  const badgeTitle = isHRApplicant ? "👔 HR Leave Request (Owner Approval Required)" : "📅 Employee Leave Request";
  const recipientRole = isHRApplicant ? "Company Owner" : "HR Department / Management";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
        .card { max-width: 580px; margin: 0 auto; background: #1e293b; border: 1px solid #334155; border-radius: 20px; padding: 32px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
        .badge { display: inline-block; background: ${isHRApplicant ? "#a855f71a" : "#3b82f61a"}; border: 1px solid ${isHRApplicant ? "#a855f740" : "#3b82f640"}; color: ${isHRApplicant ? "#c084fc" : "#60a5fa"}; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase; margin-bottom: 16px; }
        h2 { margin: 0 0 12px; color: #ffffff; font-size: 22px; font-weight: 800; }
        p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 20px; }
        .details-box { background: #0f172a; border: 1px solid #334155; border-radius: 14px; padding: 20px; margin-bottom: 24px; font-size: 13px; }
        .label { color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; }
        .value { color: #f1f5f9; font-weight: 600; text-align: right; }
        .reason-box { background: #182234; border-left: 4px solid #38bdf8; padding: 12px 16px; border-radius: 8px; color: #cbd5e1; font-style: italic; margin-top: 12px; }
        .footer { text-align: center; color: #64748b; font-size: 11px; margin-top: 32px; border-top: 1px solid #334155; padding-top: 16px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="badge">${badgeTitle}</div>
        <h2>Leave Request from ${employeeName}</h2>
        <p>A leave request has been submitted in <strong>${companyName}</strong> awaiting <strong>${recipientRole}</strong> review in the HRMS Portal.</p>

        <div class="details-box">
          <div style="margin-bottom: 12px;">
            <span class="label">Applicant Name:</span>
            <div class="value" style="text-align: left; font-size: 15px; color: #38bdf8;">${employeeName} (${employeeEmail})</div>
          </div>
          <div style="margin-bottom: 12px;">
            <span class="label">Role &amp; Department:</span>
            <div class="value" style="text-align: left;">${role ? role.replace(/_/g, " ").toUpperCase() : "STAFF"} · ${department || "General"}</div>
          </div>
          <div style="margin-bottom: 12px;">
            <span class="label">Approval Authority:</span>
            <div class="value" style="text-align: left; color: ${isHRApplicant ? "#c084fc" : "#38bdf8"}; font-weight: 700;">
              ${isHRApplicant ? "👑 Company Owner Direct Approval Required" : "👔 HR Department Approval"}
            </div>
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
          Sent by ${companyName} HRMS • Realtime Approval Notification System
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Email Template: Leave Decision Notice sent to Employee / HR when action is taken.
 */
export function buildLeaveDecisionNoticeHTML({
  companyName,
  employeeName,
  leaveType,
  leaveDate,
  status,
  reviewerComment,
  reviewerRole = "HR Department",
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
        .footer { text-align: center; color: #64748b; font-size: 11px; margin-top: 32px; border-top: 1px solid #334155; padding-top: 16px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="badge">${statusTitle}</div>
        <h2>Hello, ${employeeName}</h2>
        <p>Your leave request submitted for <strong>${companyName}</strong> has been reviewed and actioned by <strong>${reviewerRole}</strong>.</p>

        <div class="details-box">
          <div style="margin-bottom: 12px;">
            <span class="label">Leave Status:</span>
            <div class="value" style="color: ${statusColor}; font-size: 16px; font-weight: 800; text-transform: uppercase;">
              ${status}
            </div>
          </div>
          <div style="margin-bottom: 12px;">
            <span class="label">Decision Authority:</span>
            <div class="value" style="color: #38bdf8; font-size: 13px;">${reviewerRole}</div>
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
            <span class="label">Reviewer Note / Feedback:</span>
            <div class="comment-box">"${reviewerComment}"</div>
          </div>
          `
              : ""
          }
        </div>

        <p>You can check real-time details anytime on your <strong>Employee Workspace Dashboard</strong>.</p>

        <div class="footer">
          Sent by ${companyName} HRMS • Automated Notification System
        </div>
      </div>
    </body>
    </html>
  `;
}
