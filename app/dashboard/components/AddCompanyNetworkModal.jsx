"use client";

import React, { useState, useEffect } from "react";

/**
 * AddCompanyNetworkModal Component
 * Implements the exact Create Sprint popup design language (clean underline fields, blue accents, red square close button).
 */
export default function AddCompanyNetworkModal({
  isOpen,
  onClose,
  onNetworkSaved,
  networkToEdit = null,
}) {
  const [networkName, setNetworkName] = useState("");
  const [networkIp, setNetworkIp] = useState("");
  const [status, setStatus] = useState("active"); // "active" | "inactive"
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDetectingIp, setIsDetectingIp] = useState(false);
  const [formError, setFormError] = useState("");

  const isEditing = Boolean(networkToEdit?.id);

  // Initialize or reset form data when opened / changed
  useEffect(() => {
    if (isOpen) {
      if (networkToEdit) {
        setNetworkName(networkToEdit.network_name || "");
        setNetworkIp(networkToEdit.network_ip || "");
        setStatus(networkToEdit.status || "active");
        setDescription(networkToEdit.description || "");
      } else {
        setNetworkName("");
        setNetworkIp("");
        setStatus("active");
        setDescription("");
      }
      setFormError("");
    }
  }, [isOpen, networkToEdit]);

  if (!isOpen) return null;

  // Auto-detect client IP helper
  const handleDetectCurrentIp = async () => {
    setIsDetectingIp(true);
    try {
      const res = await fetch("/api/company/networks/detect");
      if (res.ok) {
        const data = await res.json();
        if (data.ip) {
          setNetworkIp(data.ip);
        }
      }
    } catch (err) {
      console.warn("Could not auto-detect IP:", err);
    } finally {
      setIsDetectingIp(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    const trimmedName = networkName.trim();
    const trimmedIp = networkIp.trim();

    if (!trimmedName) {
      setFormError("Network Name is required.");
      return;
    }

    if (!trimmedIp) {
      setFormError("Network IP is required.");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        network_name: trimmedName,
        network_ip: trimmedIp,
        status: status === "inactive" ? "inactive" : "active",
        description: description.trim(),
      };

      if (isEditing) {
        payload.id = networkToEdit.id;
      }

      const res = await fetch("/api/company/networks", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.message || "Failed to save company network.");
      } else {
        if (onNetworkSaved) {
          onNetworkSaved(data.network || payload, isEditing);
        }
        onClose();
      }
    } catch (err) {
      console.error("Save network error:", err);
      setFormError("Network error. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto animate-fadeIn"
    >
      <div className="relative w-full max-w-xl bg-white rounded-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col m-auto my-auto animate-scaleIn">
        {/* Top Header matching exact Create Sprint format */}
        <div className="px-6 pt-5 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-3 text-base">
            <span className="font-bold text-slate-900">
              {isEditing ? "Edit:" : "Create:"}
            </span>
            <span className="text-blue-600 font-semibold border-b-2 border-blue-600 pb-0.5 text-sm">
              Company Network
            </span>
          </div>

          {/* Red square close button */}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="w-6 h-6 border border-rose-300 hover:border-rose-400 text-rose-400 hover:text-rose-600 rounded flex items-center justify-center text-xs transition cursor-pointer disabled:opacity-50"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4 max-h-[80vh] overflow-y-auto">
          {formError && (
            <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {formError}
            </div>
          )}

          {/* Row: Network Name with red underline indicator */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2">
            <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
              <span className="border-b-2 border-rose-500 pb-0.5">
                Network Name
              </span>
            </label>
            <div className="flex-1">
              <input
                type="text"
                required
                autoFocus
                placeholder="e.g., Headquarters Wi-Fi 5G, Branch Office LAN"
                value={networkName}
                onChange={(e) => setNetworkName(e.target.value)}
                className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-1 text-sm bg-transparent text-slate-900 transition-colors placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Row: Network IP with red underline indicator and Detect button */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2">
            <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
              <span className="border-b-2 border-rose-500 pb-0.5">
                Network IP
              </span>
            </label>
            <div className="flex-1 flex items-center gap-2">
              <input
                type="text"
                required
                placeholder="e.g., 192.168.1.1 or 49.204.120.15"
                value={networkIp}
                onChange={(e) => setNetworkIp(e.target.value)}
                className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-1 text-sm bg-transparent text-slate-900 font-mono transition-colors placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={handleDetectCurrentIp}
                disabled={isDetectingIp}
                className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-medium transition cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
                title="Detect My Current IP"
              >
                {isDetectingIp ? "Detecting…" : "Detect My IP"}
              </button>
            </div>
          </div>

          {/* Section Divider: Network Configuration */}
          <div className="text-blue-600 font-semibold border-b border-blue-500 pb-1 text-sm pt-3">
            Network Configuration
          </div>

          {/* Row: Status Preset Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
            <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0">
              Status
            </label>
            <div className="flex-1 flex items-center gap-2 border-b border-slate-300 pb-1.5">
              {[
                { label: "Active", value: "active", activeColor: "bg-emerald-600 text-white border-emerald-600" },
                { label: "Inactive", value: "inactive", activeColor: "bg-slate-700 text-white border-slate-700" },
              ].map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setStatus(preset.value)}
                  className={`px-3 py-0.5 rounded text-xs font-medium transition cursor-pointer border ${
                    status === preset.value
                      ? `${preset.activeColor} shadow-2xs`
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Row: Description / Office Notes */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-2">
            <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0 pt-1">
              Description
            </label>
            <div className="flex-1">
              <textarea
                rows={2}
                placeholder="Optional notes (e.g., 2nd floor router, authorized for attendance check-in)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full border-b border-slate-300 focus:border-blue-600 outline-none pb-1 text-sm bg-transparent text-slate-900 resize-none transition-colors placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Bottom Action Buttons: Blue Create & Clean Cancel */}
          <div className="pt-6 pb-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={isSubmitting || !networkName.trim() || !networkIp.trim()}
              className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition cursor-pointer disabled:opacity-50 shadow-xs"
            >
              {isSubmitting
                ? isEditing
                  ? "Updating…"
                  : "Creating…"
                : isEditing
                ? "Update Network"
                : "Create"}
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-sm transition cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
