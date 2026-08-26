"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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

// ─── NAV CONFIG ──────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { key: "overview", label: "Overview", icon: "◈" },
  { key: "attendance", label: "Attendance", icon: "⏱" },
  { key: "calendar", label: "Work Calendar", icon: "📅" },
  { key: "leave-requests", label: "Leave Requests", icon: "✈" },
  { key: "documents", label: "Documents & Payslips", icon: "📄" },
  { key: "employees", label: "Team Directory", icon: "⊞" },
  { key: "departments", label: "Departments", icon: "⊟" },
  { key: "settings", label: "My Profile", icon: "◎" },
];

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
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${r.bg} ${r.color}`}>
      {r.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || { label: status, dot: "bg-slate-400", pill: "bg-slate-100 text-slate-700 border-slate-200" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${s.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

// ─── STAT CARD ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon, accent = "indigo" }) {
  const colors = {
    indigo: "from-sky-500/10 to-indigo-500/10 border-sky-200 text-sky-700",
    emerald: "from-emerald-500/10 to-teal-500/10 border-emerald-200 text-emerald-700",
    amber: "from-amber-500/10 to-orange-500/10 border-amber-200 text-amber-700",
    cyan: "from-cyan-500/10 to-blue-500/10 border-cyan-200 text-blue-700",
  };
  return (
    <div className="relative bg-white border border-sky-100/90 rounded-2xl p-5 overflow-hidden group hover:border-sky-300 hover:shadow-md transition-all duration-300 shadow-2xs">
      <div className={`absolute inset-0 bg-gradient-to-br ${colors[accent]} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
          <div className={`w-9 h-9 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sm shadow-2xs`}>
            {icon}
          </div>
        </div>
        {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

// ─── MAIN DASHBOARD CONTENT ──────────────────────────────────────────────────
function DashboardContent() {
  const router = useRouter();

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dbDepartments, setDbDepartments] = useState([]);


  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    fullName: "", email: "", phone: "",
    department: "Engineering", designation: "", role: "employee",
  });

  // Computed Roles
  const isAdmin = userRole === "ADMIN";
  const isHR = ["hr_manager", "hr_executive"].includes(userRole);
  const canInvite = isAdmin || isHR;
  const isManager = ["ADMIN", "hr_manager", "manager", "team_lead"].includes(userRole);
  const isStaff = userRole === "employee";
  const [isSubmittingInvite, setIsSubmittingInvite] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccessData, setInviteSuccessData] = useState(null);

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

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileForm((prev) => ({ ...prev, avatarUrl: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setProfileMsg({ error: "", success: "" });
    setIsSavingProfile(true);
    try {
      const res = await fetch("/api/employees/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setProfileMsg({ error: data.message || "Failed to update profile.", success: "" });
      } else {
        setProfileMsg({ error: "", success: "Profile details updated successfully!" });
        if (data.employee) setEmployeeProfile(data.employee);
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
    setTimeout(() => setRealtimeToast((c) => (c?.id === id ? null : c)), 4500);
  };

  // Fetch company + role
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/company/me");
        if (res.status === 401) { router.push("/login"); return; }
        if (res.status === 403) {
          setAuthError("Access denied. You are not authorized to view this workspace.");
          setLoading(false); return;
        }
        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          setAuthError("Invalid server response. Please try again.");
          setLoading(false); return;
        }
        const data = await res.json();
        if (!res.ok) { setAuthError(data.message || "Failed to load workspace."); setLoading(false); return; }
        if (data.company) setCompany(data.company);
        if (data.role) setUserRole(data.role);
        if (data.employee) setEmployeeProfile(data.employee);
        if (data.user) setUserSession(data.user);
      } catch {
        setAuthError("Network error. Could not load dashboard.");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const fetchEmployees = async () => {
    setLoadingEmployees(true);
    try {
      const res = await fetch("/api/employees/list");
      const ct = res.headers.get("content-type") || "";
      if (res.ok && ct.includes("application/json")) {
        const d = await res.json();
        if (d.employees) setEmployees(d.employees);
      }
    } catch (e) { console.error(e); }
    finally { setLoadingEmployees(false); }
  };

  const fetchDepts = async () => {
    try {
      const res = await fetch("/api/departments");
      const ct = res.headers.get("content-type") || "";
      if (res.ok && ct.includes("application/json")) {
        const d = await res.json();
        if (Array.isArray(d.departments)) {
          setDbDepartments(d.departments);
          if (d.departments.length > 0 && !inviteForm.department)
            setInviteForm((p) => ({ ...p, department: d.departments[0].name }));
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
  }, [company?.id]);

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
          if (p.eventType === "INSERT") {
            setEmployees((prev) => [p.new, ...prev]);
            showToast("New Member", `${p.new?.full_name || "Employee"} joined the team.`, "success");
          } else if (p.eventType === "UPDATE") {
            setEmployees((prev) => prev.map((e) => e.id === p.new.id ? { ...e, ...p.new } : e));
            showToast("Member Updated", `${p.new?.full_name || "Employee"} profile updated.`);
          } else if (p.eventType === "DELETE") {
            setEmployees((prev) => prev.filter((e) => e.id !== p.old.id));
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
      supabase.removeChannel(presenceChannel);
    };
  }, [company?.id, isHR, userSession?.user?.id]);

  const handleLogout = async () => {
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

    setIsSubmittingInvite(true);
    try {
      const res = await fetch("/api/employees/invite", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inviteForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteError(data.message || "Failed to send invitation.");
      } else {
        setInviteSuccessData(data);
        setInviteForm({ fullName: "", email: "", phone: "", department: dbDepartments[0]?.name || "Engineering", designation: "", role: "employee" });
      }
    } catch { setInviteError("Network error. Please try again."); }
    finally { setIsSubmittingInvite(false); }
  };

  const openInviteModal = (defaultRole = "employee") => {
    const validRole = typeof defaultRole === "string" && ["hr_manager", "hr_executive", "team_lead", "manager", "employee"].includes(defaultRole)
      ? defaultRole
      : "employee";
    const isHrTarget = ["hr_manager", "hr_executive"].includes(validRole);
    const initialRole = (isHrTarget && userRole !== "ADMIN") ? "employee" : validRole;
    setInviteForm((prev) => ({ ...prev, role: initialRole }));
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
          <button onClick={() => router.push("/login")}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition">
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  const displayName = employeeProfile?.full_name || company?.name || "Member";
  const avatar = displayName.charAt(0).toUpperCase();

  // ── MAIN LAYOUT ─────────────────────────────────────────────────────────────
  // ── MAIN LAYOUT ─────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50/50 text-slate-800 overflow-hidden font-sans">

      {/* --- SIDEBAR --- */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs md:hidden" />
      )}

      <aside className={`
        fixed md:relative z-50 h-full w-64 flex flex-col
        bg-white/90 backdrop-blur-xl border-r border-sky-100/90 shadow-sm
        transition-transform duration-300
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}>
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-sky-100/80">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-sky-500/20">
            {company?.name?.charAt(0)?.toUpperCase() || "H"}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">{company?.name || "Workspace"}</p>
            <p className="text-[10px] text-sky-600 font-semibold uppercase tracking-wider">HRMS Portal</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="ml-auto md:hidden text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>

        {/* User Profile */}
        <div className="px-4 py-4 border-b border-sky-100/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm">
              {avatar}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-900 truncate">{displayName}</p>
              <p className="text-[10px] text-slate-500 truncate">{employeeProfile?.email || userSession?.email}</p>
            </div>
          </div>
          <div className="mt-2.5">
            <RoleBadge role={userRole} />
          </div>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          <p className="px-3 mb-2 text-[9px] font-bold text-sky-800/60 uppercase tracking-widest">Navigation</p>
          {NAV_ITEMS.filter((item) => !(item.key === "leave-requests" && userRole === "ADMIN")).map((item) => {
            const active = activeTab === item.key;
            return (
              <button key={item.key}
                onClick={() => { setActiveTab(item.key); setSidebarOpen(false); }}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                  ${active
                    ? "bg-sky-600 text-white shadow-md shadow-sky-500/20"
                    : "text-slate-600 hover:text-sky-900 hover:bg-sky-50/80"
                  }
                `}
              >
                <span className="text-base leading-none">{item.icon}</span>
                <span>{item.label}</span>
                {item.key === "employees" && (
                  <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-md ${active ? "bg-white/20 text-white" : "bg-sky-100 text-sky-700"}`}>
                    {employees.length}
                  </span>
                )}
                {item.key === "departments" && (
                  <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-md ${active ? "bg-white/20 text-white" : "bg-sky-100 text-sky-700"}`}>
                    {dbDepartments.length}
                  </span>
                )}
              </button>
            );
          })}

          {canInvite && (
            <>
              <div className="pt-4 pb-1">
                <p className="px-3 mb-2 text-[9px] font-bold text-sky-800/60 uppercase tracking-widest">Actions</p>
              </div>
              <button
                onClick={() => { openInviteModal("employee"); setSidebarOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-sky-700 hover:bg-sky-100/70 border border-sky-200 transition-all"
              >
                <span className="text-base">＋</span>
                <span>Invite Employee</span>
              </button>
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="px-4 pb-5 pt-3 border-t border-sky-100/80 space-y-3">
          {/* Realtime Status */}
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-sky-50/70 border border-sky-100">
            <div className="flex items-center gap-2 text-[10px] text-slate-500">
              <span className={`w-1.5 h-1.5 rounded-full ${realtimeStatus === "active" || realtimeStatus === "synced" ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
              <span>Realtime</span>
            </div>
            <span className={`text-[10px] font-bold font-mono ${realtimeStatus === "active" || realtimeStatus === "synced" ? "text-emerald-700" : "text-amber-700"}`}>
              {realtimeStatus}
            </span>
          </div>

          <button onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-sky-100 hover:border-rose-200 transition-all">
            <span>→</span>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* --- MAIN AREA --- */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top Bar */}
        <header className="h-14 shrink-0 flex items-center justify-between px-5 border-b border-sky-100/90 bg-white/80 backdrop-blur-md shadow-2xs">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-sky-50">
              ☰
            </button>
            <div>
              <p className="text-sm font-bold text-slate-900">
                {NAV_ITEMS.find((n) => n.key === activeTab)?.label || "Dashboard"}
              </p>
              <p className="text-[10px] text-slate-500 hidden sm:block">
                {company?.name} · Real-Time Workspace
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {canInvite && (
              <button onClick={() => openInviteModal("employee")}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition shadow-md shadow-sky-500/20">
                ＋ Invite
              </button>
            )}
            <div className="hidden sm:block"><RoleBadge role={userRole} /></div>
          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1 overflow-y-auto p-5 lg:p-7 space-y-6 animate-fadeIn">

          {/* --- TAB: OVERVIEW --- */}
          {activeTab === "overview" && (
            <>
              {/* Welcome Banner */}
              <div className="relative rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-700 p-6 md:p-8 overflow-hidden shadow-xl shadow-indigo-500/10">
                <div className="relative z-10">
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/15 text-white/90 text-[10px] font-semibold uppercase tracking-wider border border-white/20 mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                    {userRole.replace("_", " ")} Portal Active
                  </div>
                  <h1 className="text-xl md:text-3xl font-extrabold text-white tracking-tight">
                    Welcome back, {displayName}!
                  </h1>
                  <p className="mt-1.5 text-sm text-white/70 max-w-xl leading-relaxed">
                    {isAdmin && "Company Owner Dashboard — Full control over organization, team, setup, and workspace operations."}
                    {isHR && !isAdmin && "HR Management Portal — Manage employees, send invitations, and oversee onboarding workflows."}
                    {isManager && !isHR && "Manager Portal — Monitor team directory, department stats, and attendance records."}
                    {isStaff && "Employee Workspace — View your profile, check-in attendance, and explore your team directory."}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-4">
                    <div className="text-xs text-white/60">
                      Account: <span className="text-white font-mono font-medium">{employeeProfile?.email || userSession?.email}</span>
                    </div>
                    {employeeProfile?.username && (
                      <div className="text-xs text-white/60">
                        Username: <span className="text-white font-bold font-mono">@{employeeProfile.username}</span>
                      </div>
                    )}
                  </div>
                </div>
                {/* Background Pattern */}
                <div className="absolute right-0 inset-y-0 w-1/2 pointer-events-none opacity-10"
                  style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "20px 20px" }}
                />
              </div>

              {/* ADMIN — Owner Dashboard */}
              {isAdmin ? (
                <OwnerDashboard
                  company={company}
                  employees={employees}
                  userSession={userSession}
                  employeeProfile={employeeProfile}
                  onOpenInviteModal={() => openInviteModal("hr_manager")}
                  renderRoleBadge={(r) => <RoleBadge role={r} />}
                  renderStatusBadge={(s) => <StatusBadge status={s} />}
                />
              ) : (
                <>
                  {/* Stat Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    <StatCard label="Monthly Leave Allowance" value="3.0 Days" sub="Auto resets 1st of month" icon="📅" accent="indigo" />
                    <StatCard label="Available Leave Balance" value="3.0 Days" sub="Active monthly quota" icon="✨" accent="emerald" />
                    <StatCard label="Total Staff" value={employees.length} sub="Registered members" icon="⊞" accent="cyan" />
                    <StatCard label={isHR ? "Pending Offers" : "Your Role"} value={isHR ? pendingCount : (ROLE_MAP[userRole]?.label || userRole)} sub={isHR ? "Awaiting acceptance" : "Access tier"} icon="⊟" accent="amber" />
                  </div>

                  {/* Profile + Attendance Row */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* Profile Card */}
                    <div className="lg:col-span-2 bg-white border border-sky-100 rounded-2xl p-6 space-y-5 shadow-2xs">
                      <h3 className="text-sm font-bold text-slate-900 border-b border-sky-100 pb-4">My Profile Details</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        {[
                          { label: "Full Name", value: employeeProfile?.full_name || company?.name || "N/A" },
                          { label: "Department", value: employeeProfile?.department || "General" },
                          { label: "Designation", value: employeeProfile?.designation || "N/A" },
                          { label: "Email", value: employeeProfile?.email || userSession?.email },
                          { label: "Username", value: employeeProfile?.username ? `@${employeeProfile.username}` : "N/A", mono: true },
                          { label: "Status", value: employeeProfile?.status || "active", badge: true },
                        ].map(({ label, value, mono, badge }) => (
                          <div key={label} className="space-y-1">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
                            {badge
                              ? <StatusBadge status={value} />
                              : <p className={`text-sm font-semibold ${mono ? "text-sky-700 font-mono" : "text-slate-800"}`}>{value}</p>
                            }
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Attendance Card */}
                    <AttendanceCard />
                  </div>

                  {/* Monthly Working Hours Widget */}
                  <MonthlyWorkingHoursWidget />

                  {/* Leave Request Quick Action Banner */}
                  <div className="bg-white border border-sky-100 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-2xs">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <span>✈️</span> {isHR ? "HR Leave Approval Inbox" : "Employee Leave Request Portal"}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        {isHR
                          ? "Review, approve, or reject employee leave requests across the company with custom feedback notes."
                          : "You have 3.0 days available leave quota for this month. Submit requests for HR approval with automatic monthly refresh and date range validation."}
                      </p>
                    </div>
                    <button
                      onClick={() => setActiveTab("leave-requests")}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white text-xs font-bold shadow-md shadow-sky-500/20 transition-all shrink-0 cursor-pointer"
                    >
                      {isHR ? "Review HR Approval Inbox →" : "Apply / Manage Leaves →"}
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* --- TAB: ATTENDANCE --- */}
          {activeTab === "attendance" && (
            <AttendancePage userRole={userRole} />
          )}

          {/* --- TAB: WORK CALENDAR --- */}
          {activeTab === "calendar" && (
            <CompanyCalendar />
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
              <EmployeeDocumentManager />
            ) : (
              <MyDocumentsCard />
            )
          )}

          {/* --- TAB: TEAM DIRECTORY --- */}
          {activeTab === "employees" && (
            <div className="bg-white border border-sky-100 rounded-2xl overflow-hidden shadow-2xs">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-5 border-b border-sky-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    Team Directory
                    <span className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 text-[10px] font-mono border border-sky-100">
                      {filtered.length}/{employees.length}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {canInvite ? "Manage employee accounts and credential status" : "Browse colleagues across departments"}
                  </p>
                </div>
                {canInvite && (
                  <button onClick={() => openInviteModal("employee")}
                    className="self-start sm:self-auto flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition shadow-sm cursor-pointer">
                    ＋ Invite Member
                  </button>
                )}
              </div>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row items-center gap-3 px-6 py-3 bg-sky-50/40 border-b border-sky-100">
                <div className="relative flex-1 w-full sm:max-w-64">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
                  <input type="text" placeholder="Search name, email, department…" value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-sky-50/50 border border-sky-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-sky-400 focus:outline-none focus:border-sky-500 transition" />
                </div>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                  className="bg-white border border-sky-200 text-slate-800 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-sky-500 w-full sm:w-auto cursor-pointer">
                  <option value="all">All Members ({employees.length})</option>
                  <option value="active">Active ({activeCount})</option>
                  <option value="pending_offer">Pending ({pendingCount})</option>
                </select>
              </div>

              {/* Table */}
              {loadingEmployees ? (
                <div className="py-16 flex items-center justify-center gap-2 text-slate-500 text-xs">
                  <div className="w-4 h-4 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
                  Loading directory…
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-16 text-center text-slate-500">
                  <p className="text-2xl mb-2">⊞</p>
                  <p className="text-sm">No members match your filter.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left min-w-[640px]">
                    <thead>
                      <tr className="border-b border-sky-100 bg-sky-50/50">
                        {["Member", "Role", "Department", "Joining Date", "Username", "Status"].map((h) => (
                          <th key={h} className="py-3 px-4 text-[10px] font-bold text-sky-900 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sky-100">
                      {filtered.map((emp) => (
                        <tr key={emp.id} className="hover:bg-sky-50/50 transition-colors group">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 flex items-center justify-center font-bold text-xs shrink-0">
                                {emp.full_name?.charAt(0)?.toUpperCase() || "?"}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                                  {emp.full_name}
                                  {emp.auth_user_id && onlineUserIds.has(emp.auth_user_id) && (
                                    <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-bold">
                                      <span className="w-1 h-1 rounded-full bg-emerald-500" />Online
                                    </span>
                                  )}
                                </div>
                                <div className="text-slate-500 text-[10px]">{emp.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4"><RoleBadge role={emp.role} /></td>
                          <td className="py-3.5 px-4">
                            <p className="font-medium text-slate-800">{emp.department || "General"}</p>
                            <p className="text-slate-500 text-[10px]">{emp.designation || "—"}</p>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-600 text-[11px]">
                            {emp.joining_date ? new Date(emp.joining_date).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) : "—"}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-sky-700 font-semibold">
                            {emp.username ? `@${emp.username}` : <span className="text-slate-400 font-sans italic">Pending</span>}
                          </td>
                          <td className="py-3.5 px-4"><StatusBadge status={emp.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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

          {/* --- TAB: SETTINGS --- */}
          {activeTab === "settings" && (
            <div className="max-w-3xl space-y-6">
              <form onSubmit={handleProfileSave} className="bg-white border border-sky-100 rounded-2xl overflow-hidden shadow-2xs">
                {/* Profile Header & Photo Upload */}
                <div className="bg-gradient-to-r from-sky-100 via-blue-50 to-indigo-50 border-b border-sky-100 px-6 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
                  <div className="flex items-center gap-4">
                    <div className="relative group shrink-0">
                      {profileForm.avatarUrl ? (
                        <img
                          src={profileForm.avatarUrl}
                          alt="Profile Avatar"
                          className="w-20 h-20 rounded-2xl object-cover border-2 border-sky-300 shadow-md"
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white font-extrabold text-3xl shadow-md">
                          {avatar}
                        </div>
                      )}
                      <label className="absolute inset-0 rounded-2xl bg-slate-900/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer text-white text-xs font-bold gap-1">
                        📷 Change
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarChange}
                          className="hidden"
                        />
                      </label>
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-lg font-bold text-slate-900 truncate">{displayName}</h2>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{employeeProfile?.email || userSession?.email}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <RoleBadge role={userRole} />
                        <span className="text-[10px] font-mono font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          🔒 {employeeProfile?.employee_id || `EMP-${employeeProfile?.id?.slice(0, 5)?.toUpperCase() || "001"}`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <label className="cursor-pointer px-4 py-2 rounded-xl bg-white hover:bg-sky-50 text-sky-700 border border-sky-200 text-xs font-semibold transition flex items-center gap-2 shadow-2xs shrink-0 self-stretch sm:self-auto justify-center">
                    📷 Upload Photo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Notifications */}
                {profileMsg.error && (
                  <div className="mx-6 mt-6 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                    <span>⚠️</span>
                    <span>{profileMsg.error}</span>
                  </div>
                )}
                {profileMsg.success && (
                  <div className="mx-6 mt-6 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
                    <span>🎉</span>
                    <span>{profileMsg.success}</span>
                  </div>
                )}

                <div className="p-6 space-y-6">
                  {/* SECTION 1: Locked / Non-Editable Official Records */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-sky-100 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <span>Official Workspace Records</span>
                      <span className="text-[10px] text-amber-700 normal-case font-medium flex items-center gap-1">
                        🔒 Read-Only Fields (Managed by Admin)
                      </span>
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Employee ID (LOCKED) */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                          <span>Employee ID *</span>
                          <span className="text-amber-700 font-semibold normal-case">🔒 Not Editable</span>
                        </label>
                        <input
                          type="text"
                          disabled
                          readOnly
                          value={employeeProfile?.employee_id || `EMP-${employeeProfile?.id?.slice(0, 5)?.toUpperCase() || "001"}`}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-sky-50/50 border border-sky-200 text-amber-800 font-mono font-bold text-xs cursor-not-allowed select-none outline-none"
                        />
                      </div>

                      {/* Work Email (LOCKED) */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Official Work Email 🔒
                        </label>
                        <input
                          type="email"
                          disabled
                          readOnly
                          value={employeeProfile?.email || userSession?.email || ""}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-sky-50/50 border border-sky-200 text-slate-600 font-mono text-xs cursor-not-allowed select-none outline-none"
                        />
                      </div>

                      {/* Department (LOCKED) */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Assigned Department 🔒
                        </label>
                        <input
                          type="text"
                          disabled
                          readOnly
                          value={employeeProfile?.department || "General"}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-sky-50/50 border border-sky-200 text-slate-600 text-xs cursor-not-allowed select-none outline-none"
                        />
                      </div>

                      {/* Username (LOCKED) */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Username 🔒
                        </label>
                        <input
                          type="text"
                          disabled
                          readOnly
                          value={employeeProfile?.username ? `@${employeeProfile.username}` : "N/A"}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-sky-50/50 border border-sky-200 text-sky-700 font-mono text-xs cursor-not-allowed select-none outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* SECTION 2: Editable Personal Details */}
                  <div className="space-y-4 pt-2">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-sky-100 pb-2">
                      Personal Profile & Contact Info (Editable)
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* First Name */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          First Name
                        </label>
                        <input
                          type="text"
                          value={profileForm.firstName}
                          onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })}
                          placeholder="e.g. Alex"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-sky-50/50 border border-sky-200 text-slate-800 placeholder-sky-400 text-xs focus:border-sky-500 outline-none transition"
                        />
                      </div>

                      {/* Last Name */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Last Name
                        </label>
                        <input
                          type="text"
                          value={profileForm.lastName}
                          onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })}
                          placeholder="e.g. Morgan"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-sky-50/50 border border-sky-200 text-slate-800 placeholder-sky-400 text-xs focus:border-sky-500 outline-none transition"
                        />
                      </div>

                      {/* Personal Email */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Personal Email Address
                        </label>
                        <input
                          type="email"
                          value={profileForm.personalEmail}
                          onChange={(e) => setProfileForm({ ...profileForm, personalEmail: e.target.value })}
                          placeholder="alex.personal@gmail.com"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-sky-50/50 border border-sky-200 text-slate-800 placeholder-sky-400 text-xs focus:border-sky-500 outline-none transition"
                        />
                      </div>

                      {/* Phone Number */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Phone Number
                        </label>
                        <input
                          type="tel"
                          value={profileForm.phone}
                          onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                          placeholder="+1 (555) 234-5678"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-sky-50/50 border border-sky-200 text-slate-800 placeholder-sky-400 text-xs focus:border-sky-500 outline-none transition"
                        />
                      </div>

                      {/* Joining Date */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                          <span>Date of Joining 📅</span>
                          <span className="text-sky-600 font-semibold normal-case text-[10px]">Editable</span>
                        </label>
                        <input
                          type="date"
                          value={profileForm.joiningDate}
                          onChange={(e) => setProfileForm({ ...profileForm, joiningDate: e.target.value })}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-sky-50/50 border border-sky-200 text-slate-800 text-xs focus:border-sky-500 outline-none transition cursor-pointer"
                        />
                      </div>
                    </div>

                    {/* Address */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Residential / Postal Address
                      </label>
                      <textarea
                        rows={2}
                        value={profileForm.address}
                        onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                        placeholder="123 Tech Boulevard, Suite 400, San Francisco, CA 94107"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-sky-50/50 border border-sky-200 text-slate-800 placeholder-sky-400 text-xs focus:border-sky-500 outline-none transition resize-none"
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-4 border-t border-sky-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-bold hover:bg-rose-100 transition w-full sm:w-auto justify-center cursor-pointer"
                    >
                      🚪 Sign Out
                    </button>

                    <button
                      type="submit"
                      disabled={isSavingProfile}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold disabled:opacity-50 transition shadow-md shadow-sky-500/20 w-full sm:w-auto justify-center cursor-pointer"
                    >
                      {isSavingProfile ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Saving Profile...</span>
                        </>
                      ) : (
                        <span>💾 Save Profile Changes</span>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}
        </main>
      </div>

      {/* --- INVITE MODAL --- */}
      {isInviteModalOpen && canInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white border border-sky-100 rounded-2xl w-full max-w-md shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-sky-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Invite Employee</h3>
                <p className="text-xs text-slate-500 mt-0.5">Send invitation & auto-generate credentials</p>
              </div>
              <button onClick={closeInviteModal}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-sky-50 text-slate-400 hover:text-slate-700 text-sm transition cursor-pointer">
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
              {inviteError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                  <span>⚠</span> {inviteError}
                </div>
              )}

              {inviteSuccessData ? (
                <div className="space-y-4">
                  {inviteSuccessData.emailSent ? (
                    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center space-y-1">
                      <p className="text-sm font-bold text-emerald-800">🎉 Invitation Sent!</p>
                      <p className="text-xs text-slate-600">Email delivered to <strong className="text-slate-900 font-mono">{inviteSuccessData.employee?.email}</strong></p>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
                      <p className="font-bold">⚠ Email delivery issue — share links manually</p>
                      <p className="text-slate-600">{inviteSuccessData.emailErrorMessage}</p>
                    </div>
                  )}
                  <div className="bg-sky-50/40 rounded-xl border border-sky-100 p-4 space-y-3 text-xs">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pb-2 border-b border-sky-100">Offer Links</p>
                    <div>
                      <p className="text-emerald-700 font-semibold mb-1">✓ Accept Offer:</p>
                      <div className="bg-white rounded-lg p-2 border border-sky-200 font-mono text-slate-800 text-[10px] break-all select-all">{inviteSuccessData.inviteUrls?.acceptUrl}</div>
                    </div>
                    <div>
                      <p className="text-rose-700 font-semibold mb-1">✕ Decline Offer:</p>
                      <div className="bg-white rounded-lg p-2 border border-sky-200 font-mono text-slate-800 text-[10px] break-all select-all">{inviteSuccessData.inviteUrls?.declineUrl}</div>
                    </div>
                  </div>
                  <button onClick={closeInviteModal}
                    className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition shadow-md shadow-sky-500/20 cursor-pointer">
                    Done & Close
                  </button>
                </div>
              ) : (
                <form onSubmit={handleInviteSubmit} className="space-y-4">
                  {[
                    { label: "Full Name *", name: "fullName", type: "text", placeholder: "e.g. Sarah Jenkins", required: true },
                    { label: "Work Email *", name: "email", type: "email", placeholder: "sarah@company.com", required: true },
                  ].map((f) => (
                    <div key={f.name}>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{f.label}</label>
                      <input type={f.type} name={f.name} placeholder={f.placeholder} required={f.required}
                        value={inviteForm[f.name]} onChange={(e) => setInviteForm({ ...inviteForm, [e.target.name]: e.target.value })}
                        className="w-full px-3 py-2.5 rounded-xl bg-sky-50/50 border border-sky-200 text-slate-800 placeholder-sky-400 text-xs focus:border-sky-500 outline-none transition" />
                    </div>
                  ))}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Role *</label>
                      <select name="role" value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                        className="w-full px-3 py-2.5 rounded-xl bg-white border border-sky-200 text-slate-800 text-xs focus:border-sky-500 outline-none transition cursor-pointer">
                        <option value="employee">Employee</option>
                        {userRole === "ADMIN" && (
                          <>
                            <option value="hr_manager">HR Manager</option>
                            <option value="hr_executive">HR Executive</option>
                          </>
                        )}
                        <option value="team_lead">Team Lead</option>
                        <option value="manager">Manager</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Department *</label>
                      <select name="department" value={inviteForm.department} onChange={(e) => setInviteForm({ ...inviteForm, department: e.target.value })}
                        className="w-full px-3 py-2.5 rounded-xl bg-white border border-sky-200 text-slate-800 text-xs focus:border-sky-500 outline-none transition cursor-pointer">
                        {(dbDepartments.length > 0 ? dbDepartments.map((d) => d.name) : ["Engineering", "Human Resources", "Sales", "Finance", "Operations", "Design", "Support", "General"]).map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { label: "Designation", name: "designation", placeholder: "e.g. Senior Dev" },
                      { label: "Phone", name: "phone", placeholder: "+1 555-0199" },
                    ].map((f) => (
                      <div key={f.name}>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{f.label}</label>
                        <input type="text" name={f.name} placeholder={f.placeholder}
                          value={inviteForm[f.name]} onChange={(e) => setInviteForm({ ...inviteForm, [e.target.name]: e.target.value })}
                          className="w-full px-3 py-2.5 rounded-xl bg-sky-50/50 border border-sky-200 text-slate-800 placeholder-sky-400 text-xs focus:border-sky-500 outline-none transition" />
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button type="button" onClick={closeInviteModal}
                      className="w-full sm:flex-1 py-2.5 rounded-xl bg-sky-100 hover:bg-sky-200 text-slate-700 text-xs font-semibold transition cursor-pointer">
                      Cancel
                    </button>
                    <button type="submit" disabled={isSubmittingInvite}
                      className="w-full sm:flex-1 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition shadow-md shadow-sky-500/20 cursor-pointer">
                      {isSubmittingInvite
                        ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Sending…</>
                        : "Send Invitation"
                      }
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- DEPARTMENT MODAL --- */}
      <DepartmentManagementModal
        isOpen={isDeptModalOpen}
        onClose={() => setIsDeptModalOpen(false)}
        onRefreshData={fetchDepts}
      />

      {/* --- REALTIME TOAST --- */}
      {realtimeToast && (
        <div className="fixed bottom-5 right-5 z-[100] max-w-xs animate-toastIn">
          <div className={`flex items-start gap-3 p-4 rounded-xl border backdrop-blur-md shadow-2xl ${realtimeToast.type === "success" ? "bg-emerald-950/95 border-emerald-500/30 text-emerald-100"
            : realtimeToast.type === "error" ? "bg-rose-950/95 border-rose-500/30 text-rose-100"
              : "bg-[#1a1e2a]/95 border-indigo-500/30 text-slate-100"
            }`}>
            <span className="text-lg shrink-0">
              {realtimeToast.type === "success" ? "✓" : realtimeToast.type === "error" ? "⚠" : "◈"}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">{realtimeToast.title}</p>
              <p className="text-xs mt-0.5 leading-relaxed opacity-80">{realtimeToast.message}</p>
            </div>
            <button onClick={() => setRealtimeToast(null)}
              className="text-xs opacity-50 hover:opacity-100 shrink-0 transition">✕</button>
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
