"use client";

import React, { useState } from "react";

/**
 * PayrollStatusCard Component
 * Displays Executive Payroll Status, upcoming disbursal date, estimated total payroll cost,
 * and approval control for the Owner.
 */
export default function PayrollStatusCard({ totalStaffCount = 1 }) {
  const [payrollStatus, setPayrollStatus] = useState("Ready for Review");
  const [isApproved, setIsApproved] = useState(false);

  // Dynamic estimate based on headcount
  const estimatedPayroll = (totalStaffCount * 3200).toLocaleString();

  const handleApprovePayroll = () => {
    if (!isApproved) {
      setIsApproved(true);
      setPayrollStatus("Approved & Processing");
    } else {
      setIsApproved(false);
      setPayrollStatus("Ready for Review");
    }
  };

  return (
    <div className="bg-white border border-sky-100 rounded-3xl p-6 sm:p-7 space-y-5 hover:border-sky-300 transition duration-300 shadow-2xs flex flex-col justify-between">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-sky-100 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center text-lg">
              💳
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">Payroll Status</h3>
              <p className="text-xs text-slate-500">Monthly company payout cycle</p>
            </div>
          </div>

          <span
            className={`px-3 py-1 rounded-full text-xs font-bold border transition ${
              isApproved
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-amber-50 text-amber-700 border-amber-200"
            }`}
          >
            {payrollStatus}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3.5 rounded-2xl bg-sky-50/50 border border-sky-100 space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Est. Monthly Cost</span>
            <div className="text-lg font-extrabold text-slate-900 font-mono">${estimatedPayroll}</div>
            <span className="text-[10px] text-slate-500">{totalStaffCount} Paid Roles</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-sky-50/50 border border-sky-100 space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Next Disbursal</span>
            <div className="text-lg font-bold text-sky-700">Aug 28, 2026</div>
            <span className="text-[10px] text-emerald-700 font-medium">Direct Deposit Active</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-sky-50/30 border border-sky-100 text-xs space-y-2">
          <div className="flex justify-between items-center text-slate-700">
            <span>Tax Compliance & Deductions</span>
            <span className="text-emerald-700 font-semibold">100% Calculated</span>
          </div>
          <div className="w-full bg-sky-100 rounded-full h-1.5 overflow-hidden">
            <div className="bg-emerald-500 h-full w-full"></div>
          </div>
        </div>
      </div>

      <div className="pt-2">
        <button
          onClick={handleApprovePayroll}
          className={`w-full py-2.5 rounded-xl text-xs font-bold transition shadow-md flex items-center justify-center space-x-2 border ${
            isApproved
              ? "bg-sky-100 hover:bg-sky-200 text-slate-800 border-sky-200"
              : "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-600 shadow-emerald-500/20"
          }`}
        >
          <span>{isApproved ? "🔄 Revert to Review" : "⚡ Authorize & Approve Payroll"}</span>
        </button>
      </div>
    </div>
  );
}
