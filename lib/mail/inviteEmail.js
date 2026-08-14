/**
 * Builds a premium HTML email for sending employee login credentials.
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
  // Format role for display (e.g. "hr_manager" → "HR Manager")
  const displayRole = role
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to ${companyName}</title>
</head>
<body style="margin:0; padding:0; background-color:#f0f4f8; font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f8; padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #0369a1 0%, #1e40af 50%, #4338ca 100%); padding:36px 40px; text-align:center;">
              <h1 style="margin:0; color:#ffffff; font-size:24px; font-weight:700; letter-spacing:-0.5px;">
                Welcome to ${companyName}
              </h1>
              <p style="margin:8px 0 0; color:rgba(255,255,255,0.85); font-size:14px; font-weight:400;">
                Your employee account has been created
              </p>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 20px; color:#1e293b; font-size:15px; line-height:1.6;">
                Hi <strong>${employeeName}</strong>,
              </p>
              <p style="margin:0 0 24px; color:#475569; font-size:14px; line-height:1.7;">
                You've been invited to join <strong style="color:#0369a1;">${companyName}</strong> as a team member. 
                Your account is ready — use the credentials below to sign in.
              </p>

              <!-- Role & Department Info -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="padding:12px 16px; background-color:#f0f9ff; border-radius:10px; border:1px solid #bae6fd;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50%" style="padding:4px 0;">
                          <span style="color:#64748b; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; font-weight:600;">Role</span><br/>
                          <span style="color:#0c4a6e; font-size:14px; font-weight:600;">${displayRole}</span>
                        </td>
                        <td width="50%" style="padding:4px 0;">
                          <span style="color:#64748b; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; font-weight:600;">Department</span><br/>
                          <span style="color:#0c4a6e; font-size:14px; font-weight:600;">${department || "General"}</span>
                        </td>
                      </tr>
                      ${designation ? `
                      <tr>
                        <td colspan="2" style="padding:8px 0 0;">
                          <span style="color:#64748b; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; font-weight:600;">Designation</span><br/>
                          <span style="color:#0c4a6e; font-size:14px; font-weight:600;">${designation}</span>
                        </td>
                      </tr>` : ""}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Credentials Box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="padding:20px; background-color:#0f172a; border-radius:12px;">
                    <p style="margin:0 0 16px; color:#94a3b8; font-size:11px; text-transform:uppercase; letter-spacing:1px; font-weight:700;">
                      🔐 Your Login Credentials
                    </p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;">
                          <span style="color:#64748b; font-size:12px;">Email</span><br/>
                          <span style="color:#e2e8f0; font-size:15px; font-weight:600; font-family:monospace;">${email}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;">
                          <span style="color:#64748b; font-size:12px;">Username</span><br/>
                          <span style="color:#38bdf8; font-size:15px; font-weight:600; font-family:monospace;">${username}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;">
                          <span style="color:#64748b; font-size:12px;">Temporary Password</span><br/>
                          <span style="color:#fbbf24; font-size:15px; font-weight:700; font-family:monospace; letter-spacing:1px;">${password}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Login Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <a href="${loginUrl}" 
                       style="display:inline-block; padding:14px 40px; background:linear-gradient(135deg,#0284c7,#1d4ed8); color:#ffffff; font-size:14px; font-weight:600; text-decoration:none; border-radius:10px; letter-spacing:0.3px;">
                      Sign In to Your Account →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Security Notice -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:14px 16px; background-color:#fefce8; border-radius:10px; border:1px solid #fde68a;">
                    <p style="margin:0; color:#92400e; font-size:12px; line-height:1.6;">
                      ⚠️ <strong>Security Notice:</strong> Please change your password after your first login. 
                      Do not share these credentials with anyone.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 28px; border-top:1px solid #e2e8f0; text-align:center;">
              <p style="margin:0; color:#94a3b8; font-size:11px;">
                This is an automated message from ${companyName} HRMS.<br/>
                If you did not expect this invitation, please contact your HR department.
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
