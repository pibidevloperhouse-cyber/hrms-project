"use client";

import React, { useState, useEffect } from "react";

/**
 * DepartmentSummary Component
 * Analyzes configured company departments and employee headcount distribution for the Owner.
 */
export default function DepartmentSummary({ employees = [], onManageDepartments }) {
  const [dbDepartments, setDbDepartments] = useState([]);

  useEffect(() => {
    const fetchDepts = async () => {
      try {
        const res = await fetch("/api/departments");
        if (res.ok) {
          const data = await res.json();
          if (data.departments) {
            setDbDepartments(data.departments);
          }
        }
      } catch (err) {
        console.error("Error loading departments summary:", err);
      }
    };
    fetchDepts();
  }, []);

  // Aggregate department counts from employee records
  const employeeCounts = employees.reduce((acc, emp) => {
    const dept = emp.department?.trim() || "General / Unassigned";
    acc[dept] = (acc[dept] || 0) + 1;
    return acc;
  }, {});

  // Combine DB configured departments with employee headcount
  const combinedMap = new Map();

  // 1. Add DB departments first
  dbDepartments.forEach((d) => {
    combinedMap.set(d.name, {
      name: d.name,
      code: d.code,
      count: employeeCounts[d.name] || 0,
    });
  });

  // 2. Add employee departments if not in DB departments list
  Object.entries(employeeCounts).forEach(([name, count]) => {
    if (!combinedMap.has(name)) {
      combinedMap.set(name, {
        name,
        code: null,
        count,
      });
    }
  });

  const deptList = Array.from(combinedMap.values()).map((item) => ({
    ...item,
    percentage: employees.length ? Math.round((item.count / employees.length) * 100) : 0,
  }));

  // Standard color palette for visual display
  const colorPalette = [
    "from-sky-500 to-blue-600 border-sky-500/30 text-sky-400 bg-sky-500/10",
    "from-purple-500 to-indigo-600 border-purple-500/30 text-purple-400 bg-purple-500/10",
    "from-emerald-500 to-teal-600 border-emerald-500/30 text-emerald-400 bg-emerald-500/10",
    "from-amber-500 to-orange-600 border-amber-500/30 text-amber-400 bg-amber-500/10",
    "from-rose-500 to-pink-600 border-rose-500/30 text-rose-400 bg-rose-500/10",
    "from-cyan-500 to-blue-500 border-cyan-500/30 text-cyan-400 bg-cyan-500/10",
  ];

  return (
    <div className="bg-white border border-sky-100 rounded-3xl p-6 sm:p-7 space-y-5 hover:border-sky-300 transition duration-300 shadow-2xs flex flex-col justify-between">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-sky-100 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-50 border border-sky-100 text-sky-600 flex items-center justify-center text-lg">
              🏢
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">Departments Summary</h3>
              <p className="text-xs text-slate-500">Company department structure & headcount</p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full bg-sky-50 text-sky-700 text-xs font-bold border border-sky-200">
            {deptList.length} {deptList.length === 1 ? "Dept" : "Depts"}
          </span>
        </div>

        {deptList.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <p className="text-xs text-slate-500">No departments configured yet.</p>
            <p className="text-[11px] text-slate-400">Create departments to categorize your company workforce.</p>
          </div>
        ) : (
          <div className="space-y-3.5 max-h-52 overflow-y-auto pr-1">
            {deptList.map((dept, index) => {
              const style = colorPalette[index % colorPalette.length];
              return (
                <div key={dept.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-slate-800">{dept.name}</span>
                      {dept.code && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 font-mono border border-sky-200">
                          {dept.code}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-slate-600 font-medium">{dept.count} {dept.count === 1 ? "member" : "members"}</span>
                      <span className="text-slate-400 font-mono text-[11px]">({dept.percentage}%)</span>
                    </div>
                  </div>
                  {/* Dynamic Progress Bar */}
                  <div className="w-full bg-sky-50 rounded-full h-2 overflow-hidden border border-sky-100">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${style.split(" ")[0]} ${style.split(" ")[1]} transition-all duration-500`}
                      style={{ width: `${Math.max(dept.percentage, 6)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {onManageDepartments && (
        <div className="pt-2">
          <button
            onClick={onManageDepartments}
            className="w-full py-2.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-semibold transition flex items-center justify-center space-x-2 shadow-2xs"
          >
            <span>⚙️ Manage / Edit Departments</span>
          </button>
        </div>
      )}
    </div>
  );
}
