/**
 * Generates the HTML email sent to the system owner when a new company registers.
 * Contains company details and Approve / Reject action buttons.
 */
export function buildApprovalEmailHTML({ companyName, companyEmail, phone, industry, adminName, approveUrl, rejectUrl }) {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin:0; padding:0; background-color:#f0f7ff; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f7ff; padding:40px 20px;">
      <tr>
        <td align="center">
          <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:16px; overflow:hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
            
            <!-- Header -->
            <tr>
              <td style="background: linear-gradient(135deg, #0369a1, #0284c7); padding:32px 40px; text-align:center;">
                <h1 style="color:#ffffff; margin:0; font-size:24px; font-weight:700; letter-spacing:-0.5px;">
                  🏢 New Company Registration
                </h1>
                <p style="color:#bae6fd; margin:8px 0 0; font-size:14px;">
                  A new company is requesting access to HRMS
                </p>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:32px 40px;">
                <p style="color:#334155; font-size:15px; line-height:1.6; margin:0 0 24px;">
                  The following company has submitted a registration request and is awaiting your approval:
                </p>

                <!-- Details Card -->
                <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden;">
                  <tr>
                    <td style="padding:20px 24px; border-bottom:1px solid #e2e8f0;">
                      <span style="color:#64748b; font-size:11px; text-transform:uppercase; letter-spacing:1px; font-weight:600;">Company Name</span>
                      <p style="color:#0f172a; font-size:16px; font-weight:600; margin:4px 0 0;">${companyName}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:20px 24px; border-bottom:1px solid #e2e8f0;">
                      <span style="color:#64748b; font-size:11px; text-transform:uppercase; letter-spacing:1px; font-weight:600;">Work Email</span>
                      <p style="color:#0f172a; font-size:16px; margin:4px 0 0;">${companyEmail}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:20px 24px; border-bottom:1px solid #e2e8f0;">
                      <span style="color:#64748b; font-size:11px; text-transform:uppercase; letter-spacing:1px; font-weight:600;">Phone</span>
                      <p style="color:#0f172a; font-size:16px; margin:4px 0 0;">${phone}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:20px 24px; border-bottom:1px solid #e2e8f0;">
                      <span style="color:#64748b; font-size:11px; text-transform:uppercase; letter-spacing:1px; font-weight:600;">Industry</span>
                      <p style="color:#0f172a; font-size:16px; margin:4px 0 0;">${industry}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:20px 24px;">
                      <span style="color:#64748b; font-size:11px; text-transform:uppercase; letter-spacing:1px; font-weight:600;">Admin Name</span>
                      <p style="color:#0f172a; font-size:16px; margin:4px 0 0;">${adminName}</p>
                    </td>
                  </tr>
                </table>

                <!-- Action Buttons -->
                <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;">
                  <tr>
                    <td align="center" style="padding:0 8px 0 0; width:50%;">
                      <a href="${approveUrl}" target="_blank" style="display:block; background:#16a34a; color:#ffffff; text-decoration:none; font-size:15px; font-weight:700; padding:14px 24px; border-radius:10px; text-align:center; letter-spacing:0.3px;">
                        ✅ Approve
                      </a>
                    </td>
                    <td align="center" style="padding:0 0 0 8px; width:50%;">
                      <a href="${rejectUrl}" target="_blank" style="display:block; background:#dc2626; color:#ffffff; text-decoration:none; font-size:15px; font-weight:700; padding:14px 24px; border-radius:10px; text-align:center; letter-spacing:0.3px;">
                        ❌ Reject
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="color:#94a3b8; font-size:12px; text-align:center; margin:24px 0 0; line-height:1.5;">
                  Clicking a button will immediately process the request.<br/>
                  The applicant will be notified by email.
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:20px 40px; text-align:center;">
                <p style="color:#94a3b8; font-size:12px; margin:0;">
                  HRMS — Company Registration Approval System
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
}
