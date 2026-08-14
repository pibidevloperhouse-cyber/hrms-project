/**
 * Email templates sent to the registrant after the owner's decision.
 */

/**
 * Builds the "Approved" email HTML sent to the company after owner approval.
 */
export function buildApprovedEmailHTML({ companyName, adminName, loginUrl }) {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin:0; padding:0; background-color:#f0fdf4; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4; padding:40px 20px;">
      <tr>
        <td align="center">
          <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:16px; overflow:hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
            
            <!-- Header -->
            <tr>
              <td style="background: linear-gradient(135deg, #15803d, #16a34a); padding:32px 40px; text-align:center;">
                <div style="font-size:48px; margin-bottom:8px;">🎉</div>
                <h1 style="color:#ffffff; margin:0; font-size:24px; font-weight:700;">Registration Approved!</h1>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:32px 40px; text-align:center;">
                <p style="color:#334155; font-size:16px; line-height:1.6; margin:0 0 8px;">
                  Hi <strong>${adminName}</strong>,
                </p>
                <p style="color:#334155; font-size:15px; line-height:1.6; margin:0 0 24px;">
                  Great news! Your company <strong>${companyName}</strong> has been approved by the system owner. Your account is now active and ready to use.
                </p>

                <a href="${loginUrl}" target="_blank" style="display:inline-block; background:#0284c7; color:#ffffff; text-decoration:none; font-size:15px; font-weight:700; padding:14px 40px; border-radius:10px; letter-spacing:0.3px;">
                  🔑 Sign In Now
                </a>

                <p style="color:#64748b; font-size:13px; margin:24px 0 0; line-height:1.5;">
                  Use the email and password you provided during registration to sign in.
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:20px 40px; text-align:center;">
                <p style="color:#94a3b8; font-size:12px; margin:0;">
                  HRMS — Welcome aboard!
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

/**
 * Builds the "Rejected" email HTML sent to the company after owner rejection.
 */
export function buildRejectedEmailHTML({ companyName, adminName }) {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin:0; padding:0; background-color:#fef2f2; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2; padding:40px 20px;">
      <tr>
        <td align="center">
          <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:16px; overflow:hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
            
            <!-- Header -->
            <tr>
              <td style="background: linear-gradient(135deg, #991b1b, #dc2626); padding:32px 40px; text-align:center;">
                <div style="font-size:48px; margin-bottom:8px;">😔</div>
                <h1 style="color:#ffffff; margin:0; font-size:24px; font-weight:700;">Registration Not Approved</h1>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:32px 40px; text-align:center;">
                <p style="color:#334155; font-size:16px; line-height:1.6; margin:0 0 8px;">
                  Hi <strong>${adminName}</strong>,
                </p>
                <p style="color:#334155; font-size:15px; line-height:1.6; margin:0 0 24px;">
                  We regret to inform you that your registration request for <strong>${companyName}</strong> has been reviewed and was not approved by the system owner at this time.
                </p>

                <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:12px; padding:20px 24px; text-align:left;">
                  <p style="color:#991b1b; font-size:14px; font-weight:600; margin:0 0 8px;">What does this mean?</p>
                  <ul style="color:#64748b; font-size:13px; margin:0; padding-left:20px; line-height:1.8;">
                    <li>Your account has not been created.</li>
                    <li>No data has been stored in our system.</li>
                    <li>You may contact the system administrator for more details.</li>
                  </ul>
                </div>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:20px 40px; text-align:center;">
                <p style="color:#94a3b8; font-size:12px; margin:0;">
                  HRMS — Registration System
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
