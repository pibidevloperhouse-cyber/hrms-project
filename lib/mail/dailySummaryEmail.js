/**
 * Email Template: Daily Company Attendance Summary Report
 * Sent to HR / Admin / Owner once all working employees have checked out for the day.
 */

export function buildDailySummaryEmailHTML({
  companyName,
  dateStr,
  totalStaff,
  presentCount,
  totalHoursWorked,
  avgHoursPerStaff,
  lateArrivalsCount,
  earlyDeparturesCount,
  totalOvertimeHours,
  onLeaveCount,
  absentCount,
  employeeRecords = [],
}) {
  const attendanceRate = totalStaff > 0 ? Math.round((presentCount / totalStaff) * 100) : 0;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Daily Attendance Summary - ${companyName}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          background-color: #f1f5f9;
          color: #1e293b;
          margin: 0;
          padding: 24px;
        }
        .container {
          max-width: 720px;
          margin: 0 auto;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);
        }
        .header {
          background: linear-gradient(135deg, #0284c7 0%, #0369a1 50%, #0f172a 100%);
          padding: 36px 32px;
          text-align: center;
          color: #ffffff;
        }
        .header h1 {
          margin: 8px 0 4px;
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.5px;
        }
        .header p {
          margin: 0;
          color: #bae6fd;
          font-size: 14px;
          font-weight: 500;
        }
        .content {
          padding: 32px;
        }
        .section-title {
          font-size: 13px;
          font-weight: 800;
          color: #0f172a;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 0 0 16px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .kpi-grid {
          width: 100%;
          border-collapse: separate;
          border-spacing: 8px;
          margin-bottom: 24px;
        }
        .kpi-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 12px;
          text-align: center;
        }
        .kpi-label {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #64748b;
          margin-bottom: 4px;
        }
        .kpi-value {
          font-size: 18px;
          font-weight: 800;
          color: #0f172a;
        }
        .table-container {
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          overflow: hidden;
          margin-bottom: 24px;
        }
        .data-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
          text-align: left;
        }
        .data-table th {
          background: #f8fafc;
          color: #475569;
          font-weight: 800;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: 12px 10px;
          border-bottom: 1px solid #e2e8f0;
        }
        .data-table td {
          padding: 12px 10px;
          border-bottom: 1px solid #f1f5f9;
          color: #334155;
          vertical-align: middle;
        }
        .data-table tr:last-child td {
          border-bottom: none;
        }
        .data-table tr:nth-child(even) td {
          background: #fafafa;
        }
        .badge {
          display: inline-block;
          font-size: 10px;
          font-weight: 800;
          padding: 3px 8px;
          border-radius: 6px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          white-space: nowrap;
        }
        .badge-present { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
        .badge-late { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
        .badge-early { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
        .badge-leave { background: #e0e7ff; color: #4338ca; border: 1px solid #c7d2fe; }
        .badge-absent { background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0; }
        .footer {
          text-align: center;
          padding: 24px;
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
          <div style="font-size: 38px; margin-bottom: 8px;">📊</div>
          <h1>Daily Attendance Summary Report</h1>
          <p>${companyName} • ${dateStr}</p>
        </div>

        <div class="content">
          <!-- Notification Notice -->
          <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px; padding: 12px 16px; margin-bottom: 20px; font-size: 13px; color: #0369a1;">
            <strong>✅ All Shifts Concluded:</strong> All working employees have completed check-outs for today. Here is the comprehensive daily summary report for HR and Management review.
          </div>

          <!-- Section: Key Metrics -->
          <div class="section-title">📈 Today's Summary Metrics</div>
          
          <table class="kpi-grid" cellpadding="0" cellspacing="0">
            <tr>
              <td width="25%">
                <div class="kpi-card">
                  <div class="kpi-label">Total Staff</div>
                  <div class="kpi-value">${totalStaff}</div>
                </div>
              </td>
              <td width="25%">
                <div class="kpi-card" style="border-color: #bbf7d0; background: #f0fdf4;">
                  <div class="kpi-label" style="color: #166534;">Present</div>
                  <div class="kpi-value" style="color: #15803d;">${presentCount}</div>
                </div>
              </td>
              <td width="25%">
                <div class="kpi-card" style="border-color: #bae6fd; background: #f0f9ff;">
                  <div class="kpi-label" style="color: #0369a1;">Total Hours</div>
                  <div class="kpi-value" style="color: #0284c7;">${totalHoursWorked}h</div>
                </div>
              </td>
              <td width="25%">
                <div class="kpi-card" style="border-color: #c7d2fe; background: #eef2ff;">
                  <div class="kpi-label" style="color: #3730a3;">Avg Hours/Staff</div>
                  <div class="kpi-value" style="color: #4338ca;">${avgHoursPerStaff}h</div>
                </div>
              </td>
            </tr>
            <tr>
              <td width="25%">
                <div class="kpi-card" style="border-color: #fde68a; background: #fffbeb;">
                  <div class="kpi-label" style="color: #92400e;">Late Check-Ins</div>
                  <div class="kpi-value" style="color: #b45309;">${lateArrivalsCount}</div>
                </div>
              </td>
              <td width="25%">
                <div class="kpi-card" style="border-color: #fecaca; background: #fef2f2;">
                  <div class="kpi-label" style="color: #991b1b;">Early Check-Outs</div>
                  <div class="kpi-value" style="color: #b91c1c;">${earlyDeparturesCount}</div>
                </div>
              </td>
              <td width="25%">
                <div class="kpi-card" style="border-color: #ddd6fe; background: #f5f3ff;">
                  <div class="kpi-label" style="color: #6b21a8;">Total Overtime</div>
                  <div class="kpi-value" style="color: #7c3aed;">+${totalOvertimeHours || 0}h</div>
                </div>
              </td>
              <td width="25%">
                <div class="kpi-card" style="border-color: #fed7aa; background: #fff7ed;">
                  <div class="kpi-label" style="color: #9a3412;">Absent / Leave</div>
                  <div class="kpi-value" style="color: #c2410c;">${absentCount + onLeaveCount}</div>
                </div>
              </td>
            </tr>
          </table>

          <!-- Section: Detailed Attendance Table -->
          <div class="section-title">👥 Employee Attendance, Late In, Early Out &amp; Overtime Log</div>

          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Delayed</th>
                  <th>Overtime</th>
                  <th>Worked</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${employeeRecords.map((emp) => `
                  <tr>
                    <td>
                      <div style="font-weight: 700; color: #0f172a;">${emp.fullName}</div>
                      <div style="font-size: 10px; color: #64748b;">${emp.department || "General"} • ${emp.designation || "Staff"}</div>
                      ${emp.earlyReason ? `<div style="font-size: 10px; color: #b91c1c; font-style: italic; margin-top: 2px;">Note: &ldquo;${emp.earlyReason}&rdquo;</div>` : ""}
                    </td>
                    <td style="font-family: monospace; font-size: 11px; white-space: nowrap;">
                      ${emp.checkIn || "—"}
                    </td>
                    <td style="font-family: monospace; font-size: 11px; white-space: nowrap;">
                      ${emp.checkOut || "—"}
                    </td>
                    <td style="font-family: monospace; font-size: 11px; white-space: nowrap;">
                      ${emp.delayedDuration ? `<span style="color: #b45309; font-weight: 700;">${emp.delayedDuration}</span>` : `<span style="color: #94a3b8;">—</span>`}
                    </td>
                    <td style="font-family: monospace; font-size: 11px; white-space: nowrap;">
                      ${emp.overtimeHours ? `<span style="color: #15803d; font-weight: 700;">+${emp.overtimeHours}h</span>` : `<span style="color: #94a3b8;">—</span>`}
                    </td>
                    <td style="font-family: monospace; font-size: 11px; font-weight: 700; white-space: nowrap;">
                      ${emp.workingHours ? `${emp.workingHours}h` : "—"}
                    </td>
                    <td>
                      ${emp.statusBadge}
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>

          <p style="font-size: 12px; color: #64748b; margin: 0; text-align: center;">
            Full monthly logs, detailed timesheets, and payroll exports are available in your <strong>HRMS Dashboard &rarr; Attendance Management</strong>.
          </p>
        </div>

        <!-- Footer -->
        <div class="footer">
          Delivered automatically by ${companyName} HRMS Attendance Engine on ${new Date().toLocaleTimeString()}
        </div>
      </div>
    </body>
    </html>
  `;
}

