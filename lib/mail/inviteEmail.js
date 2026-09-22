/**
 * Executive, professional corporate email template for Employee Login Credentials.
 * Styled to strictly match the clean, modern corporate standard of earlyCheckOutEmail.js.
 *
 * @param {Object} params
 * @param {string} params.companyName - Name of the company
 * @param {string} params.employeeName - Full name of the invited employee
 * @param {string} params.role - Assigned role (e.g. "HR Manager", "Employee")
 * @param {string} params.department - Department name
 * @param {string} params.designation - Job title / designation
 * @param {string} params.username - Auto-generated username
 * @param {string} params.password - Auto-generated temporary password
 * @param {string} params.email - Employee email address
 * @param {string} params.loginUrl - URL to the login page
 * @returns {string} HTML email content
 */
export function buildInviteEmailHTML({
  companyName,
  employeeName,
  role,
  department,
  designation,
  username,
  password,
  email,
  loginUrl,
}) {
  const displayRole = role
    ? role
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
    : "Team Member";

  const safeCompanyName = companyName || "Company";
  const safeEmployeeName = employeeName || "Team Member";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Provisioned - ${safeCompanyName}</title>
</head>
<body style="margin: 0; padding: 32px 16px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; padding: 32px 28px; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
    
    <!-- Top Brand & Header -->
    <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #0f172a;">
      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin-bottom: 4px;">
        ${safeCompanyName} &bull; Human Resources &bull; Account Provisioned
      </div>
      <h1 style="margin: 0; font-size: 19px; font-weight: 700; color: #0f172a; letter-spacing: -0.3px;">
        Workspace Access Credentials
      </h1>
    </div>

    <!-- Salutation & Context -->
    <p style="margin: 0 0 14px 0; font-size: 14px; color: #0f172a;">
      Dear <strong>${safeEmployeeName}</strong>,
    </p>

    <p style="margin: 0 0 20px 0; font-size: 13px; color: #475569; line-height: 1.6;">
      Your employee account for <strong>${safeCompanyName}</strong> has been configured in the HRMS workspace. Please find your assigned role and initial sign-in credentials detailed below:
    </p>

    <!-- Structured Key-Value Detail List -->
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 24px 0; font-size: 13px; border-collapse: collapse;">
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 9px 0; width: 44%; color: #64748b; font-weight: 600;">Employee Name:</td>
        <td style="padding: 9px 0; color: #0f172a; font-weight: 600;">${safeEmployeeName}</td>
      </tr>
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Assigned Role:</td>
        <td style="padding: 9px 0; color: #0f172a; font-weight: 600;">${displayRole}</td>
      </tr>
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Department:</td>
        <td style="padding: 9px 0; color: #0f172a;">${department || "General"}</td>
      </tr>
      ${designation ? `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Designation:</td>
        <td style="padding: 9px 0; color: #0f172a;">${designation}</td>
      </tr>` : ""}
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Username:</td>
        <td style="padding: 9px 0; color: #0f172a; font-family: monospace; font-size: 13px;">${username}</td>
      </tr>
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Temporary Password:</td>
        <td style="padding: 9px 0; color: #0f172a; font-family: monospace; font-size: 13px; font-weight: 700;">${password}</td>
      </tr>
      <tr>
        <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Registered Email:</td>
        <td style="padding: 9px 0; color: #0f172a;">${email}</td>
      </tr>
    </table>

    <p style="margin: 0 0 16px 0; font-size: 13px; color: #475569; line-height: 1.5;">
      To access your portal, click the button below to proceed to the secure sign-in page:
    </p>

    <!-- Primary Action Button -->
    <div style="margin: 0 0 24px 0; text-align: left;">
      <a href="${loginUrl}" style="display: inline-block; padding: 12px 28px; background-color: #0f172a; color: #ffffff; font-size: 13px; font-weight: 600; text-decoration: none; border-radius: 6px; letter-spacing: 0.2px;">
        Sign In to HRMS Portal &rarr;
      </a>
    </div>

    <!-- Security Advisory Box -->
    <div style="margin: 0 0 24px 0; padding: 12px 14px; background-color: #fefce8; border: 1px solid #fef08a; border-radius: 6px; font-size: 12px; color: #854d0e; line-height: 1.5;">
      <strong>Security Notice:</strong> You will be requested to update your temporary password immediately upon your initial login. Never disclose your credentials to anyone.
    </div>

    <!-- Sign-off -->
    <div style="padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #475569;">
      Regards,<br>
      <strong style="color: #0f172a;">${safeCompanyName} HR Operations</strong><br>
      <span style="color: #94a3b8; font-size: 11px;">Human Resource Management System</span>
    </div>

  </div>
</body>
</html>`;
}
