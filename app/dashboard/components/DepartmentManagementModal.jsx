"use client";

import React, { useState, useEffect } from "react";

/**
 * DepartmentManagementModal Component
 * Provides full CRUD interface (Create, Read, Update, Delete) for Company Departments.
 * Exclusively designed for the Company Owner (Admin).
 */
export default function DepartmentManagementModal({ isOpen, onClose, onRefreshData }) {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form State
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch departments on load
  const fetchDepartments = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/departments");
      if (res.ok) {
        const data = await res.json();
        setDepartments(data.departments || []);
      } else {
        const err = await res.json();
        setError(err.message || "Failed to load departments.");
      }
    } catch (err) {
      console.error("Error loading departments:", err);
      setError("Network error loading departments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDepartments(false);
    }
  }, [isOpen]);

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleCreateOrUpdate = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!formData.name.trim()) {
      setError("Department name is required.");
      return;
    }

    setIsSubmitting(true);

    try {
      const method = isEditing ? "PUT" : "POST";
      const payload = isEditing ? { id: editingId, ...formData } : formData;

      const res = await fetch("/api/departments", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Operation failed.");
      } else {
        setSuccess(data.message || "Department saved successfully.");
        setFormData({ name: "", code: "", description: "" });
        setIsEditing(false);
        setEditingId(null);
        fetchDepartments();
        if (onRefreshData) onRefreshData();
      }
    } catch (err) {
      console.error("Save department error:", err);
      setError("Network error while saving department.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (dept) => {
    setIsEditing(true);
    setEditingId(dept.id);
    setFormData({
      name: dept.name || "",
      code: dept.code || "",
      description: dept.description || "",
    });
    setError("");
    setSuccess("");
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditingId(null);
    setFormData({ name: "", code: "", description: "" });
    setError("");
    setSuccess("");
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete department "${name}"?`)) {
      return;
    }

    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/departments?id=${id}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Failed to delete department.");
      } else {
        setSuccess(`Department "${name}" deleted successfully.`);
        fetchDepartments();
        if (onRefreshData) onRefreshData();
      }
    } catch (err) {
      console.error("Delete department error:", err);
      setError("Network error deleting department.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white border border-sky-100 rounded-3xl w-full max-w-2xl p-6 sm:p-8 space-y-6 shadow-2xl relative max-h-[90vh] flex flex-col justify-between">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-sky-100 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-50 border border-sky-100 text-sky-600 flex items-center justify-center text-lg">
              🏢
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Department Control Center</h3>
              <p className="text-xs text-slate-500">Owner Access: Create, edit & delete company departments</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-sky-50 text-slate-400 hover:text-slate-700 flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>

        {/* Feedback Alerts */}
        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center space-x-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium flex items-center space-x-2">
            <span>✅</span>
            <span>{success}</span>
          </div>
        )}

        <div className="overflow-y-auto space-y-6 pr-1 flex-1">
          {/* Create / Edit Form */}
          <form onSubmit={handleCreateOrUpdate} className="bg-sky-50/50 p-4 rounded-2xl border border-sky-100 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 text-xs">
                {isEditing ? `✏️ Edit Department` : `➕ Create New Department`}
              </span>
              {isEditing && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="text-slate-500 hover:text-slate-800 text-[11px] underline"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-sky-900 font-semibold uppercase tracking-wider mb-1">
                  Department Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g. Engineering, Sales, Human Resources"
                  required
                  className="w-full px-3.5 py-2 rounded-xl bg-white border border-sky-200 text-slate-800 placeholder-sky-400 focus:border-sky-500 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-sky-900 font-semibold uppercase tracking-wider mb-1">
                  Dept Code
                </label>
                <input
                  type="text"
                  name="code"
                  value={formData.code}
                  onChange={handleInputChange}
                  placeholder="ENG, HR, SLS"
                  className="w-full px-3.5 py-2 rounded-xl bg-white border border-sky-200 text-slate-800 uppercase placeholder-sky-400 focus:border-sky-500 outline-none transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-sky-900 font-semibold uppercase tracking-wider mb-1">
                Description / Scope
              </label>
              <input
                type="text"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Brief summary of department functions..."
                className="w-full px-3.5 py-2 rounded-xl bg-white border border-sky-200 text-slate-800 placeholder-sky-400 focus:border-sky-500 outline-none transition"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs transition shadow-md shadow-sky-500/20 disabled:opacity-50 flex items-center space-x-2"
              >
                {isSubmitting ? (
                  <>
                    <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full"></span>
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>{isEditing ? "Update Department" : "Create Department"}</span>
                )}
              </button>
            </div>
          </form>

          {/* Department List */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Configured Departments ({departments.length})
            </h4>

            {loading ? (
              <div className="py-6 text-center text-slate-500 text-xs">Loading departments...</div>
            ) : departments.length === 0 ? (
              <div className="py-6 text-center text-slate-500 text-xs bg-sky-50/50 rounded-2xl border border-sky-100">
                No custom departments created yet. Use the form above to add your first department.
              </div>
            ) : (
              <div className="space-y-2">
                {departments.map((dept) => (
                  <div
                    key={dept.id}
                    className="p-3.5 rounded-2xl bg-sky-50/40 border border-sky-100 flex items-center justify-between hover:border-sky-300 transition"
                  >
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-slate-900 flex items-center space-x-2">
                        <span>{dept.name}</span>
                        {dept.code && (
                          <span className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 text-[10px] font-mono border border-sky-200">
                            {dept.code}
                          </span>
                        )}
                      </div>
                      {dept.description && (
                        <p className="text-[11px] text-slate-500">{dept.description}</p>
                      )}
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => startEdit(dept)}
                        className="px-3 py-1 rounded-lg bg-sky-100 hover:bg-sky-200 text-slate-700 text-[11px] font-medium border border-sky-200 transition"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        onClick={() => handleDelete(dept.id, dept.name)}
                        className="px-3 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-medium border border-rose-200 transition"
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-sky-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-sky-100 hover:bg-sky-200 text-slate-700 text-xs font-semibold transition"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
