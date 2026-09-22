/**
 * Executive, professional corporate email templates for Employee & HR Invitation workflow.
 * Styled to strictly match the clean, modern corporate standard of earlyCheckOutEmail.js.
 */

/**
 * Invitation Email sent to candidate with "Accept Invitation & Set Password" action button.
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

  const safeCompanyName = companyName || "Company";
  const safeEmployeeName = employeeName || "Team Member";
  const safeDepartment = department || "General";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation to Join ${safeCompanyName}</title>
</head>
<body style="margin: 0; padding: 32px 16px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; padding: 32px 28px; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
    
    <!-- Top Brand & Header (Aligned to earlyCheckOutEmail design) -->
    <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #0f172a;">
      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin-bottom: 4px;">
        ${safeCompanyName} &bull; Human Resources &bull; Workspace Invitation
      </div>
      <h1 style="margin: 0; font-size: 19px; font-weight: 700; color: #0f172a; letter-spacing: -0.3px;">
        Official Team Invitation
      </h1>
    </div>

    <!-- Salutation & Context -->
    <p style="margin: 0 0 14px 0; font-size: 14px; color: #0f172a;">
      Dear <strong>${safeEmployeeName}</strong>,
    </p>

    <p style="margin: 0 0 20px 0; font-size: 13px; color: #475569; line-height: 1.6;">
      You have been officially invited to join <strong>${safeCompanyName}</strong> on our Human Resource Management System (HRMS).
    </p>

    <!-- Structured Key-Value Detail List -->
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 24px 0; font-size: 13px; border-collapse: collapse;">
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 9px 0; width: 44%; color: #64748b; font-weight: 600;">Invited Member:</td>
        <td style="padding: 9px 0; color: #0f172a; font-weight: 600;">${safeEmployeeName}</td>
      </tr>
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Organization:</td>
        <td style="padding: 9px 0; color: #0f172a; font-weight: 600;">${safeCompanyName}</td>
      </tr>
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Assigned Role:</td>
        <td style="padding: 9px 0; color: #0f172a; font-weight: 600;">${displayRole}</td>
      </tr>
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Department:</td>
        <td style="padding: 9px 0; color: #0f172a;">${safeDepartment}</td>
      </tr>
      ${designation ? `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Designation:</td>
        <td style="padding: 9px 0; color: #0f172a;">${designation}</td>
      </tr>` : ""}
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Invitation Status:</td>
        <td style="padding: 9px 0;">
          <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; background-color: #ecfdf5; color: #065f46; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
            Pending Activation
          </span>
        </td>
      </tr>
      <tr>
        <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Link Validity:</td>
        <td style="padding: 9px 0; color: #0f172a;">7 Days from Issuance</td>
      </tr>
    </table>

    <p style="margin: 0 0 16px 0; font-size: 13px; color: #475569; line-height: 1.5;">
      To accept this invitation and establish your secure account password, please click the button below:
    </p>

    <!-- Primary Action Button -->
    <div style="margin: 0 0 24px 0; text-align: left;">
      <a href="${acceptUrl}" style="display: inline-block; padding: 12px 28px; background-color: #0f172a; color: #ffffff; font-size: 13px; font-weight: 600; text-decoration: none; border-radius: 6px; letter-spacing: 0.2px;">
        Accept Invitation &amp; Set Password &rarr;
      </a>
    </div>

    <!-- Security Advisory Note -->
    <p style="margin: 0 0 24px 0; font-size: 12px; color: #64748b; line-height: 1.6;">
      This invitation link is unique to your profile and will expire in 7 days. If you did not expect this communication, please contact your HR department or discard this email.
    </p>

    <!-- Sign-off (Matching earlyCheckOutEmail pattern) -->
    <div style="padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #475569;">
      Regards,<br>
      <strong style="color: #0f172a;">${safeCompanyName} HR Operations</strong><br>
      <span style="color: #94a3b8; font-size: 11px;">Human Resource Management System</span>
    </div>

  </div>
</body>
</html>`;
}

/**
 * Helper for Accepted Confirmation Email.
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
  const safeCompanyName = companyName || "Company";
  const safeEmployeeName = employeeName || "Team Member";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Activated - ${safeCompanyName}</title>
</head>
<body style="margin: 0; padding: 32px 16px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; padding: 32px 28px; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
    
    <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #0f172a;">
      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin-bottom: 4px;">
        ${safeCompanyName} &bull; Human Resources &bull; Account Status
      </div>
      <h1 style="margin: 0; font-size: 19px; font-weight: 700; color: #0f172a; letter-spacing: -0.3px;">
        Welcome to ${safeCompanyName}
      </h1>
    </div>

    <p style="margin: 0 0 14px 0; font-size: 14px; color: #0f172a;">
      Dear <strong>${safeEmployeeName}</strong>,
    </p>

    <p style="margin: 0 0 20px 0; font-size: 13px; color: #475569; line-height: 1.6;">
      Your employee account has been successfully activated. You can now log in to access your dashboard and workforce tools.
    </p>

    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 24px 0; font-size: 13px; border-collapse: collapse;">
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 9px 0; width: 44%; color: #64748b; font-weight: 600;">Username:</td>
        <td style="padding: 9px 0; color: #0f172a; font-weight: 600;">${username || "—"}</td>
      </tr>
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Email:</td>
        <td style="padding: 9px 0; color: #0f172a;">${email || "—"}</td>
      </tr>
      <tr>
        <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Account Status:</td>
        <td style="padding: 9px 0;">
          <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; background-color: #ecfdf5; color: #065f46; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
            Active
          </span>
        </td>
      </tr>
    </table>

    <div style="margin: 0 0 24px 0; text-align: left;">
      <a href="${loginUrl}" style="display: inline-block; padding: 12px 28px; background-color: #0f172a; color: #ffffff; font-size: 13px; font-weight: 600; text-decoration: none; border-radius: 6px; letter-spacing: 0.2px;">
        Sign In to Portal &rarr;
      </a>
    </div>

    <div style="padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #475569;">
      Regards,<br>
      <strong style="color: #0f172a;">${safeCompanyName} HR Operations</strong><br>
    </div>

  </div>
</body>
</html>`;
}

/**
 * Helper for Declined Confirmation Email.
 */
export function buildOfferDeclinedEmailHTML({ companyName, employeeName }) {
  const safeCompanyName = companyName || "Company";
  const safeEmployeeName = employeeName || "Candidate";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation Response Recorded</title>
</head>
<body style="margin: 0; padding: 32px 16px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; padding: 32px 28px; border-radius: 8px; border: 1px solid #e2e8f0;">
    
    <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #0f172a;">
      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin-bottom: 4px;">
        ${safeCompanyName} &bull; Human Resources
      </div>
      <h1 style="margin: 0; font-size: 19px; font-weight: 700; color: #0f172a; letter-spacing: -0.3px;">
        Response Recorded
      </h1>
    </div>

    <p style="margin: 0 0 14px 0; font-size: 14px; color: #0f172a;">
      Dear <strong>${safeEmployeeName}</strong>,
    </p>

    <p style="margin: 0 0 20px 0; font-size: 13px; color: #475569; line-height: 1.6;">
      Your decision regarding the invitation from <strong>${safeCompanyName}</strong> has been logged in our records.
    </p>

    <div style="padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #475569;">
      Regards,<br>
      <strong style="color: #0f172a;">${safeCompanyName} HR Operations</strong><br>
    </div>

  </div>
</body>
</html>`;
}
