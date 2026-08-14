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
    <div className="bg-white border border-sky-100 rounded-3xl p-6 sm:p-7 space-y-5 hover:border-sky-300 transition duration-300 shadow-2xs flex flex-col justify-between">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-sky-100 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center text-lg">
              👔
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">HR Management Team</h3>
              <p className="text-xs text-slate-500">Realtime HR team & pending invitations</p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full bg-purple-50 text-purple-700 text-xs font-bold border border-purple-200">
            {totalHRHeadcount} HR Total ({pendingHRInvites.length} Pending)
          </span>
        </div>

        {totalHRHeadcount === 0 ? (
          <div className="py-6 text-center space-y-3 bg-sky-50/50 rounded-2xl p-4 border border-sky-100">
            <p className="text-xs text-slate-600">No dedicated HR Manager or HR Executive added yet.</p>
            <p className="text-[11px] text-slate-500">Invite HR members to delegate candidate onboarding and staff operations.</p>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
            {/* Render Active HR Personnel */}
            {activeHR.map((hr) => (
              <div
                key={hr.id}
                className="p-3 rounded-2xl bg-sky-50/40 border border-sky-100 flex items-center justify-between hover:border-purple-300 transition"
              >
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-slate-900 flex items-center space-x-2">
                    <span>{hr.full_name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-semibold border border-purple-200 capitalize">
                      {hr.role === "hr_manager" ? "HR Manager" : "HR Executive"}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">{hr.email}</div>
                </div>

                <div className="text-right">
                  <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span>Active</span>
                  </span>
                </div>
              </div>
            ))}

            {/* Render Pending HR Invitations */}
            {pendingHRInvites.map((inv) => (
              <div
                key={inv.id}
                className="p-3 rounded-2xl bg-amber-50/60 border border-amber-200 flex items-center justify-between transition"
              >
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-slate-800 flex items-center space-x-2">
                    <span>{inv.full_name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-semibold border border-purple-200 capitalize">
                      {inv.role === "hr_manager" ? "HR Manager" : "HR Executive"}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">{inv.email}</div>
                </div>

                <div className="text-right">
                  <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold border border-amber-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                    <span>Pending Offer</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pt-2">
        <button
          onClick={onOpenInviteModal}
          className="w-full py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 text-xs font-semibold transition flex items-center justify-center space-x-2 shadow-2xs"
        >
          <span>➕ Add / Invite HR Member</span>
        </button>
      </div>
    </div>
  );
}
