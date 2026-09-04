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

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs flex flex-col justify-between">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center border border-sky-200/60">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">Department Distribution</h3>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200">
            {deptList.length} {deptList.length === 1 ? "Division" : "Divisions"}
          </span>
        </div>

        {deptList.length === 0 ? (
          <div className="py-8 text-center space-y-2 bg-slate-50/40 rounded-xl border border-dashed border-slate-200">
            <p className="text-xs text-slate-600 font-medium">No departments configured yet.</p>
            <p className="text-[11px] text-slate-400">Create departments to categorize your company workforce.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-52 overflow-y-auto pr-1">
            {deptList.map((dept) => {
              return (
                <div key={dept.name} className="p-2.5 rounded-xl bg-slate-50/50 border border-slate-200/60 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{dept.name}</span>
                      {dept.code && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white text-slate-600 font-mono border border-slate-200">
                          {dept.code}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600 font-medium">{dept.count} {dept.count === 1 ? "member" : "members"}</span>
                      <span className="text-slate-400 font-mono text-[11px]">({dept.percentage}%)</span>
                    </div>
                  </div>
                  {/* Progress Bar */}
                  <div className="w-full bg-slate-200/70 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-sky-600 transition-all duration-500"
                      style={{ width: `${Math.max(dept.percentage, 4)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {onManageDepartments && (
        <div className="pt-2 border-t border-slate-100">
          <button
            onClick={onManageDepartments}
            className="w-full py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold transition flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
          >
            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Manage Department Structure</span>
          </button>
        </div>
      )}
    </div>
  );
}
