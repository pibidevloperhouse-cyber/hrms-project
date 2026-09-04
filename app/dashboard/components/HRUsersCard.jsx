"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * HRUsersCard Component
 * Real-time HR management panel displaying active HR personnel and live pending invitations.
 */
export default function HRUsersCard({ employees = [], onOpenInviteModal, companyId }) {
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchInvitations = React.useCallback(async () => {
    try {
      const res = await fetch("/api/invitations");
      if (res.ok) {
        const data = await res.json();
        setInvitations(data.invitations || []);
      }
    } catch (err) {
      console.error("Error fetching HR invitations:", err);
    }
  }, []);

  // Realtime subscription on invitations table
  useEffect(() => {
    fetchInvitations();

    const supabase = createClient();
    const channel = supabase
      .channel("realtime-invitations-card")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "invitations",
        },
        () => {
          fetchInvitations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchInvitations]);

  // Filter active employees with HR roles
  const activeHR = employees.filter(
    (emp) => emp.role === "hr_manager" || emp.role === "hr_executive"
  );

  // Filter HR pending invitations
  const pendingHRInvites = invitations.filter(
    (inv) =>
      inv.status === "pending" &&
      (inv.role === "hr_manager" || inv.role === "hr_executive")
  );

  const totalHRHeadcount = activeHR.length + pendingHRInvites.length;

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs flex flex-col justify-between">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center border border-sky-200/60">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">HR Management Team</h3>
              <p className="text-[11px] text-slate-500">Active personnel &amp; pending invitations</p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200">
            {totalHRHeadcount} Personnel ({pendingHRInvites.length} Pending)
          </span>
        </div>

        {totalHRHeadcount === 0 ? (
          <div className="py-6 text-center space-y-2 bg-slate-50/40 rounded-xl border border-dashed border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-700">No dedicated HR Manager or HR Executive assigned yet.</p>
            <p className="text-[11px] text-slate-500">Invite HR members to delegate candidate onboarding and daily operations.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {/* Render Active HR Personnel */}
            {activeHR.map((hr) => (
              <div
                key={hr.id}
                className="p-3 rounded-xl bg-slate-50/50 border border-slate-200/60 flex items-center justify-between hover:bg-slate-50 transition"
              >
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                    <span>{hr.full_name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 font-semibold border border-sky-200 capitalize">
                      {hr.role === "hr_manager" ? "HR Manager" : "HR Executive"}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">{hr.email}</div>
                </div>

                <div className="text-right">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>Active</span>
                  </span>
                </div>
              </div>
            ))}

            {/* Render Pending HR Invitations */}
            {pendingHRInvites.map((inv) => (
              <div
                key={inv.id}
                className="p-3 rounded-xl bg-amber-50/40 border border-amber-200/80 flex items-center justify-between transition"
              >
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <span>{inv.full_name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold border border-slate-200 capitalize">
                      {inv.role === "hr_manager" ? "HR Manager" : "HR Executive"}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">{inv.email}</div>
                </div>

                <div className="text-right">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 text-[10px] font-semibold border border-amber-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                    <span>Pending Offer</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-slate-100">
        <button
          onClick={onOpenInviteModal}
          className="w-full py-2 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-semibold transition flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span>Invite HR Member</span>
        </button>
      </div>
    </div>
  );
}
