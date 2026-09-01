"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

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
    return {
      icon: (
        <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      color: "bg-emerald-50 text-emerald-700 border-emerald-200",
      badge: "PAYSLIP",
      ext,
    };
  }
  if (docType === "OFFER_LETTER") {
    return {
      icon: (
        <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      color: "bg-indigo-50 text-indigo-700 border-indigo-200",
      badge: "OFFER LETTER",
      ext,
    };
  }
  if (docType === "EXPERIENCE_CERTIFICATE") {
    return {
      icon: (
        <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
        </svg>
      ),
      color: "bg-purple-50 text-purple-700 border-purple-200",
      badge: "EXPERIENCE CERTIFICATE",
      ext,
    };
  }
  if (docType === "PERSONAL_DETAILS" || docType === "PERSONAL_INFORMATION") {
    return {
      icon: (
        <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
        </svg>
      ),
      color: "bg-amber-50 text-amber-700 border-amber-200",
      badge: "PERSONAL DETAILS",
      ext,
    };
  }
  if (fileType?.includes("pdf") || fileName?.endsWith(".pdf")) {
    return {
      icon: (
        <svg className="w-5 h-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      color: "bg-rose-50 text-rose-700 border-rose-200",
      badge: "PDF",
      ext: "PDF",
    };
  }
  if (fileType?.includes("image") || /\.(png|jpe?g|webp|gif)$/i.test(fileName || "")) {
    return {
      icon: (
        <svg className="w-5 h-5 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      color: "bg-sky-50 text-sky-700 border-sky-200",
      badge: "IMAGE",
      ext: ext || "IMG",
    };
  }
  if (fileType?.includes("word") || fileType?.includes("document") || /\.(docx?|rtf)$/i.test(fileName || "")) {
    return {
      icon: (
        <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      color: "bg-blue-50 text-blue-700 border-blue-200",
      badge: "DOC",
      ext: ext || "DOC",
    };
  }
  return {
    icon: (
      <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
    color: "bg-slate-100 text-slate-700 border-slate-200",
    badge: "DOCUMENT",
    ext,
  };
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
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = React.useRef(null);
  const [uploadForm, setUploadForm] = useState({
    employeeId: "",
    category: "SALARY_PAYSLIP", // "SALARY_PAYSLIP" | "PERSONAL_INFORMATION"
    subType: "OFFER_LETTER", // "OFFER_LETTER" | "PERSONAL_DETAILS" | "EXPERIENCE_CERTIFICATE"
    payslipMonth: "", // e.g. "August 2026"
    documentType: "SALARY_PAYSLIP",
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

      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};

      const res = await fetch(url, { headers });
      if (res.status === 401) {
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
    const initEmployees = async () => {
      await fetchEmployees();
    };
    initEmployees();
  }, []);

  useEffect(() => {
    const initDocs = async () => {
      await fetchDocuments(false);
    };
    initDocs();
  }, [selectedEmployeeId, selectedDocType]);

  // Background Sync Interval (Every 10 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchDocuments(true);
    }, 10000);

    return () => clearInterval(interval);
  }, [selectedEmployeeId, selectedDocType]);

  const openUploadForEmployee = (empId, docType = "") => {
    let cat = "SALARY_PAYSLIP";
    let sub = "OFFER_LETTER";
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
      setUploadForm((prev) => {
        const empObj = employees.find((emp) => emp.id === prev.employeeId);
        const empName = empObj?.full_name || "Employee";
        let autoName = prev.documentName;
        if (!autoName || autoName.trim() === "") {
          if (prev.category === "SALARY_PAYSLIP" && prev.payslipMonth) {
            autoName = `${prev.payslipMonth} - ${empName}`;
          } else {
            autoName = selectedFile.name.replace(/\.[^/.]+$/, "");
          }
        }
        return {
          ...prev,
          file: selectedFile,
          documentName: autoName,
        };
      });
    }
  };

  const handleRemoveSelectedFile = () => {
    setUploadForm((prev) => ({
      ...prev,
      file: null,
    }));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    setModalNotice({ error: "", success: "" });

    if (!uploadForm.employeeId) {
      setModalNotice({ error: "Please select a target employee.", success: "" });
      return;
    }

    const currentCat = uploadForm.category || "SALARY_PAYSLIP";

    if (currentCat === "PERSONAL_INFORMATION" && !uploadForm.subType) {
      setModalNotice({ error: "Please select a document type specification (e.g. Offer Letter, Personal Details, or Experience Certificate).", success: "" });
      return;
    }

    const finalDocType = currentCat === "SALARY_PAYSLIP" ? "SALARY_PAYSLIP" : (uploadForm.subType || "PERSONAL_DETAILS");

    if (!uploadForm.file) {
      setModalNotice({ error: "Please select or attach a document file to upload.", success: "" });
      return;
    }

    const empObj = employees.find((emp) => emp.id === uploadForm.employeeId);
    const empName = empObj?.full_name || "Employee";
    const resolvedDocName = (uploadForm.documentName && uploadForm.documentName.trim())
      ? uploadForm.documentName.trim()
      : (currentCat === "SALARY_PAYSLIP" ? `${uploadForm.payslipMonth || "Payslip"} - ${empName}` : uploadForm.file.name.replace(/\.[^/.]+$/, ""));

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadForm.file);
      formData.append("employeeId", uploadForm.employeeId);
      formData.append("documentType", finalDocType);
      formData.append("documentName", resolvedDocName);
      formData.append("notes", uploadForm.notes);

      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setModalNotice({ error: data.message || "Document upload failed.", success: "" });
      } else {
        setNotice({ error: "", success: data.message || "Document uploaded successfully!" });
        setShowUploadModal(false);
        const jDateStr = empObj?.joining_date || empObj?.created_at || "";
        const recMonths = getRecommendedPayslipMonths(jDateStr);
        const defaultMonth = recMonths[0]?.value || "";

        setUploadForm({
          employeeId: employees[0]?.id || "",
          category: "SALARY_PAYSLIP",
          subType: "OFFER_LETTER",
          documentType: "SALARY_PAYSLIP",
          payslipMonth: defaultMonth,
          documentName: "",
          notes: "",
          file: null,
        });
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
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
    const q = searchQuery.toLowerCase().trim();
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
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center border border-sky-200/60">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                Company Documents &amp; Payslips
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              Manage and archive employee records, verified credentials, and official salary payslips.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => {
                setModalNotice({ error: "", success: "" });
                const empId = uploadForm.employeeId || employees[0]?.id || "";
                const empObj = employees.find((e) => e.id === empId);
                const empName = empObj?.full_name || "Employee";
                const jDateStr = empObj?.joining_date || empObj?.created_at || "";
                const recMonths = getRecommendedPayslipMonths(jDateStr);
                const defaultMonth = recMonths[0]?.value || "";
                const cat = uploadForm.category || "SALARY_PAYSLIP";
                const sub = uploadForm.subType || "OFFER_LETTER";

                setUploadForm((prev) => ({
                  ...prev,
                  employeeId: empId,
                  category: cat,
                  subType: sub,
                  payslipMonth: prev.payslipMonth || defaultMonth,
                  documentType: cat === "SALARY_PAYSLIP" ? "SALARY_PAYSLIP" : sub,
                  documentName: cat === "SALARY_PAYSLIP" ? `${prev.payslipMonth || defaultMonth} - ${empName}` : (prev.documentName || ""),
                  notes: "",
                  file: null,
                }));
                setShowUploadModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold transition-colors shadow-xs shadow-sky-600/20 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
              </svg>
              <span>Upload Document</span>
            </button>

            <button
              onClick={() => {
                fetchEmployees();
                fetchDocuments(false);
              }}
              className="p-2 rounded-xl bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
              title="Refresh Documents"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* View Switcher Sub-Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl">
          <button
            onClick={() => setViewTab("directory")}
            className={`flex-1 py-2 px-3.5 rounded-lg font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
              viewTab === "directory"
                ? "bg-white text-slate-900 shadow-2xs font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span>Staff Directory ({employees.length})</span>
          </button>

          <button
            onClick={() => setViewTab("repository")}
            className={`flex-1 py-2 px-3.5 rounded-lg font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
              viewTab === "repository"
                ? "bg-white text-slate-900 shadow-2xs font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <span>Documents Repository ({documents.length})</span>
          </button>
        </div>

        {/* Top Summary Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Registered Staff</span>
            <div className="text-xl font-bold text-slate-900">{employees.length}</div>
            <span className="text-[11px] text-slate-500">Active personnel</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Total Documents</span>
            <div className="text-xl font-bold text-slate-900">{documents.length}</div>
            <span className="text-[11px] text-slate-500 font-mono">{formatBytes(totalVaultBytes)}</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Personal Records</span>
            <div className="text-xl font-bold text-slate-900">{personalInfoCount}</div>
            <span className="text-[11px] text-slate-500">Verified credentials</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Salary Payslips</span>
            <div className="text-xl font-bold text-slate-900">{salaryPayslipCount}</div>
            <span className="text-[11px] text-slate-500">Payroll statements</span>
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
            <span>{notice.error}</span>
            <button onClick={() => setNotice({ error: "", success: "" })} className="text-rose-700">✕</button>
          </div>
        )}
      </div>

      {/* --- SUB-TAB 1: STAFF DIRECTORY & DOCUMENT MATRIX --- */}
      {viewTab === "directory" && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Company Staff Directory
              </h3>
              <p className="text-xs text-slate-500">
                View all company employees and track document coverage across your team.
              </p>
            </div>

            {/* Search Box */}
            <div className="relative w-full sm:w-72">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="Search staff name, email, department..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-sky-500 transition shadow-2xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {filteredEmployees.length === 0 ? (
            <div className="py-16 text-center space-y-2 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
              <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <p className="text-xs font-bold text-slate-800">No Staff Members Found</p>
              <p className="text-xs text-slate-400">No employees match your current search query.</p>
            </div>
          ) : (
            <div className="border border-slate-200/80 rounded-xl overflow-hidden shadow-2xs bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[700px]">
                  <thead className="bg-slate-50/90 border-b border-slate-200/80 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3 px-5">Employee</th>
                      <th className="py-3 px-5">Department &amp; Role</th>
                      <th className="py-3 px-5 text-center">Uploaded Files</th>
                      <th className="py-3 px-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredEmployees.map((emp) => {
                      const docSum = emp.docSummary || { totalDocs: 0 };
                      const initial = emp.full_name ? emp.full_name.charAt(0).toUpperCase() : "?";

                      return (
                        <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                          {/* Employee info */}
                          <td className="py-3.5 px-5">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-lg bg-sky-50 border border-sky-200/80 text-sky-700 flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                                {initial}
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-900 text-xs truncate max-w-xs">{emp.full_name}</div>
                                <div className="text-[11px] text-slate-500 font-mono truncate max-w-xs mt-0.5">{emp.email}</div>
                              </div>
                            </div>
                          </td>

                        {/* Department & Role */}
                        <td className="py-4 px-5 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {emp.department || "General"}
                          </span>
                          <div className="text-[11px] text-slate-500 capitalize mt-1 font-medium">
                            {emp.designation || emp.role || "Staff"}
                          </div>
                        </td>

                        {/* Uploaded Files Summary */}
                        <td className="py-4 px-5 text-center whitespace-nowrap">
                          {docSum.totalDocs > 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/80 shadow-2xs">
                              <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.25">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span>{docSum.totalDocs} {docSum.totalDocs === 1 ? "File" : "Files"} Uploaded</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-50 text-slate-400 border border-slate-200/70">
                              <svg className="w-3.5 h-3.5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                              </svg>
                              <span>No files uploaded yet</span>
                            </span>
                          )}
                        </td>

                        {/* Upload Document Actions */}
                        <td className="py-3.5 px-5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openUploadForEmployee(emp.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                            >
                              <svg className="w-3.5 h-3.5 stroke-current" fill="none" viewBox="0 0 24 24" strokeWidth="2.25">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                              </svg>
                              <span>Upload</span>
                            </button>

                            <button
                              onClick={() => {
                                setSelectedEmployeeId(emp.id);
                                setSelectedDocType("ALL");
                                setViewTab("repository");
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                            >
                              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              <span>View</span>
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

      {/* --- SUB-TAB 2: ALL UPLOADED FILES REPOSITORY (TABLE FORMAT) --- */}
      {viewTab === "repository" && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs">
          {/* Filter Controls & Search Toolbar */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-slate-50/70 p-3 rounded-xl border border-slate-200/80">
            {/* Employee Filter */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              <span className="text-xs text-slate-500 font-semibold shrink-0">Staff:</span>
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="w-full md:w-52 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-sky-500 cursor-pointer font-medium shadow-2xs"
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
              <span className="text-xs text-slate-500 font-semibold shrink-0">Category:</span>
              <select
                value={selectedDocType}
                onChange={(e) => handleDocTypeChange(e.target.value)}
                className="w-full md:w-52 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-sky-500 cursor-pointer font-medium shadow-2xs"
              >
                <option value="ALL">All Categories</option>
                <option value="PERSONAL_INFORMATION">Personal Records (All)</option>
                <option value="PERSONAL_DETAILS">Personal Details</option>
                <option value="OFFER_LETTER">Offer Letters</option>
                <option value="EXPERIENCE_CERTIFICATE">Experience Certificates</option>
                <option value="SALARY_PAYSLIP">Salary Payslips</option>
              </select>
            </div>

            {/* Search Box */}
            <div className="relative flex-1 w-full">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, employee name, or notes..."
                className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 transition shadow-2xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Payslip Calendar Month/Year Picker */}
          {isPayslipFilter && (
            <div className="p-3.5 bg-slate-50/70 rounded-xl border border-slate-200/80 space-y-2.5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900">Payslip Period:</span>
                  <span className="text-xs text-slate-500 font-mono">
                    {selectedMonth !== null && selectedYear !== null
                      ? `${MONTH_NAMES_FULL[selectedMonth]} ${selectedYear}`
                      : "All Periods"}
                  </span>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  {/* Year Selector */}
                  <select
                    value={selectedYear ?? calYear}
                    onChange={(e) => {
                      const yr = parseInt(e.target.value, 10);
                      setSelectedYear(yr);
                      if (selectedMonth === null) setSelectedMonth(0);
                    }}
                    className="bg-white border border-slate-200 text-slate-800 text-xs font-bold rounded-lg px-2.5 py-1 focus:outline-none focus:border-sky-500 shadow-2xs"
                  >
                    {[calYear - 2, calYear - 1, calYear, calYear + 1].map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => {
                      setSelectedMonth(null);
                      setSelectedYear(null);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      selectedMonth === null && selectedYear === null
                        ? "bg-sky-600 text-white shadow-2xs"
                        : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Show All
                  </button>
                </div>
              </div>

              {/* 12 Months Grid */}
              <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-1.5">
                {MONTH_NAMES_SHORT.map((mName, mIdx) => {
                  const isSelected = selectedMonth === mIdx && selectedYear === (selectedYear ?? calYear);
                  const isCurrent = mIdx === defaultCalMonth && (selectedYear ?? calYear) === defaultCalYear;

                  return (
                    <button
                      key={mName}
                      onClick={() => {
                        setSelectedMonth(mIdx);
                        if (selectedYear === null) setSelectedYear(calYear);
                      }}
                      className={`py-1.5 px-1 rounded-lg text-xs font-medium text-center transition-all cursor-pointer relative ${
                        isSelected
                          ? "bg-sky-600 text-white font-bold shadow-2xs"
                          : isCurrent
                          ? "bg-sky-50 border border-sky-200 text-sky-700 font-bold"
                          : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <span>{mName}</span>
                      {isCurrent && !isSelected && (
                        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-sky-500 rounded-full ring-1 ring-white" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Active filter indicator */}
              {selectedMonth !== null && selectedYear !== null && (
                <div className="flex items-center justify-center gap-2 pt-0.5">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>Payslips for <strong>{MONTH_NAMES_FULL[selectedMonth]} {selectedYear}</strong></span>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* File List Table */}
          {loading ? (
            <div className="py-20 text-center space-y-3">
              <div className="w-8 h-8 border-2 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-medium text-slate-500">Loading documents...</p>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="py-16 text-center space-y-2 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
              <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-xs font-bold text-slate-800">
                {isPayslipFilter && selectedMonth !== null && selectedYear !== null
                  ? `No Payslips for ${MONTH_NAMES_FULL[selectedMonth]} ${selectedYear}`
                  : "No Documents Found"}
              </p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {isPayslipFilter && selectedMonth !== null && selectedYear !== null
                  ? `No payslips uploaded for ${MONTH_NAMES_FULL[selectedMonth]} ${selectedYear}. Select another month or click "Show All".`
                  : "No employee documents match your current filter criteria."}
              </p>
            </div>
          ) : (
            <div className="border border-slate-200/80 rounded-xl overflow-hidden shadow-2xs bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/90 border-b border-slate-200/80 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4 sm:px-5">Document Name</th>
                      <th className="py-3 px-4">Assigned Employee</th>
                      {(selectedDocType === "ALL" || selectedDocType === "PERSONAL_INFORMATION") && (
                        <th className="py-3 px-4">Category</th>
                      )}
                      <th className="py-3 px-4 hidden md:table-cell">File Size</th>
                      <th className="py-3 px-4 hidden lg:table-cell">Date Uploaded</th>
                      <th className="py-3 px-4 text-right pr-5">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredDocuments.map((doc) => {
                      const format = getFileFormatDetails(doc.fileType, doc.documentType, doc.documentName);
                      const isDeleting = deletingId === doc.id;
                      const isDownloading = downloadingId === doc.id;

                      return (
                        <tr
                          key={doc.id}
                          className="hover:bg-slate-50/70 transition-colors group"
                        >
                          {/* Document Title & Notes */}
                          <td className="py-3.5 px-4 sm:px-5">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200/70 flex items-center justify-center shrink-0 shadow-2xs">
                                {format.icon}
                              </div>
                              <div className="min-w-0">
                                <h4 className="font-semibold text-slate-900 group-hover:text-sky-600 transition-colors truncate max-w-xs sm:max-w-md">
                                  {doc.documentName}
                                </h4>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[10px] font-mono font-semibold text-slate-400 bg-slate-100 px-1 rounded">
                                    .{format.ext}
                                  </span>
                                  {doc.notes && (
                                    <span className="text-[10px] text-slate-500 italic truncate max-w-xs">
                                      — {doc.notes}
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
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Preview / View Button */}
                              <button
                                onClick={() => setPreviewDoc(doc)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 font-semibold text-xs transition-colors cursor-pointer"
                                title="View Document"
                              >
                                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                <span>View</span>
                              </button>

                              {/* Download Button */}
                              <button
                                onClick={() => handleDownloadDocument(doc)}
                                disabled={isDownloading}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Download Document to Device"
                              >
                                {isDownloading ? (
                                  <span className="w-3.5 h-3.5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin shrink-0" />
                                ) : (
                                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                )}
                                <span>{isDownloading ? "Downloading..." : "Download"}</span>
                              </button>

                              {/* Delete / Bin Button */}
                              <button
                                onClick={() => handleDeleteDocument(doc.id, doc.documentName)}
                                disabled={isDeleting}
                                className="inline-flex items-center justify-center p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Delete Document"
                              >
                                {isDeleting ? (
                                  <span className="w-3.5 h-3.5 border-2 border-rose-600 border-t-transparent rounded-full animate-spin shrink-0" />
                                ) : (
                                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                )}
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
                  className="px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  <span>Open in New Tab</span>
                </a>
                <button
                  onClick={() => handleDownloadDocument(previewDoc)}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Save</span>
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
                  <div className="w-16 h-16 rounded-2xl bg-sky-50 text-sky-600 border border-sky-200 flex items-center justify-center mx-auto shadow-2xs">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
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
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-white border border-slate-200/90 rounded-2xl shadow-2xl overflow-hidden my-auto animate-scaleUp">
            {/* Modal Header */}
            <div className="bg-slate-50/90 border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center text-lg shrink-0 border border-sky-100 shadow-2xs">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-tight">
                    Upload Document to Employee Workspace
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Securely archive salary payslips or official HR records
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition text-sm font-bold cursor-pointer"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Error Notification */}
            {modalNotice.error && (
              <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{modalNotice.error}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setModalNotice({ error: "", success: "" })}
                  className="text-rose-600 hover:text-rose-800 font-bold ml-2 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            <form onSubmit={handleUploadSubmit} className="p-6 space-y-4 text-xs">
              {/* Select Employee */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Target Employee <span className="text-rose-500">*</span>
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
                        : (prev.subType ? `${prev.subType.replace(/_/g, " ")} - ${empName}` : prev.documentName),
                    }));
                  }}
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 cursor-pointer shadow-2xs font-medium transition"
                >
                  <option value="" disabled>-- Select Employee --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} ({emp.department || "General"}) · {emp.email}
                    </option>
                  ))}
                </select>
              </div>

              {/* Document Category Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Document Category
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const selectedEmp = employees.find((e) => e.id === uploadForm.employeeId);
                      const empName = selectedEmp?.full_name || "Employee";
                      const jDateStr = selectedEmp?.joining_date || selectedEmp?.created_at || "";
                      const recMonths = getRecommendedPayslipMonths(jDateStr);
                      const defaultMonth = recMonths[0]?.value || "";

                      setUploadForm((prev) => ({
                        ...prev,
                        category: "SALARY_PAYSLIP",
                        subType: "",
                        documentType: "SALARY_PAYSLIP",
                        payslipMonth: prev.payslipMonth || defaultMonth,
                        documentName: `${prev.payslipMonth || defaultMonth} - ${empName}`,
                      }));
                    }}
                    className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between cursor-pointer ${
                      uploadForm.category === "SALARY_PAYSLIP"
                        ? "border-sky-500 bg-sky-50/60 shadow-xs ring-1 ring-sky-500/30"
                        : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/60 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-base">💳</span>
                      {uploadForm.category === "SALARY_PAYSLIP" && (
                        <span className="w-4 h-4 rounded-full bg-sky-600 text-white flex items-center justify-center text-[9px] font-bold">
                          ✓
                        </span>
                      )}
                    </div>
                    <div className="mt-2">
                      <div className={`text-xs font-bold ${uploadForm.category === "SALARY_PAYSLIP" ? "text-sky-950" : "text-slate-800"}`}>
                        Salary Payslip
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Payroll slips & compensation sheets
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const selectedEmp = employees.find((e) => e.id === uploadForm.employeeId);
                      const empName = selectedEmp?.full_name || "Employee";
                      const sub = uploadForm.subType || "OFFER_LETTER";

                      setUploadForm((prev) => ({
                        ...prev,
                        category: "PERSONAL_INFORMATION",
                        subType: sub,
                        documentType: sub,
                        payslipMonth: "",
                        documentName: prev.documentName && !prev.documentName.includes(" - ") ? prev.documentName : `${sub.replace(/_/g, " ")} - ${empName}`,
                      }));
                    }}
                    className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between cursor-pointer ${
                      uploadForm.category === "PERSONAL_INFORMATION"
                        ? "border-sky-500 bg-sky-50/60 shadow-xs ring-1 ring-sky-500/30"
                        : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/60 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-base">👤</span>
                      {uploadForm.category === "PERSONAL_INFORMATION" && (
                        <span className="w-4 h-4 rounded-full bg-sky-600 text-white flex items-center justify-center text-[9px] font-bold">
                          ✓
                        </span>
                      )}
                    </div>
                    <div className="mt-2">
                      <div className={`text-xs font-bold ${uploadForm.category === "PERSONAL_INFORMATION" ? "text-sky-950" : "text-slate-800"}`}>
                        Personal & HR Records
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Offer letters, KYC & certificates
                      </div>
                    </div>
                  </button>
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
                  <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <span>Pay Period (Month & Year)</span>
                      </label>
                      {formattedJDate && (
                        <span className="text-[10px] font-semibold text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                          Joined: {formattedJDate}
                        </span>
                      )}
                    </div>
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
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 cursor-pointer shadow-2xs"
                    >
                      {recMonths.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500">
                      File display title auto-formats to: <span className="font-semibold text-slate-700">{currentMonthValue} - {empName}</span>
                    </p>
                  </div>
                );
              })()}

              {/* Sub-Type Selection for Personal & Official Information */}
              {uploadForm.category === "PERSONAL_INFORMATION" && (
                <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-2">
                  <label className="text-xs font-bold text-slate-800 block">
                    Document Specification
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { id: "OFFER_LETTER", icon: "📜", label: "Offer Letter", desc: "Employment offer" },
                      { id: "PERSONAL_DETAILS", icon: "👤", label: "Personal Details", desc: "KYC & identity" },
                      { id: "EXPERIENCE_CERTIFICATE", icon: "🎓", label: "Experience Certificate", desc: "Experience / relieving" },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          const selectedEmp = employees.find((e) => e.id === uploadForm.employeeId);
                          const empName = selectedEmp?.full_name || "Employee";
                          setUploadForm((prev) => ({
                            ...prev,
                            subType: item.id,
                            documentType: item.id,
                            documentName: prev.documentName && !prev.documentName.includes(" - ") ? prev.documentName : `${item.label} - ${empName}`,
                          }));
                        }}
                        className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                          uploadForm.subType === item.id
                            ? "border-sky-500 bg-sky-50 text-sky-950 shadow-2xs ring-1 ring-sky-500/20"
                            : "border-slate-200 bg-white hover:border-slate-300 text-slate-700"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-bold">
                          <span>{item.icon}</span>
                          <span>{item.label}</span>
                        </div>
                        <div className="text-[9px] text-slate-400 mt-0.5">
                          {item.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* File Attachment & Drag Drop Zone */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Document File <span className="text-rose-500">*</span>
                </label>

                {!uploadForm.file ? (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const droppedFile = e.dataTransfer?.files?.[0];
                      if (droppedFile) {
                        handleFileSelect({ target: { files: [droppedFile] } });
                      }
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-5 text-center transition-all cursor-pointer group ${
                      isDragging
                        ? "border-sky-500 bg-sky-50/80 scale-[0.99]"
                        : "border-slate-200 hover:border-sky-400 bg-slate-50/60 hover:bg-sky-50/30"
                    }`}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                      className="hidden"
                    />
                    <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-sky-100/80 group-hover:bg-sky-100 text-sky-600 flex items-center justify-center text-lg transition shadow-2xs">
                      <svg className="w-5 h-5 stroke-current" fill="none" viewBox="0 0 24 24" strokeWidth="1.75">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                      </svg>
                    </div>
                    <p className="text-xs font-semibold text-slate-700">
                      <span className="text-sky-600 font-bold hover:underline">Click to browse</span> or drag and drop file here
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      PDF, Word (DOCX/DOC), PNG, JPG or WebP (max 15 MB)
                    </p>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-sky-100 text-sky-700 font-extrabold text-[10px] flex items-center justify-center shrink-0 border border-sky-200 uppercase">
                        {uploadForm.file.name.split('.').pop() || "FILE"}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate" title={uploadForm.file.name}>
                          {uploadForm.file.name}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                          <span>{formatBytes(uploadForm.file.size)}</span>
                          <span>•</span>
                          <span className="text-emerald-600 font-semibold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                            Ready to upload
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-2.5 py-1 text-[11px] font-semibold text-sky-700 bg-white hover:bg-sky-50 border border-sky-200 rounded-lg transition cursor-pointer"
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveSelectedFile}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                        title="Remove file"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Custom Display Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Document Display Title (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. August 2026 Payslip / Offer Letter - Software Engineer"
                  value={uploadForm.documentName}
                  onChange={(e) => setUploadForm({ ...uploadForm, documentName: e.target.value })}
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 shadow-2xs font-medium transition"
                />
              </div>

              {/* HR Notes / Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  HR Remarks & Instructions (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Internal notes or instructions for the employee..."
                  value={uploadForm.notes}
                  onChange={(e) => setUploadForm({ ...uploadForm, notes: e.target.value })}
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 shadow-2xs font-medium transition"
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={uploading}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 rounded-xl shadow-md shadow-sky-600/20 transition flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Uploading Document...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 stroke-current" fill="none" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                      <span>Upload Document</span>
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
