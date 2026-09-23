"use client";

import React, { useState, useEffect } from "react";
import { authFetch } from "@/lib/api/authFetch";

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

  const [detectedData, setDetectedData] = useState(null);

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
      setDetectedData(null);
    }
  }, [isOpen, networkToEdit]);

  if (!isOpen) return null;

  // Auto-detect client IP helper with dual-stack support and IPv6 /64 subnet calculation
  const handleDetectCurrentIp = async () => {
    setIsDetectingIp(true);
    setFormError("");
    try {
      let detectedIp = "";
      let isIpv6 = false;
      let subnetCidr = null;

      const res = await authFetch("/api/company/networks/detect");
      if (res.ok) {
        const data = await res.json();
        if (data.ip) {
          detectedIp = data.ip;
          isIpv6 = Boolean(data.isIpv6);
          subnetCidr = data.ipv6SubnetCidr || null;
        }
      }

      // Public IP fallback check for client browser if localhost or empty
      if (!detectedIp || detectedIp === "127.0.0.1") {
        try {
          const ipifyRes = await fetch("https://api64.ipify.org?format=json");
          if (ipifyRes.ok) {
            const ipData = await ipifyRes.json();
            if (ipData?.ip) {
              detectedIp = ipData.ip;
              isIpv6 = detectedIp.includes(":");
              if (isIpv6) {
                const parts = detectedIp.split(":").filter(Boolean);
                if (parts.length >= 4) {
                  subnetCidr = `${parts.slice(0, 4).join(":")}::/64`;
                }
              }
            }
          }
        } catch (_) {}
      }

      if (!detectedIp) detectedIp = "127.0.0.1";

      setDetectedData({
        ip: detectedIp,
        isIpv6,
        subnetCidr,
      });

      // Default to subnet CIDR if IPv6 for maximum compatibility across laptop and mobile, otherwise exact IP
      if (isIpv6 && subnetCidr) {
        setNetworkIp(subnetCidr);
        if (!networkName) setNetworkName("Office Wi-Fi (IPv6 Subnet)");
      } else {
        setNetworkIp(detectedIp);
        if (!networkName) setNetworkName(`Office Network (${detectedIp})`);
      }
    } catch (_) {
      setNetworkIp("127.0.0.1");
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

      const res = await authFetch("/api/company/networks", {
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
          <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-2">
            <label className="sm:w-36 text-sm text-slate-700 font-medium shrink-0 pt-1">
              <span className="border-b-2 border-rose-500 pb-0.5">
                Network IP
              </span>
            </label>
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  required
                  placeholder="e.g., 49.204.120.15, 192.168.1.0/24, 2401:4900:.../64, or * for all"
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
                  {isDetectingIp ? "Detecting…" : "Auto-Detect IP"}
                </button>
              </div>

              {/* Detected IP suggestions and quick presets */}
              {detectedData && (
                <div className="p-2.5 rounded bg-blue-50/70 border border-blue-200 text-xs space-y-1.5 animate-fadeIn">
                  <div className="text-blue-900 font-semibold flex items-center gap-1.5">
                    <span>📡 Detected Connection:</span>
                    <span className="font-mono text-blue-700">{detectedData.ip}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {detectedData.subnetCidr && (
                      <button
                        type="button"
                        onClick={() => {
                          setNetworkIp(detectedData.subnetCidr);
                          if (!networkName || networkName.includes("Office")) {
                            setNetworkName("Office Wi-Fi (Subnet /64)");
                          }
                        }}
                        className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium transition cursor-pointer text-[11px] shadow-2xs"
                      >
                        ⚡ Use Subnet: {detectedData.subnetCidr} (Recommended for all Wi-Fi devices)
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setNetworkIp(detectedData.ip);
                        if (!networkName || networkName.includes("Office")) {
                          setNetworkName(`Office IP (${detectedData.ip})`);
                        }
                      }}
                      className="px-2 py-1 rounded bg-white hover:bg-slate-100 border border-blue-300 text-blue-700 font-medium transition cursor-pointer text-[11px]"
                    >
                      Exact IP: {detectedData.ip}
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Presets */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-xs text-slate-600 font-medium">Presets:</span>
                <button
                  type="button"
                  onClick={() => {
                    setNetworkIp("*");
                    if (!networkName) setNetworkName("Allow All Networks (Remote Work)");
                  }}
                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 border border-slate-200 text-slate-700 text-[11px] transition cursor-pointer"
                >
                  🌐 Allow All Networks (*)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNetworkIp("127.0.0.1");
                    if (!networkName) setNetworkName("Localhost Dev");
                  }}
                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-[11px] transition cursor-pointer font-mono"
                >
                  127.0.0.1
                </button>
              </div>
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
