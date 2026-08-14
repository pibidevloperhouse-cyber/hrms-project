/**
 * Email templates for Employee & HR Invitation workflow.
 */

/**
 * Invitation Email sent to candidate with single "Accept Invitation & Set Password" action button.
 */
export function buildOfferEmailHTML({
  companyName,
  employeeName,
  role,
  department,
  designation,
  acceptUrl,
}) {
  const displayRole = role
    ? role
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    : "Team Member";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invitation to Join ${companyName}</title>
</head>
<body style="margin:0; padding:0; background-color:#0f172a; font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a; padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="580" cellpadding="0" cellspacing="0" style="background-color:#1e293b; border-radius:24px; overflow:hidden; border:1px solid #334155; box-shadow:0 20px 40px rgba(0,0,0,0.4);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #0284c7 0%, #3b82f6 50%, #6366f1 100%); padding:44px 40px; text-align:center;">
              <div style="display:inline-block; width:64px; height:64px; background-color:rgba(255,255,255,0.15); border-radius:20px; line-height:64px; font-size:32px; margin-bottom:14px; backdrop-filter:blur(10px);">
                👑
              </div>
              <h1 style="margin:0; color:#ffffff; font-size:24px; font-weight:800; letter-spacing:-0.5px;">
                Official Team Invitation
              </h1>
              <p style="margin:8px 0 0; color:rgba(255,255,255,0.9); font-size:14px; font-weight:500;">
                ${companyName} invites you to set up your account
              </p>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 16px; color:#f8fafc; font-size:16px; line-height:1.6; font-weight:700;">
                Dear ${employeeName},
              </p>
              <p style="margin:0 0 24px; color:#94a3b8; font-size:14px; line-height:1.7;">
                The Company Owner at <strong style="color:#38bdf8;">${companyName}</strong> has invited you to join their official HRMS workspace. Below are your assigned details:
              </p>

              <!-- Offer Details Box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px; background-color:#0f172a; border-radius:16px; border:1px solid #334155;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50%" style="padding:6px 0;">
                          <span style="color:#64748b; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; font-weight:700;">Assigned Role</span><br/>
                          <span style="color:#38bdf8; font-size:15px; font-weight:700;">${displayRole}</span>
                        </td>
                        <td width="50%" style="padding:6px 0;">
                          <span style="color:#64748b; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; font-weight:700;">Department</span><br/>
                          <span style="color:#f8fafc; font-size:15px; font-weight:700;">${department || "General"}</span>
                        </td>
                      </tr>
                      ${designation ? `
                      <tr>
                        <td colspan="2" style="padding:12px 0 0; border-top:1px dashed #334155; margin-top:8px;">
                          <span style="color:#64748b; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; font-weight:700;">Designation</span><br/>
                          <span style="color:#f8fafc; font-size:15px; font-weight:700;">${designation}</span>
                        </td>
                      </tr>` : ""}
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 28px; color:#94a3b8; font-size:14px; line-height:1.6; text-align:center;">
                Please click the button below to accept your invitation and create your account password:
              </p>

              <!-- Acceptance Action Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="${acceptUrl}" 
                       style="display:inline-block; padding:16px 40px; background:linear-gradient(135deg,#0284c7,#2563eb); color:#ffffff; font-size:15px; font-weight:800; text-decoration:none; border-radius:14px; box-shadow:0 8px 20px rgba(2,132,199,0.35);">
                      🚀 Accept Invitation & Set Password →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0; color:#64748b; font-size:12px; line-height:1.5; text-align:center;">
                Upon setting your password, your employee profile will be activated and you will be directed to login.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px; background-color:#0f172a; border-top:1px solid #334155; text-align:center;">
              <p style="margin:0; color:#64748b; font-size:11px;">
                Sent by ${companyName} HRMS Notification System.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Legacy Helper for Accepted Email (Retained for backwards compatibility)
 */
export function buildOfferAcceptedEmailHTML({
  companyName,
  employeeName,
  role,
  username,
  password,
  email,
  loginUrl,
}) {
  return `
  <div style="font-family:sans-serif; padding:20px;">
    <h2>Welcome to ${companyName}!</h2>
    <p>Hi ${employeeName}, your account is active.</p>
    <p>Username: <strong>${username}</strong></p>
    <p>Email: <strong>${email}</strong></p>
    <a href="${loginUrl}">Log In Now</a>
  </div>
  `;
}

/**
 * Legacy Helper for Declined Email (Retained for backwards compatibility)
 */
export function buildOfferDeclinedEmailHTML({ companyName, employeeName }) {
  return `
  <div style="font-family:sans-serif; padding:20px;">
    <h2>Response Recorded</h2>
    <p>Dear ${employeeName}, your decision to decline the offer from ${companyName} has been recorded.</p>
  </div>
  `;
}
