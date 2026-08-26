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

function getRecommendedPayslipMonths(joiningDateStr) {
  const months = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed (0=Jan, 7=Aug)

  let startYear = currentYear;
  let startMonth = currentMonth - 11; // fallback past 12 months

  if (joiningDateStr) {
    const jDate = new Date(joiningDateStr);
    if (!isNaN(jDate.getTime())) {
      startYear = jDate.getFullYear();
      startMonth = jDate.getMonth();
    }
  }

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const endTotal = currentYear * 12 + currentMonth;
  let startTotal = startYear * 12 + startMonth;

  if (startTotal > endTotal) {
    startTotal = endTotal;
  }

  for (let t = endTotal; t >= startTotal; t--) {
    const y = Math.floor(t / 12);
    const m = ((t % 12) + 12) % 12;
    const name = `${monthNames[m]} ${y}`;
    const isCurrent = (y === currentYear && m === currentMonth);
    months.push({
      value: name,
      label: isCurrent ? `${name} (Current Month)` : name,
      year: y,
      month: m,
    });
  }

  return months;
}

const MONTH_NAMES_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const MONTH_SHORT_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
      const monthIdx = MONTH_NAMES_FULL.findIndex(
        (m) => m.toLowerCase() === nameMatch[1].toLowerCase()
      );
      if (monthIdx !== -1) {
        return { month: monthIdx, year: parseInt(nameMatch[2], 10) };
      }
    }
  }
  const d = new Date(doc?.createdAt);
  return { month: d.getMonth(), year: d.getFullYear() };
}

export default function EmployeeDocumentManager() {
  const [viewTab, setViewTab] = useState("directory"); // "directory" | "repository"
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("ALL");
  const [selectedDocType, setSelectedDocType] = useState("ALL"); // ALL | PERSONAL_INFORMATION | SALARY_PAYSLIP
  const [searchQuery, setSearchQuery] = useState("");
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  // Preview Modal States
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);

  // Payslip calendar filter state
  const [selectedMonth, setSelectedMonth] = useState(null); // 0-11 or null
  const [selectedYear, setSelectedYear] = useState(null);   // e.g. 2026 or null

  const isPayslipFilter = selectedDocType === "SALARY_PAYSLIP" || selectedDocType === "PAYSLIP";

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

  // Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    employeeId: "",
    category: "", // "PERSONAL_INFORMATION" | "SALARY_PAYSLIP"
    subType: "", // "PERSONAL_DETAILS" | "OFFER_LETTER" | "EXPERIENCE_CERTIFICATE"
    payslipMonth: "", // e.g. "August 2026"
    documentType: "",
    documentName: "",
    notes: "",
    file: null,
  });
  const [notice, setNotice] = useState({ error: "", success: "" });
  const [modalNotice, setModalNotice] = useState({ error: "", success: "" });

  const fetchEmployees = async () => {
    try {
      const res = await fetch("/api/employees/list");
      if (res.ok) {
        const data = await res.json();
        setEmployees(data.employees || []);
        if (data.employees?.length > 0 && !uploadForm.employeeId) {
          setUploadForm((prev) => ({ ...prev, employeeId: data.employees[0].id }));
        }
      }
    } catch (err) {
      console.error("Failed to fetch employees for document manager:", err);
    }
  };

  const fetchDocuments = async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      else setIsSyncing(true);

      setNotice({ error: "", success: "" });

      let url = `/api/documents/list?`;
      if (selectedEmployeeId && selectedEmployeeId !== "ALL") {
        url += `employeeId=${selectedEmployeeId}&`;
      }
      if (selectedDocType && selectedDocType !== "ALL") {
        url += `documentType=${selectedDocType}&`;
      }

      const res = await fetch(url);
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
        setNotice({ error: errJson.message || "Failed to load documents.", success: "" });
      }
    } catch (err) {
      console.error("Failed to fetch documents list:", err);
      setNotice({ error: "Network error loading documents.", success: "" });
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  useEffect(() => {
    fetchDocuments(false);
  }, [selectedEmployeeId, selectedDocType]);

  // Background Sync Interval (Every 10 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchDocuments(true);
    }, 10000);

    return () => clearInterval(interval);
  }, [selectedEmployeeId, selectedDocType]);

  const openUploadForEmployee = (empId, docType = "") => {
    let cat = "";
    let sub = "";
    const empObj = employees.find((e) => e.id === empId);
    const empName = empObj?.full_name || "Employee";
    const jDateStr = empObj?.joining_date || empObj?.created_at || "";
    const recMonths = getRecommendedPayslipMonths(jDateStr);
    const defaultMonth = recMonths[0]?.value || "";

    if (docType === "SALARY_PAYSLIP" || docType === "PAYSLIP") {
      cat = "SALARY_PAYSLIP";
      sub = "";
    } else if (docType) {
      cat = "PERSONAL_INFORMATION";
      sub = docType === "PERSONAL_INFORMATION" ? "PERSONAL_DETAILS" : docType;
    }

    setUploadForm({
      employeeId: empId,
      category: cat,
      subType: sub,
      payslipMonth: cat === "SALARY_PAYSLIP" ? defaultMonth : "",
      documentType: cat === "SALARY_PAYSLIP" ? "SALARY_PAYSLIP" : sub,
      documentName: cat === "SALARY_PAYSLIP" ? `${defaultMonth} - ${empName}` : "",
      notes: "",
      file: null,
    });
    setModalNotice({ error: "", success: "" });
    setShowUploadModal(true);
  };

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setUploadForm((prev) => ({
        ...prev,
        file: selectedFile,
        documentName: prev.documentName || selectedFile.name.replace(/\.[^/.]+$/, ""),
      }));
    }
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    setModalNotice({ error: "", success: "" });

    if (!uploadForm.employeeId) {
      setModalNotice({ error: "Please select an employee.", success: "" });
      return;
    }

    if (!uploadForm.category) {
      setModalNotice({ error: "Please select a document category (Personal Information or Salary Payslip).", success: "" });
      return;
    }

    if (uploadForm.category === "PERSONAL_INFORMATION" && !uploadForm.subType) {
      setModalNotice({ error: "Please select whether this document is Personal Details, Offer Letter, or Experience Certificate.", success: "" });
      return;
    }

    const finalDocType = uploadForm.category === "SALARY_PAYSLIP" ? "SALARY_PAYSLIP" : uploadForm.subType;

    if (!uploadForm.file) {
      setModalNotice({ error: "Please select a file to upload.", success: "" });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadForm.file);
      formData.append("employeeId", uploadForm.employeeId);
      formData.append("documentType", finalDocType);
      formData.append("documentName", uploadForm.documentName);
      formData.append("notes", uploadForm.notes);

      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setModalNotice({ error: data.message || "Upload failed.", success: "" });
      } else {
        setNotice({ error: "", success: data.message });
        setShowUploadModal(false);
        setUploadForm({
          employeeId: employees[0]?.id || "",
          category: "",
          subType: "",
          documentType: "",
          documentName: "",
          notes: "",
          file: null,
        });
        await fetchEmployees();
        await fetchDocuments(false);
      }
    } catch (err) {
      console.error("Upload error:", err);
      setModalNotice({ error: "Network error uploading file to storage.", success: "" });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocument = async (docId, docName) => {
    if (!confirm(`Are you sure you want to delete "${docName}"? This action will permanently remove the file from storage.`)) {
      return;
    }

    setDeletingId(docId);
    setNotice({ error: "", success: "" });

    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        setNotice({ error: data.message || "Failed to delete document.", success: "" });
      } else {
        setNotice({ error: "", success: data.message });
        if (previewDoc?.id === docId) setPreviewDoc(null);
        await fetchEmployees();
        await fetchDocuments(true);
      }
    } catch {
      setNotice({ error: "Network error deleting document.", success: "" });
    } finally {
      setDeletingId(null);
    }
  };

  // Filter employees for matrix table
  const filteredEmployees = employees.filter((emp) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      emp.full_name?.toLowerCase().includes(q) ||
      emp.email?.toLowerCase().includes(q) ||
      emp.department?.toLowerCase().includes(q) ||
      emp.role?.toLowerCase().includes(q)
    );
  });

  const getUpperType = (d) => (d?.documentType || "").toUpperCase();

  // Filter documents for repository view
  const filteredDocuments = documents.filter((doc) => {
    // Payslip month/year filter
    if (isPayslipFilter && selectedMonth !== null && selectedYear !== null) {
      const period = getPayslipPeriod(doc);
      if (period.month !== selectedMonth || period.year !== selectedYear) {
        return false;
      }
    }

    const q = searchQuery ? searchQuery.trim().toLowerCase() : "";
    if (!q) return true;
    return (
      (doc.documentName && doc.documentName.toLowerCase().includes(q)) ||
      (doc.employeeName && doc.employeeName.toLowerCase().includes(q)) ||
      (doc.department && doc.department.toLowerCase().includes(q)) ||
      (doc.documentType && doc.documentType.toLowerCase().includes(q)) ||
      (doc.notes && doc.notes.toLowerCase().includes(q))
    );
  });

  // Global counts
  const personalInfoCount = documents.filter((d) =>
    ["PERSONAL_INFORMATION", "PERSONAL_DETAILS", "OFFER_LETTER", "EXPERIENCE_CERTIFICATE", "OTHER"].includes(getUpperType(d))
  ).length;
  const salaryPayslipCount = documents.filter((d) =>
    ["SALARY_PAYSLIP", "PAYSLIP"].includes(getUpperType(d))
  ).length;
  const totalVaultBytes = documents.reduce((sum, d) => sum + (Number(d.fileSize) || 0), 0);

  // Compute available years and per-month counts for payslip calendar
  const payslipDocs = documents.filter((d) => ["SALARY_PAYSLIP", "PAYSLIP"].includes(getUpperType(d)));
  const payslipYears = [...new Set(payslipDocs.map((d) => getPayslipPeriod(d).year))].sort((a, b) => b - a);
  const currentNow = new Date();
  const defaultCalYear = payslipYears.length > 0 ? payslipYears[0] : currentNow.getFullYear();
  const defaultCalMonth = currentNow.getMonth();

  const payslipCountsByMonth = {};
  if (isPayslipFilter && selectedYear !== null) {
    payslipDocs.forEach((d) => {
      const p = getPayslipPeriod(d);
      if (p.year === selectedYear) {
        payslipCountsByMonth[p.month] = (payslipCountsByMonth[p.month] || 0) + 1;
      }
    });
  }

  // Handle category dropdown change — initialize/reset calendar filter
  const handleDocTypeChange = (newType) => {
    setSelectedDocType(newType);
    if (newType === "SALARY_PAYSLIP" || newType === "PAYSLIP") {
      setSelectedYear(defaultCalYear);
      setSelectedMonth(defaultCalMonth);
    } else {
      setSelectedMonth(null);
      setSelectedYear(null);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner Header */}
      <div className="bg-white border border-sky-100 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-sky-100 pb-5">
          <div>

            <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
              HR Document Distribution & Storage Hub
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Upload and manage Personal Information documents and Salary Payslips in private storage <code className="bg-sky-50 px-1.5 py-0.5 rounded text-sky-700 font-mono text-[11px]">employee-documents</code>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                setModalNotice({ error: "", success: "" });
                setUploadForm((prev) => ({
                  ...prev,
                  documentType: "",
                  documentName: "",
                  notes: "",
                  file: null,
                  employeeId: prev.employeeId || employees[0]?.id || "",
                }));
                setShowUploadModal(true);
              }}
              className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-bold transition flex items-center gap-2 shadow-md shadow-sky-500/20 cursor-pointer"
            >
              <span className="text-base">📤</span>
              <span>Upload File for Employee</span>
            </button>

            <button
              onClick={() => {
                fetchEmployees();
                fetchDocuments(false);
              }}
              className="p-2.5 rounded-2xl bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-semibold transition cursor-pointer"
              title="Refresh"
            >
              🔄
            </button>
          </div>
        </div>

        {/* View Switcher Sub-Tabs */}
        <div className="flex items-center gap-3 bg-sky-50/50 p-2 rounded-2xl border border-sky-100">
          <button
            onClick={() => setViewTab("directory")}
            className={`flex-1 py-3 px-4 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
              viewTab === "directory"
                ? "bg-sky-600 text-white shadow-md shadow-sky-500/20"
                : "text-slate-600 hover:text-slate-900 hover:bg-sky-100/60"
            }`}
          >
            <span className="text-base">👥</span>
            <span>All Staff Directory & Matrix ({employees.length})</span>
          </button>

          <button
            onClick={() => setViewTab("repository")}
            className={`flex-1 py-3 px-4 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
              viewTab === "repository"
                ? "bg-sky-600 text-white shadow-md shadow-sky-500/20"
                : "text-slate-600 hover:text-slate-900 hover:bg-sky-100/60"
            }`}
          >
            <span className="text-base">📁</span>
            <span>File Repository Table ({documents.length})</span>
          </button>
        </div>

        {/* Top Summary Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-sky-50/50 border border-sky-100 space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Registered Staff</span>
            <div className="text-2xl font-black text-slate-900">{employees.length}</div>
            <span className="text-[10px] text-slate-500">Company members</span>
          </div>

          <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100 space-y-1">
            <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider block">Total Documents</span>
            <div className="text-2xl font-black text-indigo-800">{documents.length}</div>
            <span className="text-[10px] text-indigo-600">{formatBytes(totalVaultBytes)} total</span>
          </div>

          <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-100 space-y-1">
            <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">Personal Information</span>
            <div className="text-2xl font-black text-amber-800">{personalInfoCount}</div>
            <span className="text-[10px] text-amber-600">Personal docs & forms</span>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100 space-y-1">
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Salary Payslips</span>
            <div className="text-2xl font-black text-emerald-800">{salaryPayslipCount}</div>
            <span className="text-[10px] text-emerald-600">Payslip documents</span>
          </div>
        </div>

        {/* Global Notices */}
        {notice.success && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between">
            <span>✓ {notice.success}</span>
            <button onClick={() => setNotice({ error: "", success: "" })} className="text-emerald-700">✕</button>
          </div>
        )}
        {notice.error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between">
            <span>⚠️ {notice.error}</span>
            <button onClick={() => setNotice({ error: "", success: "" })} className="text-rose-700">✕</button>
          </div>
        )}
      </div>

      {/* --- SUB-TAB 1: STAFF DIRECTORY & DOCUMENT MATRIX --- */}
      {viewTab === "directory" && (
        <div className="bg-white border border-sky-100 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-sky-100 pb-4">
            <div>
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <span>👥</span> Company Staff Document Matrix
              </h3>
              <p className="text-xs text-slate-500">
                View all company employees and check which files have been sent by HR.
              </p>
            </div>

            {/* Search Box */}
            <div className="relative w-full sm:w-72">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
              <input
                type="text"
                placeholder="Search staff name, email, department..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-sky-50/50 border border-sky-200 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-sky-500 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {filteredEmployees.length === 0 ? (
            <div className="py-12 text-center text-slate-500 space-y-2">
              <p className="text-3xl">👥</p>
              <p className="text-xs">No employees found in company directory.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[650px]">
                <thead className="bg-sky-50/50 border-b border-sky-100 text-sky-900 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3.5 px-4">Employee</th>
                    <th className="py-3.5 px-4">Department & Role</th>
                    <th className="py-3.5 px-4 text-center">Uploaded Files</th>
                    <th className="py-3.5 px-4 text-right">HR Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sky-100">
                  {filteredEmployees.map((emp) => {
                    const docSum = emp.docSummary || { totalDocs: 0 };
                    const initial = emp.full_name ? emp.full_name.charAt(0).toUpperCase() : "?";

                    return (
                      <tr key={emp.id} className="hover:bg-sky-50/50 transition">
                        {/* Employee info */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                              {initial}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 text-xs">{emp.full_name}</div>
                              <div className="text-[11px] text-slate-500 font-mono">{emp.email}</div>
                            </div>
                          </div>
                        </td>

                        {/* Department & Role */}
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-sky-50 text-sky-800 border border-sky-200">
                            {emp.department || "General"}
                          </span>
                          <div className="text-[10px] text-slate-500 capitalize mt-0.5">
                            {emp.designation || emp.role || "Staff"}
                          </div>
                        </td>

                        {/* Total Files Summary */}
                        <td className="py-3.5 px-4 text-center">
                          {docSum.totalDocs > 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200">
                              <span>📄</span>
                              <span>{docSum.totalDocs} {docSum.totalDocs === 1 ? "File" : "Files"} Uploaded</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
                              <span>📂</span>
                              <span>No files uploaded yet</span>
                            </span>
                          )}
                        </td>

                        {/* Direct HR Action Button */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openUploadForEmployee(emp.id)}
                              className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold transition flex items-center gap-1 shadow-2xs cursor-pointer"
                            >
                              <span>📤</span>
                              <span>Upload Document</span>
                            </button>

                            <button
                              onClick={() => {
                                setSelectedEmployeeId(emp.id);
                                setSelectedDocType("ALL");
                                setViewTab("repository");
                              }}
                              className="px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                            >
                              <span>🔍</span>
                              <span>View Files</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* --- SUB-TAB 2: ALL UPLOADED FILES REPOSITORY (TABLE FORMAT) --- */}
      {viewTab === "repository" && (
        <div className="bg-white border border-sky-100 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xs">
          {/* Filter Controls & Search Toolbar */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-sky-50/40 p-3.5 rounded-2xl border border-sky-100">
            {/* Employee Filter */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              <span className="text-xs text-slate-500 font-bold shrink-0">Filter Staff:</span>
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="w-full md:w-56 bg-white border border-sky-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-sky-500 cursor-pointer font-medium"
              >
                <option value="ALL">All Staff Members ({employees.length})</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name} ({emp.department || "General"})
                  </option>
                ))}
              </select>
            </div>

            {/* Document Type Filter */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              <span className="text-xs text-slate-500 font-bold shrink-0">Category:</span>
              <select
                value={selectedDocType}
                onChange={(e) => handleDocTypeChange(e.target.value)}
                className="w-full md:w-56 bg-white border border-sky-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-sky-500 cursor-pointer font-medium"
              >
                <option value="ALL">All Categories</option>
                <option value="PERSONAL_INFORMATION">👤 All Personal Information</option>
                <option value="PERSONAL_DETAILS">-- 📄 Personal Details</option>
                <option value="OFFER_LETTER">-- 📜 Offer Letter</option>
                <option value="EXPERIENCE_CERTIFICATE">-- 🎓 Experience Certificate</option>
                <option value="SALARY_PAYSLIP">💳 Salary Payslips</option>
              </select>
            </div>

            {/* Search Box */}
            <div className="relative flex-1 w-full">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, employee name, or remarks..."
                className="w-full bg-white border border-sky-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-sky-400 focus:outline-none focus:border-sky-500 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Payslip Calendar Month/Year Picker */}
          {isPayslipFilter && (
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
                    const prevYear = (selectedYear || defaultCalYear) - 1;
                    const minYear = payslipYears.length > 0 ? Math.min(...payslipYears) : currentNow.getFullYear() - 5;
                    if (prevYear >= minYear - 1) {
                      setSelectedYear(prevYear);
                      setSelectedMonth(null);
                    }
                  }}
                  disabled={(() => {
                    const minYear = payslipYears.length > 0 ? Math.min(...payslipYears) : currentNow.getFullYear() - 5;
                    return (selectedYear || defaultCalYear) <= minYear - 1;
                  })()}
                  className="w-8 h-8 rounded-xl bg-white border border-emerald-200 hover:bg-emerald-50 text-emerald-700 font-bold text-sm flex items-center justify-center transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ◀
                </button>
                <span className="text-lg font-black text-slate-900 min-w-[60px] text-center tabular-nums">
                  {selectedYear || defaultCalYear}
                </span>
                <button
                  onClick={() => {
                    const nextYear = (selectedYear || defaultCalYear) + 1;
                    if (nextYear <= currentNow.getFullYear() + 1) {
                      setSelectedYear(nextYear);
                      setSelectedMonth(null);
                    }
                  }}
                  disabled={(selectedYear || defaultCalYear) >= currentNow.getFullYear() + 1}
                  className="w-8 h-8 rounded-xl bg-white border border-emerald-200 hover:bg-emerald-50 text-emerald-700 font-bold text-sm flex items-center justify-center transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ▶
                </button>
              </div>

              {/* Month Grid */}
              <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-1.5">
                {MONTH_SHORT_LABELS.map((label, idx) => {
                  const isSelected = selectedMonth === idx && selectedYear !== null;
                  const count = payslipCountsByMonth[idx] || 0;
                  const isCurrentMonth = idx === currentNow.getMonth() && (selectedYear || defaultCalYear) === currentNow.getFullYear();

                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedMonth(idx);
                        if (selectedYear === null) setSelectedYear(defaultCalYear);
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
                    Showing payslips for <strong>{MONTH_NAMES_FULL[selectedMonth]} {selectedYear}</strong>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Table Header Summary */}
          <div className="flex items-center justify-between border-b border-sky-100 pb-3">
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <span>📁</span> Master File Repository Table
            </h3>
            <span className="text-xs text-slate-500 font-mono">
              Showing {filteredDocuments.length} stored files
            </span>
          </div>

          {/* File List Table */}
          {loading ? (
            <div className="py-20 text-center space-y-3">
              <div className="w-9 h-9 border-3 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-semibold text-slate-500">Loading documents...</p>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="py-20 text-center space-y-3 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
              <div className="text-5xl">{isPayslipFilter && selectedMonth !== null ? "💳" : "📁"}</div>
              <p className="text-sm font-extrabold text-slate-800">
                {isPayslipFilter && selectedMonth !== null && selectedYear !== null
                  ? `No Payslips for ${MONTH_NAMES_FULL[selectedMonth]} ${selectedYear}`
                  : "No Documents Found"}
              </p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {isPayslipFilter && selectedMonth !== null && selectedYear !== null
                  ? `No payslips have been uploaded for ${MONTH_NAMES_FULL[selectedMonth]} ${selectedYear}. Try selecting a different month or click "Show All Payslips" to view all.`
                  : "No uploaded employee documents match your search criteria."}
              </p>
            </div>
          ) : (
            <div className="border border-sky-100 rounded-2xl overflow-hidden shadow-2xs bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-sky-50/80 border-b border-sky-100 text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">
                      <th className="py-3.5 px-4 sm:px-6">Document Name</th>
                      <th className="py-3.5 px-4">Assigned Employee</th>
                      {(selectedDocType === "ALL" || selectedDocType === "PERSONAL_INFORMATION") && (
                        <th className="py-3.5 px-4">Category</th>
                      )}
                      <th className="py-3.5 px-4 hidden md:table-cell">File Size</th>
                      <th className="py-3.5 px-4 hidden lg:table-cell">Date Uploaded</th>
                      <th className="py-3.5 px-4 text-right pr-6">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sky-100/70 text-xs">
                    {filteredDocuments.map((doc) => {
                      const format = getFileFormatDetails(doc.fileType, doc.documentType, doc.documentName);
                      const isDeleting = deletingId === doc.id;
                      const isDownloading = downloadingId === doc.id;

                      return (
                        <tr
                          key={doc.id}
                          className="hover:bg-sky-50/40 transition-colors group"
                        >
                          {/* Document Title & Notes */}
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

                          {/* Assigned Employee */}
                          <td className="py-4 px-4 whitespace-nowrap">
                            <div className="font-bold text-slate-900 text-xs">{doc.employeeName}</div>
                            <div className="text-[10px] text-slate-400">{doc.department}</div>
                          </td>

                          {/* Category Badge */}
                          {(selectedDocType === "ALL" || selectedDocType === "PERSONAL_INFORMATION") && (
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

                          {/* Actions */}
                          <td className="py-4 px-4 text-right whitespace-nowrap pr-6">
                            <div className="flex items-center justify-end gap-2">
                              {/* Preview Button */}
                              <button
                                onClick={() => setPreviewDoc(doc)}
                                className="px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 font-extrabold text-xs transition flex items-center gap-1 cursor-pointer"
                                title="View Document"
                              >
                                <span>👁️</span>
                                <span className="hidden sm:inline">View</span>
                              </button>

                              {/* Download Button */}
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
                                <span className="hidden sm:inline">{isDownloading ? "Saving..." : "Save"}</span>
                              </button>

                              {/* Delete Button */}
                              <button
                                onClick={() => handleDeleteDocument(doc.id, doc.documentName)}
                                disabled={isDeleting}
                                className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs font-bold transition cursor-pointer disabled:opacity-50"
                                title="Permanently Delete File"
                              >
                                {isDeleting ? "⏳" : "🗑️"}
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
      )}

      {/* --- DOCUMENT VIEWER MODAL (FOR HR) --- */}
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
                    <span>Assigned to: <strong>{previewDoc.employeeName}</strong></span>
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
                  <span>⬇️</span> Save
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

      {/* --- UPLOAD DOCUMENT MODAL --- */}
      {showUploadModal && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white border border-sky-100 rounded-3xl p-6 sm:p-7 space-y-5 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between border-b border-sky-100 pb-3.5">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 text-[10px] font-bold uppercase tracking-wider border border-sky-200 mb-1">
                  <span>📤</span> Private Storage Upload
                </div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Upload Document to Employee Workspace
                </h3>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-slate-700 text-base font-bold"
              >
                ✕
              </button>
            </div>

            {modalNotice.error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
                {modalNotice.error}
              </div>
            )}

            <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs">
              {/* Select Employee */}
              <div>
                <label className="block font-bold text-slate-800 uppercase tracking-wider text-[10px] mb-1">
                  Target Employee *
                </label>
                <select
                  required
                  value={uploadForm.employeeId}
                  onChange={(e) => {
                    const empId = e.target.value;
                    const empObj = employees.find((emp) => emp.id === empId);
                    const empName = empObj?.full_name || "Employee";
                    const jDateStr = empObj?.joining_date || empObj?.created_at || "";
                    const recMonths = getRecommendedPayslipMonths(jDateStr);
                    const defaultMonth = recMonths[0]?.value || "";

                    setUploadForm((prev) => ({
                      ...prev,
                      employeeId: empId,
                      payslipMonth: prev.category === "SALARY_PAYSLIP" ? defaultMonth : prev.payslipMonth,
                      documentName: prev.category === "SALARY_PAYSLIP"
                        ? `${defaultMonth} - ${empName}`
                        : prev.documentName,
                    }));
                  }}
                  className="w-full bg-sky-50/50 border border-sky-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-sky-500 cursor-pointer"
                >
                  <option value="" disabled>-- Select Employee --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} ({emp.department || "General"}) · {emp.email}
                    </option>
                  ))}
                </select>
              </div>

              {/* Document Category */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-800 uppercase tracking-wider text-[10px]">
                    1. Select Main Category *
                  </label>
                  {!uploadForm.category && (
                    <span className="text-[10px] font-bold text-amber-600 animate-pulse">
                      ⚠️ Category selection required
                    </span>
                  )}
                </div>
                <div className={`grid grid-cols-2 gap-3 p-1 rounded-2xl transition ${!uploadForm.category ? "border border-amber-300 bg-amber-50/30" : ""}`}>
                  {[
                    { id: "PERSONAL_INFORMATION", label: "👤 Personal Information", desc: "Saved to personal_information subfolder" },
                    { id: "SALARY_PAYSLIP", label: "💳 Salary Payslip", desc: "Saved to salary_payslip subfolder" },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        const isSalary = cat.id === "SALARY_PAYSLIP";
                        const selectedEmp = employees.find((e) => e.id === uploadForm.employeeId);
                        const empName = selectedEmp?.full_name || "Employee";
                        const jDateStr = selectedEmp?.joining_date || selectedEmp?.created_at || "";
                        const recMonths = getRecommendedPayslipMonths(jDateStr);
                        const defaultMonth = recMonths[0]?.value || "";
                        const newSubType = cat.id === "PERSONAL_INFORMATION" ? (uploadForm.subType || "PERSONAL_DETAILS") : "";

                        setUploadForm((prev) => ({
                          ...prev,
                          category: cat.id,
                          subType: newSubType,
                          documentType: isSalary ? "SALARY_PAYSLIP" : newSubType,
                          payslipMonth: isSalary ? (prev.payslipMonth || defaultMonth) : "",
                          documentName: isSalary ? `${prev.payslipMonth || defaultMonth} - ${empName}` : prev.documentName,
                        }));
                      }}
                      className={`p-3 rounded-xl border text-xs font-bold transition text-left space-y-0.5 cursor-pointer ${
                        uploadForm.category === cat.id
                          ? "bg-sky-600 text-white border-sky-600 shadow-md shadow-sky-500/20"
                          : "bg-sky-50/40 text-slate-700 border-sky-200 hover:bg-sky-100"
                      }`}
                    >
                      <div>{cat.label}</div>
                      <div className={`text-[10px] font-normal ${uploadForm.category === cat.id ? "text-sky-100" : "text-slate-400"}`}>
                        {cat.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Recommended Month Selection for Salary Payslip */}
              {uploadForm.category === "SALARY_PAYSLIP" && (() => {
                const selectedEmp = employees.find((e) => e.id === uploadForm.employeeId);
                const empName = selectedEmp?.full_name || "Employee";
                const jDateStr = selectedEmp?.joining_date || selectedEmp?.created_at || "";
                const recMonths = getRecommendedPayslipMonths(jDateStr);
                const formattedJDate = jDateStr ? new Date(jDateStr).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) : null;
                const currentMonthValue = uploadForm.payslipMonth || (recMonths[0]?.value || "");

                return (
                  <div className="p-3.5 bg-gradient-to-br from-emerald-50 to-teal-50/50 rounded-2xl border border-emerald-200 space-y-2.5 animate-fadeIn">
                    <div className="flex items-center justify-between">
                      <label className="block font-extrabold text-emerald-900 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                        <span>✨ 2. Recommended Payslip Month & Year *</span>
                      </label>
                      {formattedJDate ? (
                        <span className="text-[10px] font-extrabold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-200">
                          📅 Joined: {formattedJDate}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                          Past 12 Months Available
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <select
                        value={currentMonthValue}
                        onChange={(e) => {
                          const chosenMonth = e.target.value;
                          setUploadForm((prev) => ({
                            ...prev,
                            payslipMonth: chosenMonth,
                            documentName: `${chosenMonth} - ${empName}`,
                          }));
                        }}
                        className="w-full bg-white border border-emerald-300 rounded-xl p-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:border-emerald-500 cursor-pointer shadow-2xs"
                      >
                        {recMonths.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-emerald-700 font-medium flex items-center gap-1">
                        <span>💡 Suggested from employee joining date ({formattedJDate || "Current Year"}). File name auto-sets to: <strong>{currentMonthValue} - {empName}</strong></span>
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* Sub-Type Selection / Next Option for Personal Information */}
              {uploadForm.category === "PERSONAL_INFORMATION" && (
                <div className="p-3.5 bg-gradient-to-br from-sky-50 to-indigo-50/50 rounded-2xl border border-sky-200 space-y-2 animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <label className="block font-extrabold text-sky-900 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                      <span>✨ 2. Next Option: Select Document Specification *</span>
                    </label>
                    <span className="text-[10px] font-extrabold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                      Required for Employee Identification
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { id: "PERSONAL_DETAILS", icon: "👤", label: "Personal Details", desc: "Employee personal info" },
                      { id: "OFFER_LETTER", icon: "📜", label: "Offer Letter", desc: "Official offer letter" },
                      { id: "EXPERIENCE_CERTIFICATE", icon: "🎓", label: "Experience Certificate", desc: "Experience certificate" },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setUploadForm({ ...uploadForm, subType: item.id, documentType: item.id })}
                        className={`p-2.5 rounded-xl border text-xs font-bold transition text-left space-y-0.5 cursor-pointer ${
                          uploadForm.subType === item.id
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                            : "bg-white text-slate-700 border-sky-200 hover:bg-sky-100/70"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-extrabold">
                          <span>{item.icon}</span>
                          <span>{item.label}</span>
                        </div>
                        <div className={`text-[9px] ${uploadForm.subType === item.id ? "text-indigo-100" : "text-slate-400"}`}>
                          {item.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Select File */}
              <div>
                <label className="block font-bold text-slate-800 uppercase tracking-wider text-[10px] mb-1">
                  Select File Payload * (PDF, Image, DOCX)
                </label>
                <input
                  type="file"
                  required
                  onChange={handleFileSelect}
                  className="w-full bg-sky-50/50 border border-sky-200 rounded-xl p-2 text-xs text-slate-800 cursor-pointer file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-sky-600 file:text-white hover:file:bg-sky-500"
                />
              </div>

              {/* Custom Display Name */}
              <div>
                <label className="block font-bold text-slate-800 uppercase tracking-wider text-[10px] mb-1">
                  Document Display Title (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Offer Letter - Software Engineer / August 2026 Payslip"
                  value={uploadForm.documentName}
                  onChange={(e) => setUploadForm({ ...uploadForm, documentName: e.target.value })}
                  className="w-full bg-sky-50/50 border border-sky-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* HR Notes / Description */}
              <div>
                <label className="block font-bold text-slate-800 uppercase tracking-wider text-[10px] mb-1">
                  HR Remarks / Instructions (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Signed copy required / Confidential payslip document..."
                  value={uploadForm.notes}
                  onChange={(e) => setUploadForm({ ...uploadForm, notes: e.target.value })}
                  className="w-full bg-sky-50/50 border border-sky-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={uploading}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-md shadow-sky-500/20 cursor-pointer disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Uploading to Supabase...</span>
                    </>
                  ) : (
                    <>
                      <span>📤</span>
                      <span>Confirm Upload</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
