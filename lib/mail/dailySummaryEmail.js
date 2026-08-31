/**
 * Email Template: Complete Employee Attendance & Shift Timesheet
 * Clean black-and-white corporate design for HR.
 * - Laptop / Desktop view: Full 8-column tabular timesheet.
 * - Mobile view: Each employee's column values are neatly stacked downwards one by one (no sideways swiping).
 */



function getStatusText(statusType) {
  switch (statusType) {
    case "PRESENT":
      return "Present";
    case "LATE_CHECKIN":
      return "Late In";
    case "EARLY_CHECKOUT":
      return "Early Out";
    case "LATE_AND_EARLY":
      return "Late & Early";
    case "ON_LEAVE":
      return "On Leave";
    case "ABSENT":
    default:
      return "Absent";
  }
}

export function buildDailySummaryEmailHTML({
  companyName = "Company",
  dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
  employeeRecords = [],
}) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Employee Attendance &amp; Shift Timesheet - ${companyName}</title>
      <style>
        * {
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          background-color: #f4f5f7;
          color: #111827;
          margin: 0;
          padding: 24px 12px;
          line-height: 1.4;
        }
        .container {
          max-width: 880px;
          margin: 0 auto;
          background: #ffffff;
          border: 1px solid #d1d5db;
          border-radius: 8px;
        }
        .doc-header {
          padding: 20px 24px;
          background: #ffffff;
          border-bottom: 2px solid #111827;
        }
        .doc-title {
          font-size: 18px;
          font-weight: 800;
          color: #111827;
          margin: 0 0 4px;
          text-transform: uppercase;
        }
        .doc-company {
          font-size: 13px;
          font-weight: 600;
          color: #4b5563;
        }
        .content {
          padding: 20px 24px;
        }

        /* 1. LAPTOP / DESKTOP TABLE VIEW */
        .desktop-view {
          display: block;
          width: 100%;
        }
        .report-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
          text-align: left;
          border: 1px solid #d1d5db;
          background: #ffffff;
        }
        .report-table th {
          background: #f3f4f6;
          color: #111827;
          font-weight: 700;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          padding: 10px 12px;
          border: 1px solid #d1d5db;
          vertical-align: middle;
        }
        .report-table td {
          padding: 9px 12px;
          border: 1px solid #e5e7eb;
          color: #1f2937;
          vertical-align: middle;
        }
        .report-table tr:nth-child(even) td {
          background: #fafafa;
        }
        .mono {
          font-family: Consolas, 'Liberation Mono', Menlo, Courier, monospace;
          font-size: 11.5px;
        }
        .font-bold {
          font-weight: 700;
        }
        .text-right {
          text-align: right;
        }
        .text-center {
          text-align: center;
        }
        .status-text {
          font-weight: 700;
          font-size: 11px;
          text-transform: uppercase;
        }
        .remarks-text {
          font-size: 11px;
          color: #4b5563;
        }
        .reason-highlight {
          font-size: 11px;
          color: #111827;
          background: #f3f4f6;
          padding: 3px 6px;
          border: 1px solid #d1d5db;
          border-radius: 3px;
          display: inline-block;
          margin-top: 3px;
        }

        /* 2. MOBILE VIEW (One-by-one column stack downwards per employee) */
        .mobile-view {
          display: none;
        }
        .mobile-emp-block {
          margin-bottom: 16px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          overflow: hidden;
          background: #ffffff;
        }
        .mobile-emp-header {
          background: #111827;
          color: #ffffff;
          padding: 9px 12px;
          font-size: 13px;
          font-weight: 700;
        }
        .mobile-stack-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        .mobile-stack-table td {
          padding: 8px 10px;
          border-bottom: 1px solid #e5e7eb;
          vertical-align: top;
        }
        .mobile-col-name {
          width: 38%;
          background: #f9fafb;
          color: #4b5563;
          font-weight: 700;
          font-size: 11px;
          text-transform: uppercase;
          border-right: 1px solid #e5e7eb;
        }
        .mobile-col-val {
          width: 62%;
          color: #111827;
        }

        .doc-footer {
          padding: 16px 24px;
          background: #f9fafb;
          border-top: 1px solid #d1d5db;
          font-size: 11px;
          color: #6b7280;
          text-align: center;
        }

        /* MOBILE BREAKPOINT: Hide desktop table, display downward-stacked employee records */
        @media only screen and (max-width: 640px) {
          body {
            padding: 8px 6px !important;
          }
          .container {
            border-radius: 4px !important;
            width: 100% !important;
          }
          .doc-header {
            padding: 14px 16px !important;
          }
          .content {
            padding: 12px 10px !important;
          }
          .desktop-view {
            display: none !important;
          }
          .mobile-view {
            display: block !important;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        
        <!-- Document Header -->
        <div class="doc-header">
          <h1 class="doc-title">Complete Employee Attendance &amp; Shift Timesheet</h1>
          <div class="doc-company">${companyName} &bull; ${dateStr}</div>
        </div>

        <div class="content">

          <!-- 1. LAPTOP / DESKTOP TABLE VIEW -->
          <div class="desktop-view">
            <table class="report-table">
              <thead>
                <tr>
                  <th width="4%" class="text-center">#</th>
                  <th width="20%">Employee Name</th>
                  <th width="12%">Department</th>
                  <th width="13%">Check-In</th>
                  <th width="12%">Check-Out</th>
                  <th width="11%" class="text-right">Working Hours</th>
                  <th width="10%" class="text-right">Overtime</th>
                  <th width="10%" class="text-right">Shortfall</th>
                  <th width="8%">Status</th>
                </tr>
              </thead>
              <tbody>
                ${employeeRecords.map((emp, index) => `
                  <tr>
                    <td class="text-center mono">${index + 1}</td>
                    <td>
                      <div class="font-bold">${emp.fullName}</div>
                      <div class="remarks-text">ID: ${emp.employeeCode || "—"}</div>
                      ${emp.earlyReason ? `
                        <div class="reason-highlight">
                          <strong>Early Checkout Reason:</strong> ${emp.earlyReason}
                        </div>
                      ` : ""}
                    </td>
                    <td>
                      <div>${emp.department || "General"}</div>
                      <div class="remarks-text">${emp.designation || "Staff"}</div>
                    </td>
                    <td class="mono">
                      <div>${emp.checkIn || "—"}</div>
                      ${emp.delayedDuration ? `<div class="remarks-text" style="font-size: 10.5px; font-weight: 700; color: #b91c1c;">Late: ${emp.delayedDuration}</div>` : ""}
                    </td>
                    <td class="mono">
                      <div>${emp.checkOut || "—"}</div>
                      ${emp.isEarly && emp.checkOut && emp.checkOut !== "—" ? `<div class="remarks-text" style="font-size: 10px; font-weight: 700; color: #d97706;">(Early Out)</div>` : ""}
                    </td>
                    <td class="mono text-right font-bold">
                      ${emp.workingHoursFormatted || "0h 0m"}
                    </td>
                    <td class="mono text-right" style="color: ${emp.overtimeFormatted ? '#047857' : '#6b7280'};">
                      ${emp.overtimeFormatted ? `+${emp.overtimeFormatted}` : "—"}
                    </td>
                    <td class="mono text-right" style="color: ${emp.shortageFormatted ? '#b91c1c' : '#6b7280'};">
                      ${emp.shortageFormatted ? `-${emp.shortageFormatted}` : "—"}
                    </td>
                    <td class="status-text">
                      ${getStatusText(emp.statusType)}
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>

          <!-- 2. MOBILE VIEW (Values Stacked Downwards One-by-One for Each Employee) -->
          <div class="mobile-view">
            ${employeeRecords.map((emp, index) => `
              <div class="mobile-emp-block">
                <div class="mobile-emp-header">
                  #${index + 1} &bull; ${emp.fullName}
                </div>
                <table class="mobile-stack-table">
                  <tr>
                    <td class="mobile-col-name">Department / Role</td>
                    <td class="mobile-col-val">
                      <div><strong>${emp.department || "General"}</strong> &bull; ${emp.designation || "Staff"}</div>
                      <div class="remarks-text">ID: ${emp.employeeCode || "—"}</div>
                    </td>
                  </tr>
                  <tr>
                    <td class="mobile-col-name">Check-In</td>
                    <td class="mobile-col-val mono">
                      ${emp.checkIn || "—"}
                      ${emp.delayedDuration ? `<span style="font-size: 10.5px; font-weight: 700; color: #b91c1c; margin-left: 4px;">(Late: ${emp.delayedDuration})</span>` : ""}
                    </td>
                  </tr>
                  <tr>
                    <td class="mobile-col-name">Check-Out</td>
                    <td class="mobile-col-val mono">
                      ${emp.checkOut || "—"}
                      ${emp.isEarly && emp.checkOut && emp.checkOut !== "—" ? `<span style="font-size: 10.5px; font-weight: 700; color: #d97706; margin-left: 4px;">(Early Out)</span>` : ""}
                    </td>
                  </tr>
                  <tr>
                    <td class="mobile-col-name">Working Hours</td>
                    <td class="mobile-col-val mono font-bold">
                      ${emp.workingHoursFormatted || "0h 0m"}
                    </td>
                  </tr>
                  <tr>
                    <td class="mobile-col-name">Overtime</td>
                    <td class="mobile-col-val mono" style="color: ${emp.overtimeFormatted ? '#047857' : '#6b7280'};">
                      ${emp.overtimeFormatted ? `+${emp.overtimeFormatted}` : "—"}
                    </td>
                  </tr>
                  <tr>
                    <td class="mobile-col-name">Shortfall</td>
                    <td class="mobile-col-val mono" style="color: ${emp.shortageFormatted ? '#b91c1c' : '#6b7280'};">
                      ${emp.shortageFormatted ? `-${emp.shortageFormatted}` : "—"}
                    </td>
                  </tr>
                  <tr>
                    <td class="mobile-col-name">Status</td>
                    <td class="mobile-col-val status-text">
                      ${getStatusText(emp.statusType)}
                    </td>
                  </tr>
                  ${emp.earlyReason ? `
                    <tr>
                      <td class="mobile-col-name">Early Checkout Reason</td>
                      <td class="mobile-col-val" style="background: #f3f4f6; color: #111827;">
                        ${emp.earlyReason}
                      </td>
                    </tr>
                  ` : ""}
                </table>
              </div>
            `).join("")}
          </div>

        </div>

        <!-- Document Footer -->
        <div class="doc-footer">
          Generated automatically by <strong>${companyName} HRMS</strong> on ${new Date().toLocaleTimeString()} &bull; ${dateStr}
        </div>

      </div>
    </body>
    </html>
  `;
}
