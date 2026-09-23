"use client";

import React, { useState, useEffect } from "react";
import AddCompanyNetworkModal from "./AddCompanyNetworkModal";
import { authFetch } from "@/lib/api/authFetch";

/**
 * CompanySettings Component
 * Enterprise Company Settings Portal for Owner and HR to configure authorized networks, IP whitelists, and workspace network access.
 */
export default function CompanySettings({ userRole, company }) {
  const [networks, setNetworks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // "all" | "active" | "inactive"

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [networkToEdit, setNetworkToEdit] = useState(null);

  // Notifications / Feedback
  const [notice, setNotice] = useState({ error: "", success: "" });
  const [currentIp, setCurrentIp] = useState("");
  const [isDeletingId, setIsDeletingId] = useState(null);
  const [copiedIp, setCopiedIp] = useState(null);
  const [isQuickAuthorizing, setIsQuickAuthorizing] = useState(false);

  const isOwnerOrHR = ["ADMIN", "hr_manager", "hr_executive"].includes(userRole);

  const fetchNetworks = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await authFetch("/api/company/networks");
      const data = await res.json();
      if (res.ok && Array.isArray(data.networks)) {
        setNetworks(data.networks);
      }
    } catch (err) {
      console.error("Fetch networks error:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const detectClientIp = async () => {
    try {
      const res = await fetch("/api/company/networks/detect");
      if (res.ok) {
        const data = await res.json();
        if (data.ip) setCurrentIp(data.ip);
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchNetworks();
    detectClientIp();
  }, []);

  const handleOpenAddModal = () => {
    setNetworkToEdit(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (network) => {
    setNetworkToEdit(network);
    setIsModalOpen(true);
  };

  const handleNetworkSaved = (savedNetwork, wasEditing) => {
    fetchNetworks(true);
    setNotice({
      error: "",
      success: wasEditing
        ? `Company network "${savedNetwork.network_name || "Network"}" updated successfully.`
        : `Company network "${savedNetwork.network_name || "Network"}" added successfully.`,
    });
    setTimeout(() => setNotice({ error: "", success: "" }), 4000);
  };

  const handleToggleStatus = async (network) => {
    const nextStatus = network.status === "active" ? "inactive" : "active";
    try {
      const res = await authFetch("/api/company/networks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: network.id,
          status: nextStatus,
        }),
      });
      if (res.ok) {
        setNetworks((prev) =>
          prev.map((n) => (n.id === network.id ? { ...n, status: nextStatus } : n))
        );
        setNotice({
          error: "",
          success: `Network "${network.network_name}" is now ${nextStatus}.`,
        });
        setTimeout(() => setNotice({ error: "", success: "" }), 3000);
      }
    } catch (err) {
      console.error("Toggle status error:", err);
    }
  };

  const handleDeleteNetwork = async (network) => {
    if (!window.confirm(`Are you sure you want to delete network "${network.network_name}"?`)) {
      return;
    }
    setIsDeletingId(network.id);
    try {
      const res = await authFetch(`/api/company/networks?id=${network.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setNetworks((prev) => prev.filter((n) => n.id !== network.id));
        setNotice({
          error: "",
          success: `Network "${network.network_name}" deleted successfully.`,
        });
        setTimeout(() => setNotice({ error: "", success: "" }), 3000);
      } else {
        const data = await res.json();
        setNotice({ error: data.message || "Failed to delete network.", success: "" });
      }
    } catch (err) {
      console.error("Delete network error:", err);
      setNotice({ error: "Network error. Please try again.", success: "" });
    } finally {
      setIsDeletingId(null);
    }
  };

  const handleCopyIp = (ip) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(ip);
      setCopiedIp(ip);
      setTimeout(() => setCopiedIp(null), 2000);
    }
  };

  // Metrics
  const totalCount = networks.length;
  const activeCount = networks.filter((n) => n.status === "active").length;
  const inactiveCount = networks.filter((n) => n.status === "inactive").length;
  const isCurrentIpCovered = networks.some((n) => {
    if (n.status !== "active" || !currentIp) return false;
    if (n.network_ip === "*" || n.network_ip === "all" || n.network_ip === "0.0.0.0/0") return true;
    if (n.network_ip === currentIp) return true;
    if (n.network_ip.endsWith("*") && currentIp.startsWith(n.network_ip.slice(0, -1))) return true;
    if (currentIp.startsWith(n.network_ip)) return true;
    return false;
  });

  const handleAuthorizeCurrentIp = async () => {
    if (!currentIp) return;
    setIsQuickAuthorizing(true);
    try {
      const res = await authFetch("/api/company/networks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          network_name: `Office Network (${currentIp})`,
          network_ip: currentIp,
          status: "active",
          description: "Authorized from Company Settings",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setNotice({
          error: "",
          success: `Network IP "${currentIp}" authorized successfully.`,
        });
        await fetchNetworks(true);
      } else {
        setNotice({ error: data.message || "Failed to authorize IP.", success: "" });
      }
    } catch (err) {
      console.error("Authorize IP error:", err);
      setNotice({ error: "Network error. Please try again.", success: "" });
    } finally {
      setIsQuickAuthorizing(false);
    }
  };

  // Filtered networks
  const filteredNetworks = networks.filter((net) => {
    const q = searchQuery.toLowerCase().trim();
    const matchQ =
      !q ||
      net.network_name?.toLowerCase().includes(q) ||
      net.network_ip?.toLowerCase().includes(q) ||
      net.description?.toLowerCase().includes(q);
    const matchStatus = filterStatus === "all" || net.status === filterStatus;
    return matchQ && matchStatus;
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Notifications */}
      {notice.error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center justify-between">
          <span>{notice.error}</span>
          <button
            type="button"
            onClick={() => setNotice({ error: "", success: "" })}
            className="text-rose-500 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}
      {notice.success && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between">
          <span>{notice.success}</span>
          <button
            type="button"
            onClick={() => setNotice({ error: "", success: "" })}
            className="text-emerald-600 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* --- TOP BANNER & METRICS CARD --- */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center border border-sky-200/60">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                </svg>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                Company Settings &amp; Authorized Networks
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              Configure authorized office networks, Wi-Fi IP ranges, and workspace network policies for attendance tracking.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {isOwnerOrHR && (
              <button
                type="button"
                onClick={handleOpenAddModal}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors shadow-xs shadow-blue-600/20 cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                <span>Add Company Network</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                fetchNetworks();
                detectClientIp();
              }}
              className="p-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/80 text-slate-600 transition-colors shadow-2xs cursor-pointer flex items-center justify-center"
              title="Refresh Networks"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* 4 Summary Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Total Networks</span>
            <div className="text-xl font-bold text-slate-900 font-mono">{totalCount}</div>
            <span className="text-[11px] text-slate-500">Registered access points</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Active Networks</span>
            <div className="text-xl font-bold text-emerald-600 font-mono">{activeCount}</div>
            <span className="text-[11px] text-slate-500">Authorized for check-in</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Inactive Networks</span>
            <div className="text-xl font-bold text-slate-700 font-mono">{inactiveCount}</div>
            <span className="text-[11px] text-slate-500">Disabled / archived</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Current Network Status</span>
            <div className="flex items-center gap-1.5 pt-0.5">
              <span className={`w-2 h-2 rounded-full ${isCurrentIpCovered ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
              <span className="text-xs font-bold text-slate-900 truncate">
                {isCurrentIpCovered ? "On-Premises Authorized" : "Remote / External IP"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-1 pt-0.5">
              <span className="text-[10px] font-mono text-slate-500 truncate block">
                IP: {currentIp || "Detecting…"}
              </span>
              {!isCurrentIpCovered && currentIp && isOwnerOrHR && (
                <button
                  type="button"
                  disabled={isQuickAuthorizing}
                  onClick={handleAuthorizeCurrentIp}
                  className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-semibold transition cursor-pointer disabled:opacity-50 shrink-0"
                  title="Authorize your current IP for attendance check-in"
                >
                  {isQuickAuthorizing ? "…" : "＋ Authorize"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* --- COMPANY NETWORKS TABLE CARD --- */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs">
        {/* Search & Filter Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="relative w-full sm:max-w-xs">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search network name, IP, description…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200/80 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-white border border-slate-200/80 text-slate-800 text-xs font-medium rounded-xl px-3.5 py-2 focus:outline-none focus:border-blue-500 w-full sm:w-auto cursor-pointer shadow-2xs"
            >
              <option value="all">All Statuses ({totalCount})</option>
              <option value="active">Active ({activeCount})</option>
              <option value="inactive">Inactive ({inactiveCount})</option>
            </select>

            <span className="text-xs font-mono font-semibold text-slate-500 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200/80 shadow-2xs whitespace-nowrap">
              {filteredNetworks.length} of {totalCount}
            </span>
          </div>
        </div>

        {/* Table Content */}
        {loading ? (
          <div className="py-16 flex items-center justify-center gap-2.5 text-slate-500 text-xs">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span>Loading company networks…</span>
          </div>
        ) : filteredNetworks.length === 0 ? (
          <div className="py-16 text-center space-y-3 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center mx-auto text-xl">
              📶
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-800">
                {networks.length === 0
                  ? "No Company Networks Configured"
                  : "No Matching Company Networks"}
              </p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {networks.length === 0
                  ? "Add your first company network or office Wi-Fi IP to enable network-based attendance control."
                  : `No networks match "${searchQuery}". Try a different keyword or filter.`}
              </p>
            </div>
            {isOwnerOrHR && networks.length === 0 && (
              <button
                type="button"
                onClick={handleOpenAddModal}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors shadow-xs shadow-blue-600/20 cursor-pointer"
              >
                <span>＋ Add First Company Network</span>
              </button>
            )}
          </div>
        ) : (
          <div className="border border-slate-200/80 rounded-xl overflow-hidden shadow-2xs bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[650px]">
                <thead className="bg-slate-50/90 border-b border-slate-200/80 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-5">Network Name &amp; Info</th>
                    <th className="py-3 px-5">Network IP Address</th>
                    <th className="py-3 px-5">Status</th>
                    <th className="py-3 px-5">Created Date</th>
                    <th className="py-3 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredNetworks.map((net) => {
                    const isActive = net.status === "active";
                    const isDeleting = isDeletingId === net.id;

                    return (
                      <tr key={net.id} className="hover:bg-slate-50/80 transition-colors">
                        {/* Network Name & Description */}
                        <td className="py-3.5 px-5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200/70 text-blue-600 flex items-center justify-center shrink-0">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                              </svg>
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 text-xs truncate">{net.network_name}</div>
                              {net.description ? (
                                <div className="text-[11px] text-slate-500 truncate max-w-xs">{net.description}</div>
                              ) : (
                                <div className="text-[10px] text-slate-400 italic">No description</div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Network IP */}
                        <td className="py-3.5 px-5 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100/90 border border-slate-200 text-slate-800 font-mono text-xs font-semibold">
                            <span>{net.network_ip}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyIp(net.network_ip)}
                              className="text-slate-400 hover:text-slate-700 transition cursor-pointer"
                              title="Copy IP to clipboard"
                            >
                              {copiedIp === net.network_ip ? (
                                <span className="text-[10px] text-emerald-600 font-sans font-bold">Copied!</span>
                              ) : (
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(net)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border transition cursor-pointer ${
                              isActive
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
                            }`}
                            title="Click to toggle status"
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-slate-400"}`} />
                            <span>{isActive ? "Active" : "Inactive"}</span>
                          </button>
                        </td>

                        {/* Created Date */}
                        <td className="py-3.5 px-5 whitespace-nowrap font-mono text-slate-500 text-[11px]">
                          {net.created_at
                            ? new Date(net.created_at).toLocaleDateString([], {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })
                            : "—"}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(net)}
                              className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold transition cursor-pointer"
                              title="Edit Network"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => handleDeleteNetwork(net)}
                              className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                              title="Delete Network"
                            >
                              {isDeleting ? "…" : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Company Network Popup Modal */}
      <AddCompanyNetworkModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setNetworkToEdit(null);
        }}
        networkToEdit={networkToEdit}
        onNetworkSaved={handleNetworkSaved}
      />
    </div>
  );
}
