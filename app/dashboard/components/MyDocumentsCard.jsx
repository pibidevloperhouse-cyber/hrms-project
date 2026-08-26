"use client";

import React, { useState, useEffect } from "react";

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function getFileFormatDetails(fileType, docType, fileName) {
  const ext = fileName?.split('.').pop()?.toUpperCase() || 'FILE';
  
  if (docType === "SALARY_PAYSLIP" || docType === "PAYSLIP") {
    return { icon: "💳", color: "bg-emerald-50 text-emerald-700 border-emerald-200", badge: "PAYSLIP", ext };
  }
  if (docType === "OFFER_LETTER") {
    return { icon: "📜", color: "bg-indigo-50 text-indigo-700 border-indigo-200", badge: "OFFER LETTER", ext };
  }
  if (docType === "EXPERIENCE_CERTIFICATE") {
    return { icon: "🎓", color: "bg-purple-50 text-purple-700 border-purple-200", badge: "EXPERIENCE CERTIFICATE", ext };
  }
  if (docType === "PERSONAL_DETAILS" || docType === "PERSONAL_INFORMATION") {
    return { icon: "👤", color: "bg-amber-50 text-amber-700 border-amber-200", badge: "PERSONAL DETAILS", ext };
  }
  if (fileType?.includes("pdf") || fileName?.endsWith(".pdf")) {
    return { icon: "📕", color: "bg-rose-50 text-rose-700 border-rose-200", badge: "PDF", ext: "PDF" };
  }
  if (fileType?.includes("image") || /\.(png|jpe?g|webp|gif)$/i.test(fileName || "")) {
    return { icon: "🖼️", color: "bg-amber-50 text-amber-700 border-amber-200", badge: "IMAGE", ext: ext || "IMG" };
  }
  if (fileType?.includes("word") || fileType?.includes("document") || /\.(docx?|rtf)$/i.test(fileName || "")) {
    return { icon: "📘", color: "bg-sky-50 text-sky-700 border-sky-200", badge: "DOC", ext: ext || "DOC" };
  }
  return { icon: "📄", color: "bg-slate-100 text-slate-700 border-slate-200", badge: "DOCUMENT", ext };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Extracts the pay period (month + year) from a payslip document.
 * Primary: parses "MonthName YYYY" from the document name (e.g., "August 2026 - John Doe")
 * Fallback: uses the document's createdAt upload date
 */
function getPayslipPeriod(doc) {
  if (doc?.documentName) {
    const nameMatch = doc.documentName.match(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i
    );
    if (nameMatch) {
      const monthIdx = MONTH_NAMES.findIndex(
        (m) => m.toLowerCase() === nameMatch[1].toLowerCase()
      );
      if (monthIdx !== -1) {
        return { month: monthIdx, year: parseInt(nameMatch[2], 10) };
      }
    }
  }
  // Fallback to upload date
  const d = new Date(doc?.createdAt);
  return { month: d.getMonth(), year: d.getFullYear() };
}

export default function MyDocumentsCard() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [errorNotice, setErrorNotice] = useState("");
  const [downloadingId, setDownloadingId] = useState(null);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Payslip calendar filter state
  const [selectedMonth, setSelectedMonth] = useState(null); // 0-11 or null
  const [selectedYear, setSelectedYear] = useState(null);   // e.g. 2026 or null

  const isPayslipTab = selectedType === "SALARY_PAYSLIP" || selectedType === "PAYSLIP";

  // Preview Modal State
  const [previewDoc, setPreviewDoc] = useState(null);

  const fetchMyDocuments = async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      else setIsSyncing(true);

      setErrorNotice("");

      const res = await fetch("/api/documents/list?mode=mine");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
        setLastSyncTime(new Date());
      } else {
        const errJson = await res.json().catch(() => ({}));
        setErrorNotice(errJson.message || "Failed to load your workspace documents.");
      }
    } catch (err) {
      console.error("Error fetching my documents:", err);
      setErrorNotice("Network error loading your documents.");
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  };

  // Initial fetch + background polling (every 10 seconds)
  useEffect(() => {
    fetchMyDocuments(false);
    const interval = setInterval(() => {
      fetchMyDocuments(true);
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const handleDownloadDocument = async (doc) => {
    setDownloadingId(doc.id);
    try {
      const res = await fetch(`/api/documents/download?id=${doc.id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.message || "Failed to download file.");
        return;
      }

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = blobUrl;
      a.download = doc.documentName || "document.pdf";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Error downloading file onto device:", err);
      alert("Network error downloading file to device.");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleOpenPreview = (doc) => {
    setPreviewDoc(doc);
  };

  const getUpperType = (d) => (d?.documentType || "").toUpperCase();

  const filtered = documents.filter((doc) => {
    const docTypeUpper = getUpperType(doc);
    let matchesType = true;

    if (selectedType && selectedType !== "ALL") {
      if (selectedType === "PERSONAL_INFORMATION") {
        matchesType = ["PERSONAL_INFORMATION", "PERSONAL_DETAILS", "OFFER_LETTER", "EXPERIENCE_CERTIFICATE", "OTHER"].includes(docTypeUpper);
      } else if (selectedType === "PERSONAL_DETAILS") {
        matchesType = ["PERSONAL_DETAILS", "PERSONAL_INFORMATION"].includes(docTypeUpper);
      } else if (selectedType === "SALARY_PAYSLIP" || selectedType === "PAYSLIP") {
        matchesType = ["SALARY_PAYSLIP", "PAYSLIP"].includes(docTypeUpper);
      } else {
        matchesType = docTypeUpper === selectedType.toUpperCase();
      }
    }

    // Payslip month/year filter
    if (matchesType && isPayslipTab && selectedMonth !== null && selectedYear !== null) {
      const period = getPayslipPeriod(doc);
      if (period.month !== selectedMonth || period.year !== selectedYear) {
        return false;
      }
    }

    const q = searchQuery ? searchQuery.trim().toLowerCase() : "";
    let matchesQuery = true;
    if (q) {
      matchesQuery =
        (doc.documentName && doc.documentName.toLowerCase().includes(q)) ||
        (doc.notes && doc.notes.toLowerCase().includes(q)) ||
        (doc.documentType && doc.documentType.toLowerCase().includes(q)) ||
        (doc.uploadedBy && doc.uploadedBy.toLowerCase().includes(q));
    }
    return matchesType && matchesQuery;
  });

  const personalDocsCount = documents.filter((d) =>
    ["PERSONAL_INFORMATION", "PERSONAL_DETAILS", "OFFER_LETTER", "EXPERIENCE_CERTIFICATE", "OTHER"].includes(getUpperType(d))
  ).length;

  const personalDetailsCount = documents.filter((d) =>
    ["PERSONAL_DETAILS", "PERSONAL_INFORMATION"].includes(getUpperType(d))
  ).length;

  const offerLetterCount = documents.filter((d) => getUpperType(d) === "OFFER_LETTER").length;
  const experienceCertCount = documents.filter((d) => getUpperType(d) === "EXPERIENCE_CERTIFICATE").length;
  const payslipsCount = documents.filter((d) => ["SALARY_PAYSLIP", "PAYSLIP"].includes(getUpperType(d))).length;

  // Compute available years from payslip documents for the year navigator
  const payslipDocs = documents.filter((d) => ["SALARY_PAYSLIP", "PAYSLIP"].includes(getUpperType(d)));
  const payslipYears = [...new Set(payslipDocs.map((d) => getPayslipPeriod(d).year))].sort((a, b) => b - a);
  const currentNow = new Date();
  const defaultYear = payslipYears.length > 0 ? payslipYears[0] : currentNow.getFullYear();
  const defaultMonth = currentNow.getMonth();

  // Count payslips per month for the selected year (used for badges in the month grid)
  const payslipCountsByMonth = {};
  if (isPayslipTab && selectedYear !== null) {
    payslipDocs.forEach((d) => {
      const p = getPayslipPeriod(d);
      if (p.year === selectedYear) {
        payslipCountsByMonth[p.month] = (payslipCountsByMonth[p.month] || 0) + 1;
      }
    });
  }

  const totalBytes = documents.reduce((sum, d) => sum + (Number(d.fileSize) || 0), 0);

  // Handle tab change — initialize or reset payslip filter
  const handleTabChange = (tabId) => {
    setSelectedType(tabId);
    if (tabId === "SALARY_PAYSLIP" || tabId === "PAYSLIP") {
      // Initialize calendar to current month/year when entering payslip tab
      setSelectedYear(defaultYear);
      setSelectedMonth(defaultMonth);
    } else {
      // Clear filter when leaving payslip tab
      setSelectedMonth(null);
      setSelectedYear(null);
    }
  };

  return (
    <div className="bg-white border border-sky-100 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xs">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-sky-100 pb-5">
        <div>

          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2 tracking-tight">
            Employee Document Vault
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Secure file repository for your official HR documents, employment records, and payslips.
          </p>
        </div>

        {/* Quick Stats Banner */}
        <div className="flex items-center gap-2 sm:gap-3 bg-sky-50/60 p-2.5 rounded-2xl border border-sky-100 self-start md:self-auto">
          <div className="px-3 py-1 bg-white rounded-xl border border-sky-100 text-center">
            <span className="block text-[10px] uppercase font-bold text-slate-400">Total Files</span>
            <span className="text-sm font-extrabold text-slate-800">{documents.length}</span>
          </div>
          <div className="px-3 py-1 bg-white rounded-xl border border-sky-100 text-center">
            <span className="block text-[10px] uppercase font-bold text-slate-400">Personal</span>
            <span className="text-sm font-extrabold text-sky-700">{personalDocsCount}</span>
          </div>
          <div className="px-3 py-1 bg-white rounded-xl border border-sky-100 text-center">
            <span className="block text-[10px] uppercase font-bold text-slate-400">Payslips</span>
            <span className="text-sm font-extrabold text-emerald-700">{payslipsCount}</span>
          </div>
          <div className="px-3 py-1 bg-white rounded-xl border border-sky-100 text-center hidden sm:block">
            <span className="block text-[10px] uppercase font-bold text-slate-400">Vault Storage</span>
            <span className="text-sm font-extrabold text-slate-800">{formatBytes(totalBytes)}</span>
          </div>
          <button
            onClick={() => fetchMyDocuments(false)}
            className="p-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition cursor-pointer shadow-2xs ml-1"
            title="Refresh"
          >
            🔄
          </button>
        </div>
      </div>

      {/* Error Notice */}
      {errorNotice && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between">
          <span>⚠️ {errorNotice}</span>
          <button onClick={() => setErrorNotice("")} className="text-rose-700">✕</button>
        </div>
      )}

      {/* Category Navigation & Search */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-sky-50/30 p-2.5 rounded-2xl border border-sky-100">
        <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {[
            { id: "ALL", label: `📁 All Files (${documents.length})` },
            { id: "PERSONAL_INFORMATION", label: `👤 Personal Records (${personalDocsCount})` },
            { id: "PERSONAL_DETAILS", label: `📄 Details (${personalDetailsCount})` },
            { id: "OFFER_LETTER", label: `📜 Offer Letters (${offerLetterCount})` },
            { id: "EXPERIENCE_CERTIFICATE", label: `🎓 Certificates (${experienceCertCount})` },
            { id: "SALARY_PAYSLIP", label: `💳 Payslips (${payslipsCount})` },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleTabChange(cat.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition whitespace-nowrap cursor-pointer ${
                selectedType === cat.id
                  ? "bg-sky-600 text-white shadow-md shadow-sky-500/20"
                  : "bg-white text-slate-700 border border-sky-200 hover:bg-sky-50"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
          <input
            type="text"
            placeholder="Search by file name or notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-sky-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-sky-500"
          />
        </div>
      </div>

      {/* Payslip Calendar Month/Year Picker */}
      {isPayslipTab && (
        <div className="bg-gradient-to-br from-emerald-50/80 via-white to-sky-50/60 border border-emerald-200/60 rounded-2xl p-4 sm:p-5 space-y-3 shadow-sm">
          {/* Header Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">📅</span>
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Filter by Pay Period</h3>
            </div>
            <button
              onClick={() => { setSelectedMonth(null); setSelectedYear(null); }}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                selectedMonth === null && selectedYear === null
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
                  : "bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50"
              }`}
            >
              Show All Payslips
            </button>
          </div>

          {/* Year Navigator */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => {
                const prevYear = (selectedYear || defaultYear) - 1;
                const minYear = payslipYears.length > 0 ? Math.min(...payslipYears) : currentNow.getFullYear() - 5;
                if (prevYear >= minYear - 1) {
                  setSelectedYear(prevYear);
                  setSelectedMonth(null);
                }
              }}
              disabled={(() => {
                const minYear = payslipYears.length > 0 ? Math.min(...payslipYears) : currentNow.getFullYear() - 5;
                return (selectedYear || defaultYear) <= minYear - 1;
              })()}
              className="w-8 h-8 rounded-xl bg-white border border-emerald-200 hover:bg-emerald-50 text-emerald-700 font-bold text-sm flex items-center justify-center transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ◀
            </button>
            <span className="text-lg font-black text-slate-900 min-w-[60px] text-center tabular-nums">
              {selectedYear || defaultYear}
            </span>
            <button
              onClick={() => {
                const nextYear = (selectedYear || defaultYear) + 1;
                if (nextYear <= currentNow.getFullYear() + 1) {
                  setSelectedYear(nextYear);
                  setSelectedMonth(null);
                }
              }}
              disabled={(selectedYear || defaultYear) >= currentNow.getFullYear() + 1}
              className="w-8 h-8 rounded-xl bg-white border border-emerald-200 hover:bg-emerald-50 text-emerald-700 font-bold text-sm flex items-center justify-center transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ▶
            </button>
          </div>

          {/* Month Grid */}
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-1.5">
            {MONTH_SHORT.map((label, idx) => {
              const isSelected = selectedMonth === idx && selectedYear !== null;
              const count = payslipCountsByMonth[idx] || 0;
              const isCurrentMonth = idx === currentNow.getMonth() && (selectedYear || defaultYear) === currentNow.getFullYear();

              return (
                <button
                  key={idx}
                  onClick={() => {
                    setSelectedMonth(idx);
                    if (selectedYear === null) setSelectedYear(defaultYear);
                  }}
                  className={`relative px-2 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer text-center ${
                    isSelected
                      ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 scale-105"
                      : count > 0
                        ? "bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 hover:shadow-sm"
                        : "bg-slate-50/80 text-slate-400 border border-slate-100 hover:bg-slate-100 hover:text-slate-600"
                  }`}
                >
                  <span className="block">{label}</span>
                  {count > 0 && (
                    <span className={`block text-[9px] mt-0.5 font-extrabold ${
                      isSelected ? "text-emerald-100" : "text-emerald-500"
                    }`}>
                      {count} {count === 1 ? "file" : "files"}
                    </span>
                  )}
                  {isCurrentMonth && !isSelected && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-sky-500 rounded-full ring-2 ring-white" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Active filter indicator */}
          {selectedMonth !== null && selectedYear !== null && (
            <div className="flex items-center justify-center gap-2 pt-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-600/10 text-emerald-700 text-[11px] font-bold border border-emerald-200">
                <span>📋</span>
                Showing payslips for <strong>{MONTH_NAMES[selectedMonth]} {selectedYear}</strong>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Document File List */}
      {loading ? (
        <div className="py-20 text-center space-y-3">
          <div className="w-9 h-9 border-3 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-semibold text-slate-500">Loading documents...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center space-y-3 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
          <div className="text-5xl">{isPayslipTab && selectedMonth !== null ? "💳" : "📁"}</div>
          <p className="text-sm font-extrabold text-slate-800">
            {isPayslipTab && selectedMonth !== null && selectedYear !== null
              ? `No Payslips for ${MONTH_NAMES[selectedMonth]} ${selectedYear}`
              : "No Files Stored Yet"}
          </p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {isPayslipTab && selectedMonth !== null && selectedYear !== null
              ? `Your HR manager has not uploaded any payslips for ${MONTH_NAMES[selectedMonth]} ${selectedYear}. Try selecting a different month or click "Show All Payslips" to view all.`
              : `Your HR manager has not uploaded any ${selectedType !== "ALL" ? selectedType.replace("_", " ").toLowerCase() : "files"} for you yet.`}
          </p>
        </div>
      ) : (
        <div className="border border-sky-100 rounded-2xl overflow-hidden shadow-2xs bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-sky-50/80 border-b border-sky-100 text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">
                  <th className="py-3.5 px-4 sm:px-6">Document Name</th>
                  {(selectedType === "ALL" || selectedType === "PERSONAL_INFORMATION") && (
                    <th className="py-3.5 px-4">Category</th>
                  )}
                  <th className="py-3.5 px-4 hidden md:table-cell">File Size</th>
                  <th className="py-3.5 px-4 hidden lg:table-cell">Date Uploaded</th>
                  <th className="py-3.5 px-4 hidden sm:table-cell">HR Uploader</th>
                  <th className="py-3.5 px-4 text-right pr-6">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-100/70 text-xs">
                {filtered.map((doc) => {
                  const format = getFileFormatDetails(doc.fileType, doc.documentType, doc.documentName);
                  const isDownloading = downloadingId === doc.id;

                  return (
                    <tr
                      key={doc.id}
                      className="hover:bg-sky-50/40 transition-colors group"
                    >
                      {/* Document Name & Format Badge */}
                      <td className="py-4 px-4 sm:px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-xl shrink-0 group-hover:scale-105 transition-transform">
                            {format.icon}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-extrabold text-slate-900 group-hover:text-sky-600 transition truncate max-w-xs sm:max-w-md">
                              {doc.documentName}
                            </h4>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] font-mono text-slate-400">
                                .{format.ext}
                              </span>
                              {doc.notes && (
                                <span className="text-[10px] text-slate-500 italic bg-amber-50 px-2 py-0.5 rounded border border-amber-100 max-w-xs truncate">
                                  &quot;{doc.notes}&quot;
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Category Badge */}
                      {(selectedType === "ALL" || selectedType === "PERSONAL_INFORMATION") && (
                        <td className="py-4 px-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border ${format.color}`}>
                            <span>{format.badge}</span>
                          </span>
                        </td>
                      )}

                      {/* File Size */}
                      <td className="py-4 px-4 whitespace-nowrap font-mono text-slate-500 hidden md:table-cell">
                        {formatBytes(doc.fileSize)}
                      </td>

                      {/* Date Uploaded */}
                      <td className="py-4 px-4 whitespace-nowrap text-slate-500 font-mono hidden lg:table-cell">
                        {new Date(doc.createdAt).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>

                      {/* Uploaded By */}
                      <td className="py-4 px-4 whitespace-nowrap text-slate-700 font-medium hidden sm:table-cell">
                        <span className="inline-flex items-center gap-1">
                          <span>👤</span>
                          <span>{doc.uploadedBy}</span>
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 text-right whitespace-nowrap pr-6">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenPreview(doc)}
                            className="px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 font-extrabold text-xs transition flex items-center gap-1 cursor-pointer"
                            title="View Document"
                          >
                            <span>👁️</span>
                            <span className="hidden sm:inline">View</span>
                          </button>

                          <button
                            onClick={() => handleDownloadDocument(doc)}
                            disabled={isDownloading}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs transition flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                            title="Save Document to Device"
                          >
                            {isDownloading ? (
                              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <span>⬇️</span>
                            )}
                            <span className="hidden sm:inline">{isDownloading ? "Saving..." : "Download"}</span>
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

      {/* Document Viewer Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl border border-sky-100 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-sky-100 bg-sky-50/40">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-sky-600 text-white flex items-center justify-center text-lg font-bold">
                  {getFileFormatDetails(previewDoc.fileType, previewDoc.documentType, previewDoc.documentName).icon}
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    {previewDoc.documentName}
                  </h3>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span>Uploaded by {previewDoc.uploadedBy}</span>
                    <span>•</span>
                    <span className="font-mono">{formatBytes(previewDoc.fileSize)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={previewDoc.downloadUrl || previewDoc.signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-bold transition flex items-center gap-1"
                >
                  <span>🔗</span> Open in New Tab
                </a>
                <button
                  onClick={() => handleDownloadDocument(previewDoc)}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <span>⬇️</span> Download
                </button>
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition cursor-pointer ml-1"
                  title="Close Viewer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Viewer Body */}
            <div className="flex-1 bg-slate-100 p-4 overflow-auto min-h-[450px] flex items-center justify-center">
              {previewDoc.fileType?.includes("pdf") || previewDoc.documentName?.endsWith(".pdf") ? (
                <iframe
                  src={previewDoc.signedUrl || previewDoc.downloadUrl}
                  className="w-full h-[65vh] rounded-2xl border border-slate-200 shadow-inner bg-white"
                  title={previewDoc.documentName}
                />
              ) : previewDoc.fileType?.includes("image") || /\.(png|jpe?g|webp|gif)$/i.test(previewDoc.documentName || "") ? (
                <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-md max-h-[65vh] overflow-auto flex items-center justify-center">
                  <img
                    src={previewDoc.signedUrl || previewDoc.downloadUrl}
                    alt={previewDoc.documentName}
                    className="max-h-[60vh] object-contain rounded-xl"
                  />
                </div>
              ) : (
                <div className="text-center p-8 bg-white rounded-3xl border border-sky-100 max-w-md shadow-lg space-y-4">
                  <div className="text-6xl">📄</div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-base">{previewDoc.documentName}</h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Direct preview is available for PDFs and images. For Word or text files, open in new tab or download to view.
                    </p>
                  </div>
                  {previewDoc.notes && (
                    <div className="p-3 bg-sky-50 rounded-xl text-xs text-sky-900 border border-sky-100 text-left">
                      <strong>HR Notes:</strong> &quot;{previewDoc.notes}&quot;
                    </div>
                  )}
                  <div className="pt-2 flex justify-center gap-3">
                    <a
                      href={previewDoc.downloadUrl || previewDoc.signedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition"
                    >
                      Open File in Browser
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
