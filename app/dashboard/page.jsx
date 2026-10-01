"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api/authFetch";
import OwnerDashboard from "./components/OwnerDashboard";
import DepartmentSummary from "./components/DepartmentSummary";
import DepartmentManagementModal from "./components/DepartmentManagementModal";
import LeaveManagement from "./components/LeaveManagement";
import AttendanceCard from "./components/AttendanceCard";
import AttendancePage from "./components/AttendancePage";
import CompanyCalendar from "./components/CompanyCalendar";
import MonthlyWorkingHoursWidget from "./components/MonthlyWorkingHoursWidget";
import EmployeeDocumentManager from "./components/EmployeeDocumentManager";
import MyDocumentsCard from "./components/MyDocumentsCard";
import ProjectManagement from "./components/ProjectManagement";
import RolePromotionModal from "./components/RolePromotionModal";
import ExecutivePerformanceMatrix from "./components/ExecutivePerformanceMatrix";
import { checkTaskSprintOverdue } from "@/lib/projectUtils";

// ─── NAV CONFIG ──────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { key: "overview", label: "Overview" },
  { key: "evaluations", label: "Executive Appraisals", ownerOnly: true },
  { key: "projects", label: "Projects" },
  { key: "attendance", label: "Attendance" },
  { key: "calendar", label: "Work Calendar" },
  { key: "leave-requests", label: "Leave Requests" },
  { key: "documents", label: "Documents & Payslips" },
  { key: "employees", label: "Team Directory" },
  { key: "departments", label: "Departments" },
  { key: "settings", label: "My Profile" },
];

function getNavIcon(key, className = "w-4 h-4 shrink-0") {
  switch (key) {
    case "overview":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25V15.75z" />
        </svg>
      );
    case "evaluations":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
        </svg>
      );
    case "projects":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
        </svg>
      );
    case "attendance":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "calendar":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.253M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
        </svg>
      );
    case "leave-requests":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
        </svg>
      );
    case "documents":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      );
    case "employees":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      );
    case "departments":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-6A1.125 1.125 0 012.25 9.375v-2.25zM13.5 7.125c0-.621.504-1.125 1.125-1.125h6c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-6A1.125 1.125 0 0113.5 9.375v-2.25zM7.875 14.625c0-.621.504-1.125 1.125-1.125h6c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 01-1.125-1.125v-2.25z" />
        </svg>
      );
    case "settings":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.964 0a9 9 0 10-11.963 0m11.964 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    default:
      return null;
  }
}

// ─── ROLE CONFIG ──────────────────────────────────────────────────────────────
const ROLE_MAP = {
  ADMIN: { label: "Owner · Admin", color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
  hr_manager: { label: "HR Manager", color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200" },
  hr_executive: { label: "HR Executive", color: "text-sky-700", bg: "bg-sky-50 border-sky-200" },
  team_lead: { label: "Team Lead", color: "text-cyan-700", bg: "bg-cyan-50 border-cyan-200" },
  manager: { label: "Manager", color: "text-teal-700", bg: "bg-teal-50 border-teal-200" },
  employee: { label: "Employee", color: "text-slate-700", bg: "bg-slate-100 border-slate-200" },
};

const STATUS_MAP = {
  active: { label: "Active", dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  pending_offer: { label: "Offer Pending", dot: "bg-amber-500 animate-pulse", pill: "bg-amber-50 text-amber-700 border-amber-200" },
  rejected: { label: "Declined", dot: "bg-rose-500", pill: "bg-rose-50 text-rose-700 border-rose-200" },
};

function RoleBadge({ role }) {
  const r = ROLE_MAP[role] || ROLE_MAP.employee;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${r.bg} ${r.color}`}>
      {r.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || { label: status, dot: "bg-slate-400", pill: "bg-slate-100 text-slate-700 border-slate-200" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${s.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

// ─── STAT CARD ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon }) {
  return (
    <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">{label}</span>
        {icon && <span className="text-slate-400">{icon}</span>}
      </div>
      <div className="text-xl font-bold text-slate-900">{value}</div>
      {sub && <span className="text-[11px] text-slate-500">{sub}</span>}
    </div>
  );
}

// ─── ROLE-BASED DEPARTMENT RESOLVER & FILTER ─────────────────────────────────
/**
 * Resolves the list of departments strictly related to a given system role.
 * - HR roles ("hr_manager", "hr_executive"): Shows ONLY Human Resources. All unrelated departments are hidden.
 * - Non-HR roles ("employee", "team_lead", "manager"): Shows operational departments; Human Resources is hidden.
 */
function getDepartmentsForRole(role, availableDepartments = []) {
  const deptList = availableDepartments.length > 0
    ? availableDepartments.map((d) => (typeof d === "string" ? d : d.name))
    : ["Engineering", "Human Resources", "Sales", "Finance", "Operations", "Design", "Support", "General"];

  const isHrRole = ["hr_manager", "hr_executive"].includes(role);

  if (isHrRole) {
    const hrDepts = deptList.filter((d) => {
      const lower = d.toLowerCase().trim();
      return lower === "human resources" || lower === "hr" || lower.includes("human resource") || lower.includes("people");
    });
    return hrDepts.length > 0 ? hrDepts : ["Human Resources"];
  }

  // For non-HR roles (employee, team_lead, manager), hide HR departments
  const nonHrDepts = deptList.filter((d) => {
    const lower = d.toLowerCase().trim();
    return lower !== "human resources" && lower !== "hr" && !lower.includes("human resource") && !lower.includes("people");
  });

  return nonHrDepts.length > 0 ? nonHrDepts : ["Engineering", "Sales", "Finance", "Operations", "Design", "Support", "General"];
}

/**
 * Automatically allocates the corresponding company department for a system role in real time.
 * - HR roles ("hr_manager", "hr_executive") -> "Human Resources" (or matched company HR dept)
 * - Non-HR roles transitioning from HR -> Default company department ("Engineering" or first non-HR dept)
 * - Otherwise retains the chosen department if already valid in the role's related departments
 */
function resolveDepartmentForRole(role, availableDepartments = [], currentDepartment = "") {
  const relatedDepts = getDepartmentsForRole(role, availableDepartments);

  if (currentDepartment && relatedDepts.includes(currentDepartment)) {
    return currentDepartment;
  }

  return relatedDepts[0] || (["hr_manager", "hr_executive"].includes(role) ? "Human Resources" : "Engineering");
}

// ─── MAIN DASHBOARD CONTENT ──────────────────────────────────────────────────
function DashboardContent() {
  const router = useRouter();

  // Consistent initial state across Server and Client to guarantee zero hydration mismatch
  const [company, setCompany] = useState(null);
  const [userRole, setUserRole] = useState("ADMIN");
  const [employeeProfile, setEmployeeProfile] = useState(null);
  const [userSession, setUserSession] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [authError, setAuthError] = useState("");
  const [realtimeStatus, setRealtimeStatus] = useState("connecting");
  const [realtimeToast, setRealtimeToast] = useState(null);
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());

  const [activeTab, setActiveTab] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [selectedEmpForRoleModal, setSelectedEmpForRoleModal] = useState(null);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dbDepartments, setDbDepartments] = useState([]);


  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    fullName: "", email: "", phone: "",
    department: "Engineering", designation: "", role: "employee",
  });

  // Computed Roles (case-insensitive & designation aware)
  const normalizedUserRole = String(userRole || employeeProfile?.role || "").toLowerCase().replace(/[\s_-]+/g, "");
  const normalizedDesignation = String(employeeProfile?.designation || "").toLowerCase();

  const isAdmin = normalizedUserRole.includes("admin") || normalizedUserRole.includes("owner");
  const isHR = normalizedUserRole.includes("hr");
  const canInvite = isAdmin || isHR;
  const isLeadOrManager =
    normalizedUserRole.includes("manager") ||
    normalizedUserRole.includes("lead") ||
    normalizedUserRole.includes("supervisor") ||
    normalizedUserRole.includes("director") ||
    normalizedDesignation.includes("manager") ||
    normalizedDesignation.includes("lead") ||
    normalizedDesignation.includes("supervisor") ||
    normalizedDesignation.includes("head");
  const isManager = isAdmin || isHR || isLeadOrManager;
  const isStaff = !isManager && !isAdmin && !isHR;
  const [isSubmittingInvite, setIsSubmittingInvite] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccessData, setInviteSuccessData] = useState(null);
  const [copiedLinkKey, setCopiedLinkKey] = useState(null);

  // Profile Form State & Handlers
  const [profileForm, setProfileForm] = useState({
    firstName: "",
    lastName: "",
    personalEmail: "",
    phone: "",
    address: "",
    joiningDate: "",
    avatarUrl: null,
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [profileMsg, setProfileMsg] = useState({ error: "", success: "" });

  useEffect(() => {
    if (employeeProfile) {
      const rawJoining = employeeProfile.joining_date || employeeProfile.joiningDate || "";
      const formattedJoining = rawJoining ? String(rawJoining).split("T")[0] : "";
      Promise.resolve().then(() => {
        setProfileForm({
          firstName: employeeProfile.first_name || (employeeProfile.full_name ? employeeProfile.full_name.split(" ")[0] : ""),
          lastName: employeeProfile.last_name || (employeeProfile.full_name ? employeeProfile.full_name.split(" ").slice(1).join(" ") : ""),
          personalEmail: employeeProfile.personal_email || "",
          phone: employeeProfile.phone || "",
          address: employeeProfile.address || "",
          joiningDate: formattedJoining,
          avatarUrl: employeeProfile.avatar_url || null,
        });
      });
    }
  }, [employeeProfile]);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setProfileMsg({ error: "Please select a valid image file (PNG, JPG, WebP, GIF).", success: "" });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setProfileMsg({ error: "Avatar image size must be less than 5MB.", success: "" });
      return;
    }

    // Immediate preview for responsive UX
    const previewUrl = URL.createObjectURL(file);
    setProfileForm((prev) => ({ ...prev, avatarUrl: previewUrl }));
    setIsUploadingAvatar(true);
    setProfileMsg({ error: "", success: "" });

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await authFetch("/api/upload/avatar", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setProfileMsg({ error: data.message || "Failed to upload avatar image.", success: "" });
        setProfileForm((prev) => ({ ...prev, avatarUrl: employeeProfile?.avatar_url || null }));
      } else {
        // Set permanent Supabase Storage public CDN URL
        const uploadedUrl = data.avatarUrl || data.url;
        setProfileForm((prev) => ({ ...prev, avatarUrl: uploadedUrl }));
        if (data.employee) {
          setEmployeeProfile(data.employee);
        } else {
          setEmployeeProfile((prev) => (prev ? { ...prev, avatar_url: uploadedUrl } : prev));
        }

        // Sync local employees directory list immediately
        setEmployees((prev) =>
          prev.map((emp) =>
            emp.id === data.employee?.id || emp.id === employeeProfile?.id || emp.email === employeeProfile?.email
              ? { ...emp, avatar_url: uploadedUrl }
              : emp
          )
        );

        // Update sessionStorage bootstrap cache so page refresh or fast tab switch retains the photo immediately
        try {
          const cachedBootstrap = sessionStorage.getItem("workspace_bootstrap");
          if (cachedBootstrap) {
            const parsed = JSON.parse(cachedBootstrap);
            if (parsed.employee) {
              parsed.employee.avatar_url = uploadedUrl;
            }
            if (parsed.employees && Array.isArray(parsed.employees)) {
              const empId = data.employee?.id || employeeProfile?.id;
              const targetEmp = parsed.employees.find((item) => item.id === empId);
              if (targetEmp) targetEmp.avatar_url = uploadedUrl;
            }
            sessionStorage.setItem("workspace_bootstrap", JSON.stringify(parsed));
          }
        } catch (_) {}

        setProfileMsg({ error: "", success: "Profile photo uploaded and updated successfully!" });
        showToast("Profile Photo Updated", "Your new profile picture is now live across the workspace.", "success");
      }
    } catch (err) {
      console.error("Avatar upload failed:", err);
      setProfileMsg({ error: "Network error uploading avatar.", success: "" });
      setProfileForm((prev) => ({ ...prev, avatarUrl: employeeProfile?.avatar_url || null }));
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setProfileMsg({ error: "", success: "" });
    setIsSavingProfile(true);
    try {
      const res = await authFetch("/api/employees/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setProfileMsg({ error: data.message || "Failed to update profile.", success: "" });
      } else {
        setProfileMsg({ error: "", success: "Profile details updated successfully!" });
        if (data.employee) {
          setEmployeeProfile(data.employee);
          setEmployees((prev) =>
            prev.map((emp) =>
              emp.id === data.employee.id || emp.email === data.employee.email ? { ...emp, ...data.employee } : emp
            )
          );
          try {
            const cachedBootstrap = sessionStorage.getItem("workspace_bootstrap");
            if (cachedBootstrap) {
              const parsed = JSON.parse(cachedBootstrap);
              parsed.employee = data.employee;
              sessionStorage.setItem("workspace_bootstrap", JSON.stringify(parsed));
            }
          } catch (_) {}
        }
        showToast("Profile Updated", "Your profile details have been saved.", "success");
      }
    } catch {
      setProfileMsg({ error: "Network error. Failed to save profile.", success: "" });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const showToast = (title, message, type = "info") => {
    const id = Date.now();
    setRealtimeToast({ id, title, message, type });
    setTimeout(() => setRealtimeToast((c) => (c?.id === id ? null : c)), 5000);
  };

  // Fetch company + role with resilient session hydration and seamless fallback
  useEffect(() => {
    let isMounted = true;

    // Immediately restore cached bootstrap state on client after initial mount
    try {
      if (typeof window !== "undefined") {
        const b = sessionStorage.getItem("workspace_bootstrap");
        if (b) {
          const parsed = JSON.parse(b);
          if (parsed.company && isMounted) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setCompany(parsed.company);
            if (parsed.role) setUserRole(parsed.role);
            if (parsed.employee) setEmployeeProfile(parsed.employee);
            if (parsed.user) setUserSession(parsed.user);
            setLoading(false);
          }
        }
      }
    } catch (_) {}

    (async () => {
      try {
        const supabase = createClient();
        let { data: { session } } = await supabase.auth.getSession();

        // If session is still hydrating, retry up to 4 times
        for (let attempt = 0; !session && attempt < 4; attempt++) {
          await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
          const retry = await supabase.auth.getSession();
          session = retry.data?.session || null;
        }

        if (!session) {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            let hasExistingBootstrap = false;
            if (typeof window !== "undefined") {
              try {
                if (sessionStorage.getItem("workspace_bootstrap")) hasExistingBootstrap = true;
              } catch (_) {}
            }
            if (!hasExistingBootstrap && isMounted) {
              router.push("/login");
            }
            if (isMounted) setLoading(false);
            return;
          }
        }

        const getHeaders = (token) => {
          const h = { "Content-Type": "application/json" };
          if (token) {
            h["Authorization"] = `Bearer ${token}`;
          }
          return h;
        };

        let res = null;
        let ct = "";
        let retries = 0;
        const maxRetries = 3;

        while (retries < maxRetries) {
          try {
            res = await authFetch("/api/company/me");
            ct = res?.headers?.get("content-type") || "";
            if (res && ct.includes("application/json")) {
              break;
            }
          } catch (fetchErr) {
            console.warn("fetch /api/company/me retry notice:", fetchErr);
          }
          retries++;
          if (retries < maxRetries) {
            await new Promise((r) => setTimeout(r, 300 * retries));
          }
        }

        let resolvedData = null;

        if (res && ct.includes("application/json")) {
          if (res.status === 401) {
            const { data: { user: verifiedUser } } = await supabase.auth.getUser();
            if (!verifiedUser) {
              if (isMounted) router.push("/login");
              return;
            }
          } else if (res.status === 403) {
            if (isMounted) {
              setAuthError("Access denied. You are not authorized to view this workspace.");
              setLoading(false);
            }
            return;
          } else {
            resolvedData = await res.json();
          }
        }

        // Direct Supabase Client fallback if API route was unresponsive or returned non-JSON
        if (!resolvedData || !resolvedData.company) {
          try {
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (currentUser) {
              const uEmail = currentUser.email ? currentUser.email.toLowerCase().trim() : "";
              const sanitizedEmail = uEmail.replace(/"/g, '""');

              // 1. Try employees table
              const { data: empList } = await supabase
                .from("employees")
                .select("*, companies:company_id(*)")
                .or(`auth_user_id.eq.${currentUser.id},email.ilike."${sanitizedEmail}"`)
                .order("created_at", { ascending: false })
                .limit(1);

              const emp = empList?.[0];
              if (emp) {
                let comp = emp.companies;
                if (!comp && emp.company_id) {
                  const { data: c } = await supabase.from("companies").select("*").eq("id", emp.company_id).maybeSingle();
                  comp = c;
                }
                if (comp) {
                  resolvedData = {
                    company: comp,
                    role: emp.role || "employee",
                    employee: {
                      id: emp.id,
                      full_name: emp.full_name,
                      email: emp.email,
                      role: emp.role,
                      department: emp.department,
                      designation: emp.designation,
                      username: emp.username,
                      status: emp.status,
                      avatar_url: emp.avatar_url || null,
                      first_name: emp.first_name || (emp.full_name ? emp.full_name.split(" ")[0] : ""),
                      last_name: emp.last_name || (emp.full_name ? emp.full_name.split(" ").slice(1).join(" ") : ""),
                      employee_id: emp.employee_id || `EMP-${emp.id.slice(0, 5).toUpperCase()}`,
                      personal_email: emp.personal_email || "",
                      phone: emp.phone || "",
                      address: emp.address || "",
                      joining_date: emp.joining_date || null,
                    },
                    user: { id: currentUser.id, email: currentUser.email },
                  };
                }
              }

              // 2. If not employee, try company admin
              if (!resolvedData || !resolvedData.company) {
                const { data: compList } = await supabase
                  .from("companies")
                  .select("*")
                  .or(`admin_id.eq.${currentUser.id},email.ilike."${sanitizedEmail}"`)
                  .limit(1);

                const comp = compList?.[0];
                if (comp) {
                  resolvedData = {
                    company: comp,
                    role: "ADMIN",
                    employee: {
                      id: `admin-${currentUser.id.slice(0, 8)}`,
                      full_name: comp.name || "Company Owner",
                      email: uEmail,
                      role: "ADMIN",
                      department: "Executive Management",
                      designation: "Company Administrator",
                      username: uEmail.split("@")[0],
                      status: "active",
                      avatar_url: comp.logo_url || null,
                      first_name: (comp.name || "Owner").split(" ")[0],
                      last_name: (comp.name || "").split(" ").slice(1).join(" "),
                      employee_id: "EMP-ADMIN-001",
                      personal_email: uEmail,
                      phone: comp.phone || "",
                      address: comp.country ? `${comp.country}, ${comp.state || ""}` : "",
                      joining_date: comp.created_at || null,
                    },
                    user: { id: currentUser.id, email: currentUser.email },
                  };
                }
              }
            }
          } catch (dbFallbackErr) {
            console.warn("Direct Supabase fallback query error:", dbFallbackErr);
          }
        }

        if (resolvedData?.requiresSetup) {
          if (isMounted) router.push("/company-wizard");
          return;
        }

        if (resolvedData?.company) {
          if (isMounted) {
            setCompany(resolvedData.company);
            if (resolvedData.role) setUserRole(resolvedData.role);
            if (resolvedData.employee) setEmployeeProfile(resolvedData.employee);
            if (resolvedData.user) setUserSession(resolvedData.user);
            setAuthError("");

            if (typeof window !== "undefined") {
              try {
                sessionStorage.setItem("workspace_bootstrap", JSON.stringify({
                  company: resolvedData.company,
                  role: resolvedData.role,
                  employee: resolvedData.employee,
                  user: resolvedData.user,
                }));
              } catch (_) {}

              const welcomeDataStr = sessionStorage.getItem("login_welcome");
              if (welcomeDataStr) {
                sessionStorage.removeItem("login_welcome");
                try {
                  const w = JSON.parse(welcomeDataStr);
                  const dName = resolvedData.employee?.full_name || w.name || "User";
                  const cName = resolvedData.company?.name || w.company || "Workspace";
                  showToast(
                    `Welcome to ${cName}`,
                    `Signed in as ${dName}. Your workspace session is active.`,
                    "success"
                  );
                } catch (_) {}
              }
            }
          }
        } else {
          let hasExistingBootstrap = false;
          if (typeof window !== "undefined") {
            try {
              if (sessionStorage.getItem("workspace_bootstrap")) hasExistingBootstrap = true;
            } catch (_) {}
          }

          if (!hasExistingBootstrap && isMounted) {
            setAuthError("Could not resolve workspace details. Please try again or check your account.");
          }
        }
      } catch (err) {
        console.error("Dashboard session initialization error:", err);
        let hasExistingBootstrap = false;
        if (typeof window !== "undefined") {
          try {
            if (sessionStorage.getItem("workspace_bootstrap")) hasExistingBootstrap = true;
          } catch (_) {}
        }
        if (!hasExistingBootstrap && isMounted) {
          setAuthError("Network error. Could not load dashboard.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const fetchEmployees = async () => {
    setLoadingEmployees(true);
    try {
      const res = await authFetch("/api/employees/list");
      const ct = res.headers.get("content-type") || "";
      if (res.ok && ct.includes("application/json")) {
        const d = await res.json();
        if (Array.isArray(d.employees)) setEmployees(d.employees);
      }
    } catch (e) { console.error("fetchEmployees error:", e); }
    finally { setLoadingEmployees(false); }
  };

  const fetchDepts = async () => {
    try {
      const res = await authFetch("/api/departments");
      const ct = res.headers.get("content-type") || "";
      if (res.ok && ct.includes("application/json")) {
        const d = await res.json();
        if (Array.isArray(d.departments)) {
          setDbDepartments(d.departments);
          if (d.departments.length > 0 && !inviteForm.department) {
            const initialDept = resolveDepartmentForRole(inviteForm.role, d.departments, "");
            setInviteForm((p) => ({ ...p, department: initialDept }));
          }
        }
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (!company?.id) return;
    let active = true;
    async function loadCompanyData() {
      if (active) {
        await fetchEmployees();
        await fetchDepts();
      }
    }
    loadCompanyData();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);

  // Ensure employees are immediately loaded/refreshed when switching to Team Directory tab
  useEffect(() => {
    if (activeTab === "employees" && company?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchEmployees();
    }
  }, [activeTab, company?.id]);

  // Realtime subscriptions
  useEffect(() => {
    if (!company?.id) return;
    const supabase = createClient();

    const companyChannel = supabase
      .channel(`company-rt-${company.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "companies", filter: `id=eq.${company.id}` },
        (p) => { if (p.new) { setCompany((prev) => ({ ...prev, ...p.new })); setRealtimeStatus("synced"); } }
      )
      .subscribe((s) => { if (s === "SUBSCRIBED") setRealtimeStatus("active"); });

    const empChannel = supabase
      .channel(`emp-rt-${company.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "employees", filter: `company_id=eq.${company.id}` },
        (p) => {
          const isDeptScoped = ["manager", "team_lead"].includes(userRole);
          const myDept = employeeProfile?.department?.trim().toLowerCase();

          if (p.eventType === "INSERT") {
            const newDept = p.new?.department?.trim().toLowerCase();
            const isDeptRole = ["employee", "team_lead", "manager"].includes(p.new?.role);
            if (!isDeptScoped || (myDept && newDept === myDept && isDeptRole)) {
              setEmployees((prev) => {
                if (prev.some((e) => e.id === p.new?.id)) return prev;
                return [p.new, ...prev];
              });
              showToast("New Member", `${p.new?.full_name || "Employee"} joined the team.`, "success");
            }
            fetchEmployees();
          } else if (p.eventType === "UPDATE") {
            const updatedDept = p.new?.department?.trim().toLowerCase();
            const isDeptRole = ["employee", "team_lead", "manager"].includes(p.new?.role);
            if (!isDeptScoped) {
              setEmployees((prev) => prev.map((e) => e.id === p.new.id ? { ...e, ...p.new } : e));
              showToast("Member Updated", `${p.new?.full_name || "Employee"} profile updated.`);
            } else if (myDept && updatedDept === myDept && isDeptRole) {
              setEmployees((prev) => prev.map((e) => e.id === p.new.id ? { ...e, ...p.new } : e));
              showToast("Member Updated", `${p.new?.full_name || "Employee"} profile updated.`);
            } else {
              setEmployees((prev) => prev.filter((e) => e.id !== p.new?.id));
            }
            fetchEmployees();
          } else if (p.eventType === "DELETE") {
            setEmployees((prev) => prev.filter((e) => e.id !== p.old.id));
            fetchEmployees();
          }
        }
      )
      .subscribe();

    const leaveChannel = supabase
      .channel(`leave-rt-${company.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "leave_requests", filter: `company_id=eq.${company.id}` },
        (p) => {
          if (p.eventType === "INSERT") {
            if (isHR) {
              showToast("✈️ New Leave Request Received", `An employee submitted a new leave request (${p.new?.leave_type || "Leave"}, ${p.new?.total_days} day(s)).`, "info");
            }
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("leave-request-updated", { detail: p.new }));
            }
          } else if (p.eventType === "UPDATE") {
            if (!isHR) {
              showToast("✈️ Leave Request Update", `Your leave request status is now: ${p.new?.status}.`, p.new?.status === "APPROVED" ? "success" : "error");
            }
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("leave-request-updated", { detail: p.new }));
            }
          }
        }
      )
      .subscribe();

    const attendanceChannel = supabase
      .channel(`att-rt-${company.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "attendance", filter: `company_id=eq.${company.id}` },
        (p) => {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("attendance-updated", { detail: p.new }));
          }

          if (p.eventType === "INSERT") {
            if (isHR && p.new?.status === "CHECKED_IN") {
              showToast("🟢 Employee Checked In", "A staff member checked in for shift.", "info");
            }
          }

          if (p.eventType === "UPDATE") {
            if (p.new?.status === "PENDING_APPROVAL" && isHR) {
              showToast("⏱️ Early Check-Out Request", `Employee requested early check-out (${p.new?.working_hours} hrs, <8h).`, "info");
            } else if (p.new?.status === "REJECTED_LOP" || p.new?.is_lop) {
              showToast("⚠️ Early Check-Out Rejected", "Early check-out rejected. Marked as Loss of Pay (LOP).", "error");
            } else if (p.new?.approval_status === "APPROVED" && p.new?.early_checkout) {
              showToast("✅ Early Check-Out Approved", "Early check-out request approved by HR.", "success");
            }
          }
        }
      )
      .subscribe();

    const projectChannel = supabase
      .channel(`projects-rt-${company.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "projects", filter: `company_id=eq.${company.id}` },
        (p) => {
          if (p.eventType === "INSERT") {
            if (userRole === "team_lead" && p.new?.team_lead_id === employeeProfile?.id) {
              showToast("🚀 New Project Assigned", `Manager assigned you to project: "${p.new?.name}".`, "info");
            }
          } else if (p.eventType === "UPDATE") {
            if (userRole === "manager" && p.new?.created_by === employeeProfile?.id) {
              showToast("📋 Project Status Updated", `Project "${p.new?.name}" status updated to ${p.new?.status}.`, "info");
            }
          }
        }
      )
      .subscribe();

    const projectTaskChannel = supabase
      .channel(`project-tasks-rt-${company.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "project_tasks" },
        (p) => {
          const taskCompanyId = p.new?.company_id || p.old?.company_id;
          if (taskCompanyId && taskCompanyId !== company.id) return;

          const hasActiveAssignment = Boolean(p.new?.assigned_to && p.new.assigned_to === employeeProfile?.id);
          const cleanRole = (userRole || "").toLowerCase().replace(/[\s_-]+/g, "");
          const isLeadOrManager = cleanRole.includes("lead") || cleanRole.includes("manager") || cleanRole.includes("admin") || cleanRole.includes("supervisor");

          if (p.eventType === "INSERT") {
            // Only notify if task is actively assigned (i.e. sprint is already started)
            if (hasActiveAssignment) {
              showToast("🎯 New Task Assigned", `You have been assigned a new task: "${p.new?.title}".`, "info");
            }
          } else if (p.eventType === "UPDATE") {
            // When a sprint is started, tasks transition to being assigned to the employee
            const wasAssigned = p.old?.assigned_to ? p.old.assigned_to === employeeProfile?.id : false;
            const newlyAssigned = p.old?.assigned_to !== undefined && !wasAssigned && hasActiveAssignment;

            if (newlyAssigned) {
              showToast("🚀 Sprint Started - Task Assigned", `Task "${p.new?.title}" is now active and assigned to you.`, "info");
            }

            const statusChanged = Boolean(p.new?.status && (!p.old?.status || p.new.status !== p.old.status));

            if (isLeadOrManager && statusChanged) {
              // Team Lead / Manager monitoring notifications
              if (p.new.status === "IN_PROGRESS") {
                showToast("⚡ Task In Progress", `Employee started working on "${p.new.title}".`, "info");
              } else if (p.new.status === "REVIEW") {
                showToast("🔍 Task in Review", `Task "${p.new.title}" was submitted for review.`, "info");
              } else if (p.new.status === "COMPLETED") {
                showToast("✅ Task Completed", `Task "${p.new.title}" was completed!`, "success");
              } else if (p.new.status === "BLOCKED") {
                showToast("🛑 Task Blocked", `Task "${p.new.title}" was flagged as blocked!`, "warning");
              } else {
                showToast("📋 Task Status Updated", `Task "${p.new.title}" status changed to ${p.new.status}.`, "info");
              }
            } else if (hasActiveAssignment && statusChanged && !isLeadOrManager) {
              // Notification for employee if Team Lead updates task
              if (p.new.status === "COMPLETED") {
                showToast("🎉 Task Approved!", `Task "${p.new.title}" was reviewed and approved!`, "success");
              } else {
                showToast("📋 Task Updated", `Task "${p.new.title}" status is now ${p.new.status}.`, "info");
              }
            }
          }

          // Real-time sprint overdue warning when a task is assigned to a sprint or due date changes
          const sprintChanged = p.eventType === "INSERT" || (p.new?.sprint_id && p.new?.sprint_id !== p.old?.sprint_id) || (p.new?.due_date && p.new?.due_date !== p.old?.due_date);
          if (sprintChanged && p.new?.sprint_id && p.new?.due_date && isLeadOrManager) {
            supabase
              .from("project_sprints")
              .select("id, name, end_date")
              .eq("id", p.new.sprint_id)
              .maybeSingle()
              .then(({ data: spr }) => {
                if (spr) {
                  const overdue = checkTaskSprintOverdue(p.new.due_date, spr);
                  if (overdue) {
                    showToast(
                      "⚠️ Sprint Schedule Conflict",
                      `Task "${p.new.title}" due date (${overdue.taskDueDate}) exceeds Sprint "${overdue.sprintName}" by ${overdue.diffDays} day${overdue.diffDays > 1 ? "s" : ""}.`,
                      "warning"
                    );
                  }
                }
              })
              .catch(() => {});
          }

          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("project-task-updated", { detail: p }));
          }
        }
      )
      .subscribe();

    const presenceChannel = supabase.channel(`presence-${company.id}`);
    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const ids = new Set();
        Object.values(presenceChannel.presenceState()).forEach((arr) =>
          arr.forEach((p) => p.user_id && ids.add(p.user_id))
        );
        setOnlineUserIds(ids);
      })
      .subscribe(async (s) => {
        if (s === "SUBSCRIBED" && userSession?.user?.id)
          await presenceChannel.track({ user_id: userSession.user.id, online_at: new Date().toISOString() });
      });

    return () => {
      supabase.removeChannel(companyChannel);
      supabase.removeChannel(empChannel);
      supabase.removeChannel(leaveChannel);
      supabase.removeChannel(attendanceChannel);
      supabase.removeChannel(projectChannel);
      supabase.removeChannel(projectTaskChannel);
      supabase.removeChannel(presenceChannel);
    };
  }, [company?.id, isHR, userRole, employeeProfile?.id, employeeProfile?.department, userSession?.user?.id]);

  const handleLogout = async () => {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem("workspace_bootstrap");
        sessionStorage.removeItem("login_welcome");
      } catch (_) {}
    }
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleInviteSubmit = async (e) => {
    e.preventDefault();
    setInviteError(""); setInviteSuccessData(null);
    if (!inviteForm.fullName.trim()) { setInviteError("Full name is required."); return; }
    if (!inviteForm.email.trim()) { setInviteError("Email address is required."); return; }

    const isHrRoleTarget = ["hr_manager", "hr_executive"].includes(inviteForm.role);
    if (isHrRoleTarget && userRole !== "ADMIN") {
      setInviteError("Access denied. Only the Company Owner can invite HR Manager or HR Executive roles.");
      return;
    }

    const targetName = inviteForm.fullName.trim();
    const targetEmail = inviteForm.email.trim();
    setIsSubmittingInvite(true);
    try {
      const res = await authFetch("/api/employees/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inviteForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteError(data.message || "Failed to send invitation.");
      } else {
        closeInviteModal();
        showToast(
          "Invitation Dispatched",
          `Official workspace invitation sent to ${targetEmail} (${targetName}). Candidate status is now Pending Activation.`,
          "success"
        );
        fetchEmployees();
      }
    } catch { setInviteError("Network error. Please try again."); }
    finally { setIsSubmittingInvite(false); }
  };

  const handleRoleChange = (newRole) => {
    const allocatedDept = resolveDepartmentForRole(newRole, dbDepartments, inviteForm.department);
    setInviteForm((prev) => ({
      ...prev,
      role: newRole,
      department: allocatedDept,
    }));
  };

  const openInviteModal = (defaultRole = "employee") => {
    const validRole = typeof defaultRole === "string" && ["hr_manager", "hr_executive", "team_lead", "manager", "employee"].includes(defaultRole)
      ? defaultRole
      : "employee";
    const isHrTarget = ["hr_manager", "hr_executive"].includes(validRole);
    const initialRole = (isHrTarget && userRole !== "ADMIN") ? "employee" : validRole;
    const initialDept = resolveDepartmentForRole(initialRole, dbDepartments, "");
    setInviteForm({
      fullName: "",
      email: "",
      phone: "",
      department: initialDept,
      designation: "",
      role: initialRole,
    });
    setInviteError("");
    setInviteSuccessData(null);
    setIsInviteModalOpen(true);
  };

  const closeInviteModal = () => {
    setIsInviteModalOpen(false);
    setInviteError("");
    setInviteSuccessData(null);
  };

  const activeCount = employees.filter((e) => e.status === "active").length;
  const pendingCount = employees.filter((e) => e.status === "pending_offer").length;
  const onlineCount = employees.filter((e) => e.auth_user_id && onlineUserIds.has(e.auth_user_id)).length;
  const activePercent = employees.length > 0 ? Math.round((activeCount / employees.length) * 100) : 0;

  const filtered = employees.filter((e) => {
    const q = searchQuery.toLowerCase();
    const matchQ = !q || e.full_name?.toLowerCase().includes(q) || e.email?.toLowerCase().includes(q)
      || e.department?.toLowerCase().includes(q) || e.role?.toLowerCase().includes(q);
    const matchS = filterStatus === "all" || e.status === filterStatus;
    return matchQ && matchS;
  });

  // ── LOADING STATE ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1117] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-indigo-500/30 border-t-indigo-500 animate-spin" />
          <p className="text-sm text-slate-400 font-medium">Loading workspace…</p>
        </div>
      </div>
    );
  }

  // ── ERROR STATE ─────────────────────────────────────────────────────────────
  if (authError) {
    return (
      <div className="min-h-screen bg-[#0f1117] flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-[#1a1e2a] border border-rose-500/30 rounded-2xl p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-400 text-2xl flex items-center justify-center mx-auto">⚠</div>
          <h2 className="text-lg font-bold text-white">Access Error</h2>
          <p className="text-sm text-slate-400">{authError}</p>
          <div className="space-y-2 pt-2">
            <button
              onClick={() => {
                setAuthError("");
                setLoading(true);
                if (typeof window !== "undefined") window.location.reload();
              }}
              className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition cursor-pointer shadow-xs"
            >
              Retry Connection
            </button>
            <button
              onClick={() => router.push("/login")}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold transition cursor-pointer"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  const displayName = employeeProfile?.full_name || company?.name || "Member";
  const avatar = displayName.charAt(0).toUpperCase();

  // ── MAIN LAYOUT ─────────────────────────────────────────────────────────────
  // ── MAIN LAYOUT ─────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-[#f8fafc] text-slate-800 overflow-hidden font-sans">

      {/* Backdrop overlay for mobile screen */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs md:hidden"
        />
      )}

      {/* --- COLLAPSIBLE ENTERPRISE SIDEBAR --- */}
      <aside
        className={`
          fixed md:relative z-50 h-full flex flex-col
          bg-white border-r border-slate-200/80 shadow-xs
          transition-all duration-300 ease-in-out shrink-0
          ${sidebarOpen
            ? "w-72 translate-x-0"
            : "-translate-x-full md:translate-x-0 md:w-0 md:opacity-0 md:pointer-events-none md:border-r-0 md:overflow-hidden"
          }
        `}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-brand-gradient flex items-center justify-center text-white font-extrabold text-base shadow-xs shadow-[#1f6fb2]/25 shrink-0">
              {company?.name?.charAt(0)?.toUpperCase() || "H"}
            </div>
            <div className="min-w-0">
              <p className="text-base font-extrabold text-slate-900 truncate tracking-tight">{company?.name || "Workspace"}</p>
              <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Enterprise HRMS</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            title="Collapse Sidebar"
          >
            <span className="text-sm font-bold">✕</span>
          </button>
        </div>

        {/* Navigation Items with Enhanced Hover & Smooth Scroll */}
        <nav className="flex-1 overflow-y-auto px-3.5 py-3.5 space-y-1.5 custom-scroll scroll-smooth">
          {NAV_ITEMS
            .filter((item) => !(item.ownerOnly && !isAdmin))
            .filter((item) => !(item.key === "leave-requests" && userRole === "ADMIN"))
            .filter((item) => !(item.key === "projects" && !["ADMIN", "manager", "team_lead", "employee"].includes(userRole)))
            .map((item) => {
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => {
                  setActiveTab(item.key);
                  if (typeof window !== "undefined" && window.innerWidth < 768) {
                    setSidebarOpen(false);
                  }
                }}
                className={`
                  w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-[14px] font-bold tracking-tight transition-all duration-200 cursor-pointer group
                  ${active
                    ? "bg-brand-gradient text-white shadow-md shadow-[#1f6fb2]/25 scale-[1.01]"
                    : "text-slate-700 hover:text-slate-950 hover:bg-slate-100 hover:translate-x-1"
                  }
                `}
              >
                {getNavIcon(
                  item.key,
                  `w-5 h-5 shrink-0 transition-transform duration-200 ${active ? "text-white" : "text-slate-500 group-hover:text-slate-800 group-hover:scale-110"}`
                )}
                <span className="truncate">
                  {item.key === "projects" && userRole === "employee" ? "My Deliverables" : item.label}
                </span>
                {item.key === "employees" && (
                  <span className={`ml-auto text-xs font-extrabold px-2 py-0.5 rounded-lg ${active ? "bg-white/25 text-white" : "bg-slate-100 text-slate-700"}`}>
                    {employees.length}
                  </span>
                )}
                {item.key === "departments" && (
                  <span className={`ml-auto text-xs font-extrabold px-2 py-0.5 rounded-lg ${active ? "bg-white/25 text-white" : "bg-slate-100 text-slate-700"}`}>
                    {dbDepartments.length}
                  </span>
                )}
              </button>
            );
          })}

          {canInvite && (
            <div className="pt-2.5 border-t border-slate-100 mt-2.5">
              <button
                onClick={() => {
                  openInviteModal("employee");
                  if (typeof window !== "undefined" && window.innerWidth < 768) {
                    setSidebarOpen(false);
                  }
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition-all cursor-pointer group"
              >
                <span className="w-4 h-4 text-[#1f6fb2] font-bold text-sm">＋</span>
                <span>Invite Employee</span>
              </button>
            </div>
          )}
        </nav>

        {/* Footer: User Profile, Email, Role & Realtime Status at the Bottom */}
        <div className="p-3.5 border-t border-slate-100 space-y-2.5 bg-slate-50/60">
          {/* User Profile Card */}
          <div className="p-3 rounded-xl bg-white border border-slate-200/80 shadow-2xs space-y-2">
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                <div className="w-8 h-8 rounded-lg bg-brand-gradient flex items-center justify-center text-white font-extrabold text-xs shadow-2xs overflow-hidden">
                  {employeeProfile?.avatar_url ? (
                    <img
                      src={employeeProfile.avatar_url}
                      alt={displayName}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    avatar
                  )}
                </div>
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${
                    realtimeStatus === "active" || realtimeStatus === "synced"
                      ? "bg-emerald-500"
                      : "bg-amber-500"
                  }`}
                  title={realtimeStatus === "active" || realtimeStatus === "synced" ? "Online & Synced" : "Connecting..."}
                />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-900 truncate leading-tight">{displayName}</p>
                <p className="text-[10px] text-slate-500 truncate font-medium">{employeeProfile?.email || userSession?.email}</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 gap-1">
              <RoleBadge role={userRole} />
              <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${
                realtimeStatus === "active" || realtimeStatus === "synced"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                  : "bg-amber-50 text-amber-700 border border-amber-200/60"
              }`}>
                {realtimeStatus}
              </span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold text-slate-700 hover:text-rose-600 hover:bg-rose-50 border border-slate-200/80 hover:border-rose-200 transition-all cursor-pointer shadow-2xs"
          >
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* --- MAIN AREA --- */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top Header with Responsive Hamburger Menu Toggle */}
        <header className="h-14 shrink-0 flex items-center justify-between px-4 sm:px-6 border-b border-slate-200/80 bg-white shadow-2xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((prev) => !prev)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 transition-all cursor-pointer flex items-center justify-center"
              title={sidebarOpen ? "Collapse Navigation Menu" : "Expand Navigation Menu"}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div>
              <p className="text-base sm:text-lg font-bold text-slate-900 font-sans tracking-tight">
                {activeTab === "projects" && userRole === "employee"
                  ? "My Deliverables"
                  : NAV_ITEMS.find((n) => n.key === activeTab)?.label || "Dashboard"}
              </p>
              <p className="text-xs sm:text-[13px] text-slate-500 hidden sm:block font-sans font-medium">
                {company?.name} · Enterprise Workspace
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {canInvite && (
              <button
                onClick={() => openInviteModal("employee")}
                className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-brand-gradient hover:opacity-95 text-white text-xs font-semibold transition shadow-xs shadow-[#1f6fb2]/20 cursor-pointer"
              >
                <span>＋</span>
                <span>Invite</span>
              </button>
            )}
            <div className="hidden sm:block"><RoleBadge role={userRole} /></div>
            <button
              onClick={() => setActiveTab("settings")}
              className="relative flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 overflow-hidden bg-slate-100 hover:ring-2 hover:ring-[#1f6fb2]/40 transition cursor-pointer shrink-0"
              title="View My Profile"
            >
              {employeeProfile?.avatar_url ? (
                <img
                  src={employeeProfile.avatar_url}
                  alt={displayName}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <span className="text-xs font-extrabold text-[#1f6fb2]">{avatar}</span>
              )}
            </button>
          </div>
        </header>

        {/* Page Body */}
        <main id="main-scroll-container" className="flex-1 overflow-y-auto p-5 lg:p-7 space-y-6 animate-fadeIn scroll-smooth custom-scroll">

          {/* --- TAB: OVERVIEW --- */}
          {activeTab === "overview" && (
            isAdmin ? (
              <OwnerDashboard
                company={company}
                employees={employees}
                userSession={userSession}
                employeeProfile={employeeProfile}
                onOpenInviteModal={() => openInviteModal("hr_manager")}
                onEmployeeUpdated={fetchEmployees}
                renderRoleBadge={(r) => <RoleBadge role={r} />}
                renderStatusBadge={(s) => <StatusBadge status={s} />}
              />
            ) : (
              <>
                {/* Top Welcome & Workspace Banner for Staff / HR */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                    <div className="flex items-center gap-2.5">
                      <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                        Welcome, {displayName}
                      </h1>
                      <span className="px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 text-xs font-semibold border border-sky-200 capitalize">
                        {userRole.replace("_", " ")}
                      </span>
                    </div>
                  </div>

                  {/* Sub-role Quick Status Bar - 3 Columns (Organization, Assigned Role, Department) */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3.5 rounded-xl bg-slate-50/60 border border-slate-200/70 space-y-0.5">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Organization</span>
                      <span className="font-semibold text-slate-900 truncate block">{company?.name || "Workspace"}</span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-50/60 border border-slate-200/70 space-y-0.5">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Assigned Role</span>
                      <span className="font-semibold text-slate-900 truncate block">{ROLE_MAP[userRole]?.label || userRole}</span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-50/60 border border-slate-200/70 space-y-0.5">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Department</span>
                      <span className="font-semibold text-slate-900 truncate block">{employeeProfile?.department || "General"}</span>
                    </div>
                  </div>
                </div>

                {/* Top Summary Stat Cards matching Document & Payslips */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <StatCard label="Monthly Leave Quota" value="3.0 Days" />
                  <StatCard label="Available Leave Balance" value="3.0 Days" />
                  <StatCard
                    label={["manager", "team_lead"].includes(userRole) ? "Department Staff" : "Registered Staff"}
                    value={employees.length}
                  />
                  <StatCard
                    label={isHR ? "Pending Offers" : "Access Tier"}
                    value={isHR ? pendingCount : (ROLE_MAP[userRole]?.label || userRole)}
                  />
                </div>

                {/* Attendance & Shift Card */}
                <AttendanceCard />

                {/* Manager / TL Monthly Evaluation Banner */}
                {isLeadOrManager && !isAdmin && !isHR && (
                  <div className="bg-gradient-to-r from-sky-50/70 via-cyan-50/50 to-teal-50/70 border border-sky-200/80 rounded-2xl p-5 sm:p-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xs">
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#1f6fb2]" />
                        <span>Manager Monthly Team Performance Evaluation</span>
                      </h3>
                      <p className="text-xs text-slate-600">
                        Evaluate team members on task completion, deadline punctuality, learning agility, innovation, and collaboration. Submit scores and monthly feedback remarks.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEmpForTLEval(null);
                        setShowTLMonthlyEvalModal(true);
                      }}
                      className="px-4 py-2.5 rounded-xl bg-brand-gradient hover:opacity-95 text-white text-xs font-semibold shadow-xs shadow-[#1f6fb2]/20 transition-all shrink-0 cursor-pointer flex items-center gap-1.5 active:scale-[0.98]"
                    >
                      <span>Open Monthly Evaluation</span>
                    </button>
                  </div>
                )}

                {/* Leave Request Quick Action Banner */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                      {isHR ? "HR Leave Approval Inbox" : "Employee Leave Request Portal"}
                    </h3>
                  </div>
                  <button
                    onClick={() => setActiveTab("leave-requests")}
                    className="px-4 py-2 rounded-xl bg-brand-gradient hover:opacity-95 text-white text-xs font-semibold shadow-xs shadow-[#1f6fb2]/20 transition-all shrink-0 cursor-pointer"
                  >
                    {isHR ? "Review Approval Inbox →" : "Apply / Manage Leaves →"}
                  </button>
                </div>
              </>
            )
          )}

          {/* --- TAB: EXECUTIVE APPRAISALS & EVALUATIONS (OWNER ONLY) --- */}
          {activeTab === "evaluations" && isAdmin && (
            <ExecutivePerformanceMatrix />
          )}

          {/* --- TAB: PROJECTS --- */}
          {activeTab === "projects" && (
            <ProjectManagement
              userRole={userRole}
              employeeProfile={employeeProfile}
              company={company}
              onlineUserIds={onlineUserIds}
            />
          )}

          {/* --- TAB: ATTENDANCE --- */}
          {activeTab === "attendance" && (
            <AttendancePage userRole={userRole} />
          )}

          {/* --- TAB: WORK CALENDAR --- */}
          {activeTab === "calendar" && (
            <CompanyCalendar userRole={userRole} />
          )}

          {/* --- TAB: LEAVE REQUESTS --- */}
          {activeTab === "leave-requests" && (
            <LeaveManagement
              userRole={userRole}
              employeeProfile={employeeProfile}
              company={company}
            />
          )}

          {/* --- TAB: DOCUMENTS & PAYSLIPS --- */}
          {activeTab === "documents" && (
            isHR || isAdmin ? (
              <EmployeeDocumentManager initialEmployees={employees} />
            ) : (
              <MyDocumentsCard />
            )
          )}

          {/* --- TAB: TEAM DIRECTORY --- */}
          {activeTab === "employees" && (
            <div className="space-y-6">
              {/* Master Card matching Attendance theme */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs">
                {/* Master Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                      {["manager", "team_lead"].includes(userRole)
                        ? `${employeeProfile?.department ? `${employeeProfile.department} ` : ""}Team Directory`
                        : "Team & Staff Directory"}
                    </h2>
                  </div>

                  <div className="flex items-center gap-2.5">
                    {canInvite && (
                      <button
                        type="button"
                        onClick={() => openInviteModal("employee")}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold transition-colors shadow-xs shadow-sky-600/20 cursor-pointer"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                        </svg>
                        <span>Invite Member</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => fetchEmployees()}
                      className="p-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/80 text-slate-600 transition-colors shadow-2xs cursor-pointer flex items-center justify-center"
                      title="Refresh Staff Directory"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* 3 Clean Summary Stat Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-1">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                      {["manager", "team_lead"].includes(userRole) ? "Department Staff" : "Registered Staff"}
                    </span>
                    <div className="text-xl font-bold text-slate-900 font-mono">{employees.length}</div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-1">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                      {["manager", "team_lead"].includes(userRole) ? "Active In Dept" : "Active Members"}
                    </span>
                    <div className="text-xl font-bold text-slate-900 font-mono">{activeCount}</div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-1">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                      {["manager", "team_lead"].includes(userRole) ? "Pending Offers" : "Pending Invites"}
                    </span>
                    <div className="text-xl font-bold text-slate-900 font-mono">{pendingCount}</div>
                  </div>
                </div>

                {/* Search & Filter Controls */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/70">
                  <div className="relative flex-1 w-full sm:max-w-xs">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      placeholder="Search name, email, department…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-white border border-slate-200/80 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 transition shadow-2xs"
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
                      className="bg-white border border-slate-200/80 text-slate-800 text-xs font-medium rounded-xl px-3.5 py-2 focus:outline-none focus:border-sky-500 w-full sm:w-auto cursor-pointer shadow-2xs"
                    >
                      <option value="all">All Members ({employees.length})</option>
                      <option value="active">Active ({activeCount})</option>
                      <option value="pending_offer">Pending ({pendingCount})</option>
                    </select>

                    <span className="text-xs font-mono font-semibold text-slate-500 bg-white px-3 py-2 rounded-xl border border-slate-200/80 shadow-2xs whitespace-nowrap">
                      {filtered.length} of {employees.length}
                    </span>
                  </div>
                </div>

                {/* Table */}
                {loadingEmployees ? (
                  <div className="py-16 flex items-center justify-center gap-2.5 text-slate-500 text-xs">
                    <div className="w-4 h-4 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
                    <span>Loading staff directory…</span>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="py-16 text-center space-y-2 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                    <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <p className="text-xs font-bold text-slate-800">
                      {employees.length === 0
                        ? ["manager", "team_lead"].includes(userRole)
                          ? "No Department Members Found"
                          : "No Staff Members Added Yet"
                        : "No Matching Staff Members Found"}
                    </p>
                    <p className="text-xs text-slate-400">
                      {employees.length === 0
                        ? ["manager", "team_lead"].includes(userRole)
                          ? `No members, managers, or team leads currently assigned to the ${employeeProfile?.department || "your"} department.`
                          : "Invite your first team member or employee to begin building your organization."
                        : `No members match "${searchQuery}". Try adjusting your search query or filter.`}
                    </p>
                  </div>
                ) : (
                  <div className="border border-slate-200/80 rounded-xl overflow-hidden shadow-2xs bg-white">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs min-w-[700px]">
                        <thead className="bg-slate-50/90 border-b border-slate-200/80 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                          <tr>
                            <th className="py-3 px-5">Member</th>
                            <th className="py-3 px-5">Role</th>
                            <th className="py-3 px-5">Department</th>
                            <th className="py-3 px-5">Joining Date</th>
                            {canInvite && <th className="py-3 px-5 text-right">Actions</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {filtered.map((emp) => {
                            const initial = emp.full_name ? emp.full_name.charAt(0).toUpperCase() : "?";

                            return (
                              <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors group">
                                <td className="py-3.5 px-5">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs overflow-hidden">
                                      {emp.avatar_url ? (
                                        <img
                                          src={emp.avatar_url}
                                          alt={emp.full_name || "Employee"}
                                          className="w-full h-full object-cover"
                                          onError={(e) => {
                                            e.currentTarget.style.display = "none";
                                          }}
                                        />
                                      ) : (
                                        initial
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="font-semibold text-slate-900 text-xs truncate max-w-xs flex items-center gap-1.5">
                                        <span>{emp.full_name}</span>
                                        {emp.auth_user_id && onlineUserIds.has(emp.auth_user_id) && (
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-bold">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                            Online
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-slate-500 font-mono truncate max-w-xs mt-0.5">{emp.email}</div>
                                    </div>
                                  </div>
                                </td>

                                <td className="py-3.5 px-5">
                                  <RoleBadge role={emp.role} />
                                </td>

                                <td className="py-3.5 px-5">
                                  <div className="space-y-0.5">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                      {emp.department || "General"}
                                    </span>
                                    {emp.designation && (
                                      <p className="text-[11px] text-slate-500">{emp.designation}</p>
                                    )}
                                  </div>
                                </td>

                                <td className="py-3.5 px-5 font-mono text-slate-600 text-xs">
                                  {emp.joining_date ? new Date(emp.joining_date).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) : "—"}
                                </td>

                                {canInvite && (
                                  <td className="py-3.5 px-5 text-right">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedEmpForRoleModal(emp);
                                        setIsRoleModalOpen(true);
                                      }}
                                      className="px-3 py-1 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 text-xs font-semibold transition cursor-pointer shadow-2xs"
                                      title="Promote or Change Role"
                                    >
                                      Edit Role
                                    </button>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* --- TAB: DEPARTMENTS --- */}
          {activeTab === "departments" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-1">
                <DepartmentSummary
                  employees={employees}
                  onManageDepartments={isAdmin ? () => setIsDeptModalOpen(true) : null}
                />
              </div>
              <div className="lg:col-span-2 bg-white border border-sky-100 rounded-2xl p-6 space-y-5 shadow-2xs">
                <div className="flex items-center justify-between border-b border-sky-100 pb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Department Records</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Configured company departments & headcounts</p>
                  </div>
                  {isAdmin && (
                    <button onClick={() => setIsDeptModalOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition cursor-pointer shadow-2xs">
                      ⚙ Manage
                    </button>
                  )}
                </div>
                {dbDepartments.length === 0 ? (
                  <div className="py-12 text-center text-slate-500">
                    <p className="text-2xl mb-2">⊟</p>
                    <p className="text-sm">No departments configured yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {dbDepartments.map((dept) => {
                      const count = employees.filter((e) => e.department?.trim() === dept.name).length;
                      return (
                        <div key={dept.id || dept.name}
                          className="p-4 rounded-xl bg-sky-50/40 border border-sky-100 hover:border-sky-300 transition-colors space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-bold text-slate-900">{dept.name}</p>
                            {dept.code && (
                              <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-200 font-mono text-[10px] font-semibold">
                                {dept.code}
                              </span>
                            )}
                          </div>
                          {dept.description && <p className="text-xs text-slate-500 leading-relaxed">{dept.description}</p>}
                          <div className="flex items-center justify-between pt-2 border-t border-sky-100 text-[10px]">
                            <span className="text-slate-500">Members</span>
                            <span className="font-bold text-slate-800">{count}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* --- TAB: SETTINGS (MY PROFILE) --- */}
          {activeTab === "settings" && (
            <div className="max-w-4xl space-y-6">
              <form onSubmit={handleProfileSave} className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
                {/* Profile Header & Photo Upload */}
                <div className="bg-white border-b border-slate-100 p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="relative group shrink-0">
                      <div className="w-16 h-16 rounded-2xl overflow-hidden border border-slate-200/80 bg-slate-50 text-[#1f6fb2] flex items-center justify-center font-bold text-xl shadow-2xs relative">
                        {avatar}
                        {(profileForm.avatarUrl || employeeProfile?.avatar_url) && (
                          <img
                            src={profileForm.avatarUrl || employeeProfile?.avatar_url}
                            alt="Profile Avatar"
                            className="absolute inset-0 w-full h-full object-cover bg-white"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        )}
                      </div>
                      {isUploadingAvatar && (
                        <div className="absolute inset-0 rounded-2xl bg-slate-900/60 flex items-center justify-center text-white text-[10px] font-bold z-10">
                          <svg className="animate-spin w-5 h-5 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        </div>
                      )}
                      <label className="absolute inset-0 rounded-2xl bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer text-white text-[11px] font-semibold z-20">
                        Change
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarChange}
                          disabled={isUploadingAvatar}
                          className="hidden"
                        />
                      </label>
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight truncate">
                        {displayName}
                      </h2>
                    </div>
                  </div>

                  <label className={`cursor-pointer px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 text-xs font-semibold transition flex items-center gap-1.5 shadow-2xs shrink-0 self-stretch sm:self-auto justify-center ${isUploadingAvatar ? "opacity-60 pointer-events-none" : ""}`}>
                    <span>{isUploadingAvatar ? "Uploading..." : "Upload Photo"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      disabled={isUploadingAvatar}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Notifications */}
                {profileMsg.error && (
                  <div className="mx-6 mt-6 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center justify-between">
                    <span>{profileMsg.error}</span>
                    <button type="button" onClick={() => setProfileMsg({ error: "", success: "" })} className="text-rose-500">✕</button>
                  </div>
                )}
                {profileMsg.success && (
                  <div className="mx-6 mt-6 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between">
                    <span>{profileMsg.success}</span>
                    <button type="button" onClick={() => setProfileMsg({ error: "", success: "" })} className="text-emerald-600">✕</button>
                  </div>
                )}

                <div className="p-5 sm:p-6 space-y-6">
                  {/* SECTION 1: Workspace Account Information */}
                  <div className="space-y-3">
                    <div className="border-b border-slate-100 pb-2.5 flex items-center justify-between">
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        Workspace Account Information
                      </h3>
                      <span className="text-[10px] text-slate-400 font-medium">
                        Managed by Organization
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Employee ID */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                          Employee ID
                        </label>
                        <input
                          type="text"
                          disabled
                          readOnly
                          value={employeeProfile?.employee_id || `EMP-${employeeProfile?.id?.slice(0, 5)?.toUpperCase() || "001"}`}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50/70 border border-slate-200/80 text-slate-700 font-mono text-xs cursor-not-allowed select-none outline-none shadow-2xs"
                        />
                      </div>

                      {/* Work Email */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                          Official Work Email
                        </label>
                        <input
                          type="email"
                          disabled
                          readOnly
                          value={employeeProfile?.email || userSession?.email || ""}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50/70 border border-slate-200/80 text-slate-700 font-mono text-xs cursor-not-allowed select-none outline-none shadow-2xs"
                        />
                      </div>

                      {/* Department */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                          Assigned Department
                        </label>
                        <input
                          type="text"
                          disabled
                          readOnly
                          value={employeeProfile?.department || "General"}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50/70 border border-slate-200/80 text-slate-700 text-xs cursor-not-allowed select-none outline-none shadow-2xs"
                        />
                      </div>

                      {/* Username */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                          Username
                        </label>
                        <input
                          type="text"
                          disabled
                          readOnly
                          value={employeeProfile?.username ? `@${employeeProfile.username}` : "Not configured"}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50/70 border border-slate-200/80 text-slate-700 font-mono text-xs cursor-not-allowed select-none outline-none shadow-2xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* SECTION 2: Personal Profile & Contact Information */}
                  <div className="space-y-4 pt-2">
                    <div className="border-b border-slate-100 pb-2.5">
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        Personal Profile &amp; Contact Details
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* First Name */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                          First Name
                        </label>
                        <input
                          type="text"
                          value={profileForm.firstName}
                          onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })}
                          placeholder="First Name"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200/80 text-slate-900 placeholder:text-slate-400 text-xs focus:border-[#1f6fb2] focus:ring-1 focus:ring-[#1f6fb2]/20 outline-none transition shadow-2xs font-medium"
                        />
                      </div>

                      {/* Last Name */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                          Last Name
                        </label>
                        <input
                          type="text"
                          value={profileForm.lastName}
                          onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })}
                          placeholder="Last Name"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200/80 text-slate-900 placeholder:text-slate-400 text-xs focus:border-[#1f6fb2] focus:ring-1 focus:ring-[#1f6fb2]/20 outline-none transition shadow-2xs font-medium"
                        />
                      </div>

                      {/* Personal Email */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                          Personal Email Address
                        </label>
                        <input
                          type="email"
                          value={profileForm.personalEmail}
                          onChange={(e) => setProfileForm({ ...profileForm, personalEmail: e.target.value })}
                          placeholder="personal.email@example.com"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200/80 text-slate-900 placeholder:text-slate-400 text-xs focus:border-[#1f6fb2] focus:ring-1 focus:ring-[#1f6fb2]/20 outline-none transition shadow-2xs font-medium"
                        />
                      </div>

                      {/* Phone Number */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                          Phone Number
                        </label>
                        <input
                          type="tel"
                          value={profileForm.phone}
                          onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                          placeholder="+1 (555) 000-0000"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200/80 text-slate-900 placeholder:text-slate-400 text-xs focus:border-[#1f6fb2] focus:ring-1 focus:ring-[#1f6fb2]/20 outline-none transition shadow-2xs font-medium"
                        />
                      </div>

                      {/* Joining Date */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                          Date of Joining
                        </label>
                        <input
                          type="date"
                          value={profileForm.joiningDate}
                          onChange={(e) => setProfileForm({ ...profileForm, joiningDate: e.target.value })}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200/80 text-slate-900 text-xs focus:border-[#1f6fb2] focus:ring-1 focus:ring-[#1f6fb2]/20 outline-none transition shadow-2xs cursor-pointer font-medium"
                        />
                      </div>
                    </div>

                    {/* Address */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                        Residential Address
                      </label>
                      <textarea
                        rows={2}
                        value={profileForm.address}
                        onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                        placeholder="Residential address details"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200/80 text-slate-900 placeholder:text-slate-400 text-xs focus:border-[#1f6fb2] focus:ring-1 focus:ring-[#1f6fb2]/20 outline-none transition shadow-2xs resize-none font-medium"
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="px-4 py-2.5 rounded-xl border border-slate-200/80 bg-white text-slate-600 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 text-xs font-semibold transition-all w-full sm:w-auto justify-center cursor-pointer shadow-2xs"
                    >
                      Sign Out
                    </button>

                    <button
                      type="submit"
                      disabled={isSavingProfile}
                      className="px-5 py-2.5 rounded-xl bg-brand-gradient hover:opacity-95 text-white text-xs font-semibold disabled:opacity-50 transition shadow-xs shadow-[#1f6fb2]/20 w-full sm:w-auto justify-center cursor-pointer flex items-center gap-2"
                    >
                      {isSavingProfile ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Saving Changes...</span>
                        </>
                      ) : (
                        <span>Save Profile Details</span>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}
        </main>
      </div>

      {/* --- INVITE MODAL (MATCHING CONFIGURE HOURS POPUP THEME) --- */}
      {isInviteModalOpen && canInvite && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmittingInvite) closeInviteModal();
          }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto animate-fadeIn"
        >
          <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col m-auto my-auto animate-scaleIn">
            {/* Top Header matching Configure Hours */}
            <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-1.5 font-sans">
                <span className="font-bold text-slate-900 text-sm sm:text-base">Invite:</span>
                <span className="text-[#1f6fb2] font-bold text-sm sm:text-base">
                  Team Member
                </span>
              </div>

              {/* Close button */}
              <button
                type="button"
                disabled={isSubmittingInvite}
                onClick={closeInviteModal}
                className="w-7 h-7 border border-slate-200 hover:border-slate-300 text-slate-400 hover:text-slate-700 rounded-lg flex items-center justify-center text-xs transition cursor-pointer disabled:opacity-50 shadow-2xs"
                title="Close"
              >
                ✕
              </button>
            </div>

            {inviteSuccessData ? (
              <div className="p-6 space-y-4 text-xs">
                <div className="p-5 rounded-2xl bg-emerald-50/90 border border-emerald-200 text-center space-y-2 shadow-2xs">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto text-lg font-bold">
                    ✓
                  </div>
                  <h4 className="text-sm font-bold text-emerald-950">Invitation Dispatched Successfully!</h4>
                  <p className="text-xs text-slate-600">
                    Official workspace invitation sent to <strong className="text-slate-900 font-mono">{inviteSuccessData.employee?.email}</strong>.
                  </p>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={closeInviteModal}
                    className="px-4 py-2 rounded-xl bg-brand-gradient hover:opacity-95 text-white font-semibold text-xs transition cursor-pointer shadow-xs shadow-[#1f6fb2]/20"
                  >
                    Done &amp; Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleInviteSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                {inviteError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                    {inviteError}
                  </div>
                )}

                {/* Section 1: Candidate Identity */}
                <div className="space-y-3">
                  <span className="text-[11px] font-bold text-[#1f6fb2] uppercase tracking-wider block">
                    Member Information
                  </span>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="sm:w-36 text-xs font-semibold text-slate-700">
                      Candidate Name <span className="text-rose-500">*</span>
                    </label>
                    <div className="flex-1">
                      <input
                        type="text"
                        name="fullName"
                        placeholder="e.g. Sarah Jenkins"
                        required
                        value={inviteForm.fullName}
                        onChange={(e) => setInviteForm({ ...inviteForm, fullName: e.target.value })}
                        className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition placeholder:text-slate-400 font-medium"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="sm:w-36 text-xs font-semibold text-slate-700">
                      Work Email <span className="text-rose-500">*</span>
                    </label>
                    <div className="flex-1">
                      <input
                        type="email"
                        name="email"
                        placeholder="sarah@company.com"
                        required
                        value={inviteForm.email}
                        onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                        className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition placeholder:text-slate-400 font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Small separation divider */}
                <div className="border-t border-slate-100" />

                {/* Section 2: Position & Assignment */}
                <div className="space-y-3">
                  <span className="text-[11px] font-bold text-[#1f6fb2] uppercase tracking-wider block">
                    Position &amp; Assignment
                  </span>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="sm:w-36 text-xs font-semibold text-slate-700">
                      System Role <span className="text-rose-500">*</span>
                    </label>
                    <div className="flex-1">
                      <select
                        name="role"
                        value={inviteForm.role}
                        onChange={(e) => handleRoleChange(e.target.value)}
                        className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 cursor-pointer outline-none shadow-2xs transition font-medium"
                      >
                        <option value="employee">Standard Employee</option>
                        {userRole === "ADMIN" && (
                          <>
                            <option value="hr_manager">HR Manager</option>
                            <option value="hr_executive">HR Executive</option>
                          </>
                        )}
                        <option value="team_lead">Team Lead</option>
                        <option value="manager">Manager / Supervisor</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="sm:w-36 text-xs font-semibold text-slate-700">
                      Department <span className="text-rose-500">*</span>
                    </label>
                    <div className="flex-1">
                      <select
                        name="department"
                        value={inviteForm.department}
                        onChange={(e) => setInviteForm({ ...inviteForm, department: e.target.value })}
                        className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 cursor-pointer outline-none shadow-2xs transition font-medium"
                      >
                        {getDepartmentsForRole(inviteForm.role, dbDepartments).map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="sm:w-36 text-xs font-semibold text-slate-700">
                      Job Designation
                    </label>
                    <div className="flex-1">
                      <input
                        type="text"
                        name="designation"
                        placeholder="e.g. Senior Software Engineer"
                        value={inviteForm.designation}
                        onChange={(e) => setInviteForm({ ...inviteForm, designation: e.target.value })}
                        className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition placeholder:text-slate-400 font-medium"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="sm:w-36 text-xs font-semibold text-slate-700">
                      Contact Phone
                    </label>
                    <div className="flex-1">
                      <input
                        type="text"
                        name="phone"
                        placeholder="+1 (555) 0199"
                        value={inviteForm.phone}
                        onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })}
                        className="w-full border border-slate-200 focus:border-[#1f6fb2] focus:ring-2 focus:ring-[#1f6fb2]/20 rounded-xl px-3.5 py-2 text-xs bg-white text-slate-900 outline-none shadow-2xs transition placeholder:text-slate-400 font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Bottom Action Buttons */}
                <div className="pt-4 border-t border-slate-100 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={isSubmittingInvite}
                    className="px-4 py-2 rounded-xl bg-brand-gradient hover:opacity-95 text-white font-semibold text-xs transition cursor-pointer disabled:opacity-50 shadow-xs shadow-[#1f6fb2]/20 flex items-center gap-2"
                  >
                    {isSubmittingInvite ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Sending Invitation…</span>
                      </>
                    ) : (
                      <span>Send Invitation</span>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={isSubmittingInvite}
                    onClick={closeInviteModal}
                    className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium text-xs transition cursor-pointer disabled:opacity-50 shadow-2xs"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* --- DEPARTMENT MODAL --- */}
      <DepartmentManagementModal
        isOpen={isDeptModalOpen}
        onClose={() => setIsDeptModalOpen(false)}
        onRefreshData={fetchDepts}
      />

      {/* --- ROLE PROMOTION & MANAGEMENT MODAL --- */}
      <RolePromotionModal
        isOpen={isRoleModalOpen}
        onClose={() => {
          setIsRoleModalOpen(false);
          setSelectedEmpForRoleModal(null);
        }}
        employee={selectedEmpForRoleModal}
        currentUserRole={userRole}
        onRoleUpdated={(updated) => {
          fetchEmployees();
          showToast(
            "Role Updated",
            `${updated.full_name || "Employee"} is now assigned as ${updated.role?.replace(/_/g, " ")}.`,
            "success"
          );
        }}
      />

      {/* --- REALTIME TOAST NOTIFICATION POPUP (5-SECOND AUTO-DISMISS) --- */}
      {realtimeToast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full animate-in fade-in slide-in-from-bottom-5 duration-300 pointer-events-auto">
          <div
            className={`p-4 rounded-2xl shadow-xl border backdrop-blur-md relative overflow-hidden flex items-start justify-between gap-3 ${
              realtimeToast.type === "error"
                ? "bg-rose-50/95 border-rose-200 text-rose-900"
                : realtimeToast.type === "warning"
                ? "bg-amber-50/95 border-amber-200 text-amber-900"
                : realtimeToast.type === "success"
                ? "bg-emerald-50/95 border-emerald-200 text-emerald-900"
                : "bg-white/95 border-slate-200 text-slate-800 shadow-slate-200/50"
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="text-lg shrink-0 mt-0.5">
                {realtimeToast.type === "error"
                  ? "❌"
                  : realtimeToast.type === "warning"
                  ? "⚠️"
                  : realtimeToast.type === "success"
                  ? "✅"
                  : "🔔"}
              </span>
              <div>
                <p className="font-bold text-xs leading-snug">{realtimeToast.title}</p>
                <p className="text-[11px] opacity-90 mt-0.5 leading-relaxed">{realtimeToast.message}</p>
              </div>
            </div>
            <button
              onClick={() => setRealtimeToast(null)}
              className="text-xs opacity-50 hover:opacity-100 transition p-1 cursor-pointer"
              title="Dismiss"
            >
              ✕
            </button>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/5">
              <div
                className={`h-full ${
                  realtimeToast.type === "error"
                    ? "bg-rose-500"
                    : realtimeToast.type === "warning"
                    ? "bg-amber-500"
                    : realtimeToast.type === "success"
                    ? "bg-emerald-500"
                    : "bg-sky-500"
                }`}
                style={{
                  width: "100%",
                  animation: "shrinkProgress 5s linear forwards",
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PAGE EXPORT ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-sky-500/30 border-t-sky-600 animate-spin" />
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
